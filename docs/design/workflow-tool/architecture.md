# Workflow Tool 架构

## 1. 结论

| 概念 | 定义 |
| --- | --- |
| **DeerFlow** | 企业级 Agent OS / Runtime |
| **Workflow Tool** | 构建、编辑、发布、安装、调用 workflow 的工具 |
| **Published Workflow** | 用户资产，注册在「我的能力」 |
| **project_agent** | 历史代码名；可保留为内部 builder，非产品主语 |

**不应**：用户创建工作流 → 必须进 `project_agent` → 由该 Agent 保存/发布/运行一切。

**应当**：个人助手 → `workflow_builder` / `workflow_runner` 工具 → Workflow Domain Service → 独立 Builder / Gateway。

## 2. 为什么仍基于 DeerFlow

Workflow Tool 不重造以下能力，直接复用 DeerFlow：

| DeerFlow 能力 | Workflow Tool 用法 |
| --- | --- |
| `user_id`、认证 | owner、visibility、fork/install |
| `lead_agent`、custom agent | 创建、修改、运行入口 |
| thread + sandbox 路径 | 测试、运行、产物（调用者上下文） |
| Memory | 按调用者隔离，不共享作者记忆 |
| Tools / tool_groups | `workflow_builder_*`、`workflow_runner_*` |
| Skills | published workflow 可选包装为 Skill |
| Gateway / IM / Client | 多入口调用 |

## 3. 四层架构

```text
┌─────────────────────────────────────────┐
│ 1. DeerFlow Agent Layer                  │
│    lead_agent / custom_agent / tools      │
└─────────────────────────────────────────┘
                    │ 调用
                    ▼
┌─────────────────────────────────────────┐
│ 2. Workflow Builder Tool / App           │
│    Chat 创建 · patch · 打开 Builder      │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 3. Workflow Domain Service               │
│    draft / publish / fork / manifest      │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 4. Execution Adapters                    │
│    graphs/*.py · runner · LangGraph · Skill │
└─────────────────────────────────────────┘
```

### 3.1 Agent 层（工具接口）

个人助手调用的典型能力：

```text
workflow_builder.create / patch / open_builder / publish
workflow_runner.list_my_workflows / run
```

Agent **不**持久化 workflow 领域数据；持久化由 Domain Service 完成。

### 3.2 Builder App

- 复用现有 `workflow_frontend` 作为**独立页面**（一期不要求 Chat 侧边栏嵌入）。
- 流程：Chat 生成 draft → 返回 Builder URL → 编辑保存 → 测试 → 发布。

### 3.3 Domain Service（核心）

建议 API：`create_draft`、`get_draft`、`update_draft`、`validate`、`generate_runner`、`test_run`、`publish`、`fork`、`install`、`list_my_workflows`、`run_published`。

核心字段：`owner_user_id`、`visibility`、`collaborators`、`forked_from`、`workflow.draft.json`、`workflow.published.json`、`manifest.yaml`、`runner_entrypoint`、`spec_hash`。

存储演进：当前可落在 `projects/{name}/`，元数据须显式带 owner，避免全局目录误当用户资产。

### 3.4 执行适配器

| 形态 | 阶段 |
| --- | --- |
| `src/graphs/{name}.py` | **一期默认**（已有样例） |
| Python runner | 简单流程 |
| LangGraph + Send/subagent | 复杂 DAG（可选，含历史 `decompose_v2` 思路） |
| Skill 包装 | Agent 发现与调用 |
| 独立 App | 后续 |

## 4. 端到端流程

### 创建与发布

```text
用户使用个人助手描述需求
  -> workflow_builder / workflow-code-generator
  -> draft + workflow.json + 初始 runner/graph
  -> 打开独立 Workflow Builder
  -> 保存 · 测试
  -> publish -> manifest -> 「我的能力」
```

### 运行

```text
用户请求（Chat / Gateway / IM）
  -> 个人助手或 custom agent
  -> 从「我的能力」解析 published workflow
  -> runner/graph 执行（调用者 sandbox / memory / credentials）
```

### 分享 / fork

```text
owner publish（visibility: private | team | public）
  -> 他人 fork/install
  -> 复制 spec + 代码 + manifest 到新 owner
  -> 执行仅用 fork 安装者自己的数据上下文
```

## 5. 建议代码布局

```text
workflow_frontend/                          # Builder UI

backend/app/gateway/routers/workflows.py     # HTTP API

backend/packages/harness/deerflow/workflows/   # 领域层（新建）
  spec.py storage.py registry.py publisher.py runner.py codegen.py

backend/packages/harness/deerflow/tools/builtins/
  workflow_builder_tool.py
  workflow_runner_tool.py

# 保留但非架构中心：
backend/packages/harness/deerflow/agents/project_agent/
skills/public/workflow-code-generator/
projects/{name}/                             # 过渡期产物目录
```

## 6. 设计原则

- 领域层与 Agent 图解耦。
- 执行确定性：发布后再跑固定 runner/graph，而非每次 LLM 即兴编排主流程。
- 调用者上下文隔离。
- 一期复用 `workflow.json` + 单文件 graph，不强制一节点一 py。

## 7. 一期验收

- 个人助手可发起创建并得到可打开的 Builder。
- Builder 可编辑、保存 `workflow.json`。
- 可绑定/生成可运行 graph 或 runner。
- publish 后出现在「我的能力」。
- 个人助手可按名称调用 published workflow。
- fork 后运行不泄漏原作者私有数据。
