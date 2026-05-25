# Agent/Skills 商店管理设计

## 背景

在企业场景中，管理员/开发者通过 `project_agent` 创建了多个业务 Agent 和 Skills 后，普通用户需要有统一入口来发现、了解和选用这些能力。

核心需求：

1. **商店式管理**：custom agent 和 skills 需要一个类似「应用商店」的管理界面。
2. **按权限选用**：普通用户根据自身权限和业务需要，自主选择使用哪些 Agent / Skills。
3. **Skills ≠ 工作流**：Skills 是面向任务的能力包（指令 + 工作流 + 最佳实践 + 工具）。通过 project_agent 创建的工作流可被封装为 Skills 的一部分，但 Skills 不等同于工作流。

### 架构复用总览

商店功能建立在 DeerFlow 2.0 现有基础设施之上：

| 商店需求 | 🟢 复用现有 | 🆕 需新增 |
|---------|:---:|:---:|
| **Agent 配置存储** | `agents/{name}/config.yaml` — 已有完整配置体系 | manifest.yaml（展示元数据） |
| **Agent 创建 API** | `POST /api/agents` — 已有 | 审批流程 API |
| **Agent 运行时加载** | `make_lead_agent(agent_name=...)` → `make_project_agent()` | — |
| **Skills 存储** | `skills/custom/` + `SkillStorage` 本地/远程 | manifest.yaml |
| **Skills 解析** | `parse_skill_file()` — SKILL.md YAML front-matter 解析 | — |
| **Skills 工具过滤** | `filter_tools_by_skill_allowed_tools()` | — |
| **Skills 安全扫描** | `SecurityScanner` | — |
| **Skills 沙箱挂载** | `/mnt/skills/{category}/{name}/` — SandboxMiddleware 自动挂载 | — |
| **用户认证** | AUTH_DESIGN.md：强制认证 + user ContextVar | — |
| **权限检查** | `request.state.user.system_role` | `@require_role` + Agent access 字段 |
| **前端 Agent 选择器** | 工作区中已有 Agent 下拉切换 | 商店浏览/选用页面 |
| **工作流关联** | `projects/{name}/` 目录 + workflow.published.json | Agent manifest 中声明 project 字段 |

## 概念区分

| 概念 | 定义 | 创建者 | 使用者 |
|------|------|-------|--------|
| **业务 Agent** | 面向具体业务场景的 Agent，内置工作流和 skills | 管理员/开发者（通过 project_agent） | 普通用户 |
| **Skill** | 面向任务的能力包（指令、工作流、最佳实践、工具） | 管理员/开发者 | Agent（运行时加载）；用户（选择启用） |
| **工作流** | 业务 Agent 内部的节点 DAG，每个节点为 Python 文件 | 管理员/开发者（通过 project_agent + 画布） | 业务 Agent（运行时执行） |

### 关系说明

```text
业务 Agent
  ├── 系统提示词
  ├── 模型选择
  ├── Skills（可多个）
  │     ├── Skill A：数据分析
  │     │     ├── SKILL.md（指令、最佳实践）
  │     │     ├── 工作流（通过 project_agent 创建）
  │     │     │     ├── nodes/load_data.py
  │     │     │     ├── nodes/analyze.py
  │     │     │     └── nodes/generate_chart.py
  │     │     └── tools/
  │     └── Skill B：报告生成
  │           ├── SKILL.md
  │           └── 工作流
  │                 ├── nodes/collect_results.py
  │                 └── nodes/format_report.py
  └── Tools（工具组）
```

一个关键理解：**工作流是通过 project_agent 创建的节点 DAG，它归属于某个 Skill。Skill 是更上层的概念，包含指令、工具和工作流。用户选用的是 Agent，Agent 内部加载了 Skills，Skills 内部包含了工作流。**

## 商店架构

```text
┌─────────────────────────────────────────────────────────────┐
│                    Agent / Skills Store                     │
│                        （商店前端）                          │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐              │
│  │  Agent    │  │  Skill    │  │ 我的      │              │
│  │  市场     │  │  市场     │  │  已选用    │              │
│  │           │  │           │  │           │              │
│  │ - 浏览    │  │ - 浏览    │  │ - 已启用  │              │
│  │ - 搜索    │  │ - 搜索    │  │   Agent   │              │
│  │ - 详情    │  │ - 详情    │  │ - 已启用  │              │
│  │ - 选用    │  │ - 选用    │  │   Skills  │              │
│  └───────────┘  └───────────┘  └───────────┘              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    管理后台（admin/developer）                │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐              │
│  │ 发布管理  │  │ 审批管理  │  │ 版本管理  │              │
│  │           │  │           │  │           │              │
│  │ - 新建    │  │ - 待审批  │  │ - 版本    │              │
│  │ - 编辑    │  │ - 通过/   │  │   历史    │              │
│  │ - 下架    │  │   驳回    │  │ - 回滚    │              │
│  └───────────┘  └───────────┘  └───────────┘              │
└─────────────────────────────────────────────────────────────┘
```

## Agent 商店

### Agent 发布信息

每个业务 Agent 在商店中展示以下信息：

```yaml
# agents/supplier-evaluation/manifest.yaml
name: supplier-evaluation
display_name: 供应商智能评估
version: 1.2.0
category: 供应链管理
description: >
  自动采集供应商工商信息、舆情数据，综合评估风险等级，
  生成标准化评估报告。
icon: supplier.png
tags:
  - 供应商管理
  - 风险评估
  - 采购
publisher: 采购部开发组
created_at: 2026-05-01
updated_at: 2026-05-20
required_skills:
  - business-data-query
  - sentiment-analysis
  - report-generation
access:
  roles:
    - user
  departments:
    - 采购部
    - 供应链管理部
usage_count: 1,230
rating: 4.5
```

### 用户选用流程

```text
用户浏览 Agent 市场
  -> 查看详情（功能描述、所需 skills、评价、使用量）
  -> 点击「选用」
  -> 系统检查权限（是否在 access 范围内）
  -> 权限通过 → Agent 加入「我的 Agent」列表
  -> 用户即可在工作区切换使用该 Agent
```

### Agent 生命周期

```text
draft（草稿）
  -> 管理员/开发者编辑中

review（审批中）
  -> 提交审批，等待管理员审核

published（已发布）
  -> 对授权用户可见、可用

deprecated（已弃用）
  -> 不再推荐使用，已选用用户仍可使用

archived（已归档）
  -> 完全下架，不可选用
```

## Skills 商店

### Skill 发布信息

```yaml
# skills/custom/sentiment-analysis/manifest.yaml
name: sentiment-analysis
display_name: 舆情情感分析
version: 1.0.0
category: 数据分析
description: >
  对新闻、社交媒体等舆情数据进行情感分析和关键观点提取。
  - 支持中文文本
  - 输出正/负/中性分类及置信度
  - 可提取关键实体和观点摘要
icon: sentiment.png
tags:
  - NLP
  - 舆情
  - 情感分析
publisher: AI 平台组
created_at: 2026-04-15
workflow:
  project: sentiment-analysis
  graph: src/graphs/workflow_graph.py
  nodes_count: 4
tools:
  - web_search
  - text_classifier
required_models:
  min_context: 8192
recommended_models:
  - gpt-4o
  - claude-3.5-sonnet
access:
  roles:
    - user
  departments:
    - all
usage_count: 3,560
rating: 4.7
```

### Skills 与工作流的关系

Skills 可通过 `workflow` 字段声明其内置工作流：

```yaml
# skills/custom/sentiment-analysis/manifest.yaml
workflow:
  project: sentiment-analysis         # 对应的 project_agent 项目
  graph: src/graphs/workflow_graph.py # 工作流 graph 入口
  nodes_count: 4                      # 节点数
  nodes:                              # 节点清单
    - name: fetch_data
      file: src/nodes/fetch_data.py
      description: 从数据源获取舆情文本
    - name: preprocess
      file: src/nodes/preprocess.py
      description: 文本清洗与分词
    - name: sentiment_classify
      file: src/nodes/sentiment_classify.py
      description: 情感分类
    - name: extract_insights
      file: src/nodes/extract_insights.py
      description: 关键观点提取
```

这样用户在 Skills 商店中即可了解该 Skill 内部包含什么样的工作流和处理能力。

### 用户选用 Skills

用户可以在两个层面选用 Skills：

1. **Agent 级别**：选用某个业务 Agent 后，自动获得其所需 Skills（Agent manifest 中的 `required_skills`）。
2. **个人级别**：在工作区中启用/禁用某些 Skills，适配个人使用偏好。

```text
用户工作区 -> 设置 -> Skills 管理
  ├── 已启用 Skills（来自 Agent + 个人选择）
  │     ├── business-data-query ✅
  │     ├── sentiment-analysis ✅
  │     └── report-generation ✅
  └── 可选 Skills（从商店选用）
        ├── data-visualization [选用]
        └── pdf-export [选用]
```

## 审批流程

对于企业场景，某些 Agent 或 Skills 的发布和选用可能需要审批：

```text
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Developer │     │  Admin   │     │  Store   │
│  提交发布  │ ──▶ │  审批    │ ──▶ │  上架    │
└──────────┘     └──────────┘     └──────────┘
                       │
                       ├── 通过 → 发布到商店，按 access 范围可见
                       └── 驳回 → 返回修改意见给 Developer
```

审批配置：

```yaml
store:
  publish_approval:
    agent: true           # Agent 发布需要审批
    skill: false          # Skill 发布不需要审批（可由 Developer 直接发布）
  select_approval:
    restricted_agents:    # 某些敏感 Agent 需要审批才能选用
      - financial-audit
      - hr-evaluation
```

## 商店 API

### 浏览 Agent 市场

```bash
GET /api/store/agents?category=供应链管理&page=1&size=20
```

返回可用的 Agent 列表（根据当前用户权限过滤）。

### 选用 Agent

```bash
POST /api/store/agents/supplier-evaluation/select
```

### 浏览 Skills 市场

```bash
GET /api/store/skills?category=数据分析
```

### 选用 Skill

```bash
POST /api/store/skills/sentiment-analysis/select
```

### 管理后台 API（admin/developer）

```bash
POST   /api/store/agents                    # 创建 Agent 发布
PUT    /api/store/agents/{name}             # 更新 Agent 信息
POST   /api/store/agents/{name}/publish     # 提交发布审批
POST   /api/store/agents/{name}/deprecate   # 标记弃用
POST   /api/store/agents/{name}/archive     # 归档下架

GET    /api/store/admin/pending-approvals   # 查看待审批列表
POST   /api/store/admin/approve/{id}        # 审批通过
POST   /api/store/admin/reject/{id}         # 审批驳回
```

## 与现有架构的关系

当前 DeerFlow 已有：

- Agent 创建 API：`POST /api/agents`
- Agent 配置存储：`agents/{name}/config.yaml`
- Skills 目录：`skills/custom/`
- 前端 Agent 选择器（工作区中切换 Agent）

商店功能在此基础上新增：

- `manifest.yaml`：Agent 和 Skill 的展示元数据。
- 商店前端页面：浏览、搜索、选用。
- 审批流程：发布和选用的审批链路。
- 版本管理：`releases/` 版本历史和回滚。

## 后续待明确

1. **评分与评论**：是否需要用户对 Agent/Skill 进行评分和评论。
2. **推荐算法**：基于用户部门、使用历史的智能推荐。
3. **计费集成**：如果某些 Agent 消耗较高 token 成本，是否需要配额或计费。
4. **外部 Skills 市场**：是否支持从外部导入第三方 Skills。
5. **Skills 依赖管理**：Skill 之间是否有依赖关系，如何自动解析。