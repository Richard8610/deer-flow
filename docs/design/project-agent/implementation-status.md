# 实现进展快照（相对设计文档）

> **主文档已迁至** [`../workflow-tool/implementation-status.md`](../workflow-tool/implementation-status.md)。

> **基线**：`259eda94` 及之后约 20 个 commit（至 `ad004d05`，2026-05-25）。  
> **目的**：对齐团队近期迭代与 `docs/design/project-agent/` 目标架构，指导文档修订与 graphify 增量更新。

## 1. 近期提交摘要（与 project-agent 相关）

| Commit | 作者方向 | 要点 |
| --- | --- | --- |
| `d4e8a141` … `a4614c61` | workflow_frontend | React Flow 画布、`workflow.json` 读写、浮动/嵌入式 Chat、Gateway 流式对话、模型选择、**AI 生成 workflow 落盘** |
| `ec51f1de` | project_agent + skill | **`workflow-code-generator` skill**；prompt 引导 code-gen 子任务；`_scaffold_project` 写入种子 `workflow.json` |
| `3c4deef8` … `ad004d05` | projects | 示例工程 **`ai_news_daily`**、**`travel_planner`**（含 `workflow.json`、`src/graphs/*.py`、脚本与配置） |
| `c6116bb9` | project_agent | Send API：子任务与 graph 节点对齐（既有能力加固） |
| `259eda94` / `79352b07` | docs | 设计文档归集与架构路线文字更新 |
| （本会话） | docs | [workflow-governance.md](workflow-governance.md) 治理澄清 |

## 2. 设计 vs 落地：关键差异

| 主题 | 设计文档（目标） | **当前代码落地** |
| --- | --- | --- |
| 创建主体 | 个人助手调用 workflow builder；独立 Builder 编辑；publish 到「我的能力」 | **部分具备基础**：`workflow_frontend` + Chat + codegen 已有，缺 manifest / publish / 我的能力注册 |
| 工作流源码形态 | 一节点一 `nodes/*.py` + `graph.py` | **`src/graphs/{project}.py` 单图** + `workflow.json` 画布；`workflow-code-generator` skill 按此生成 |
| Spec 文件 | `workflow.draft.json` / `workflow.published.json` | **`projects/{name}/workflow.json`**（React Flow JSON，兼画布与持久化） |
| 拆解执行 | `decompose_v2` 读 published DAG | 仍为 **`decompose` + LLM 动态子任务**（示例项目用独立 `StateGraph` 直接跑） |
| 发布闭环 | callable manifest + published workflow + 「我的能力」；可选包装为 workflow skill | **未实现**；项目目录 + 前端 Builder 列表即为「可见/可编辑」 |
| 谁可创建 | 曾写管理员/开发者 | 代码上**无硬编码 RBAC**；治理见 [workflow-governance.md](workflow-governance.md) |
| 前端 | 画布 + Agent 协同 | **`workflow_frontend/`** 独立 dev server（:8002），代理 Gateway chat，**POST 创建 project** |

**结论**：团队已打通 **「对话 → 生成/脚手架项目 → 独立 Builder 编辑 workflow.json → 示例 StateGraph 项目」** 的一期基础；下一步不必退回纯对话 MVP，可直接建设 **个人助手 + 独立 Workflow Builder + test/publish + 注册到『我的能力』** 的最小闭环。与 spec 中 **draft/published、decompose_v2、逐节点 py、fork/share/install** 仍有差距。

## 3. 已具备能力（可写入 demo / 验收）

### 3.1 `workflow_frontend/`

- 列表/加载/保存 `projects/{name}/workflow.json`（`workflow_frontend/server/main.py`）
- Chat 检测响应内 workflow JSON → **`POST /api/workflow/projects`** 创建目录并落盘
- Builder 通过 `/?project={name}` 打开已保存工程
- 与 DeerFlow Gateway 联调流式对话（`DEERFLOW_URL`）

### 3.2 `project_agent`

- 规划 → 子任务 → subagent 执行 → 评估 → 汇总（不变）
- **`_scaffold_project`**：`projects/{name}/` 标准目录 + 种子 `workflow.json`（start/end）
- Prompt 对 build/implement/create 类需求插入 **workflow-code-generator** 子任务

### 3.3 `skills/public/workflow-code-generator/`

- 规定完整 `projects/{name}/` 布局（graphs、utils、storage、scripts、config、README、**workflow.json**）
- 与 `ai_news_daily` / `travel_planner` 样例结构一致

### 3.4 `projects/` 样例

| 项目 | 说明 |
| --- | --- |
| `competitive_analysis` | 早期手写 graph（`workflow_graph.py` + nodes） |
| `ai_news_daily` | RSS 采集 → 摘要 → 通知，完整 `workflow.json` + StateGraph |
| `travel_planner` | 旅行规划示例，AI 生成 |

## 4. 仍缺 / 未对齐项（保持为里程碑）

- `workflow.draft` / `workflow.published` 语义分离与发布 API
- 「我的能力」/ workflow registry / callable manifest
- `decompose_v2` 确定性拆解（读 spec 非 LLM 即兴）
- workflow skill 包装 + custom agent 选用（可作为 published workflow 的包装形态）
- 用户级 **fork / share / collaborate**（治理已定，未落地）
- `workflow_frontend` 与主站 `frontend/` 统一部署（当前独立服务）

## 5. 文档修订建议（已/待做）

| 文档 | 动作 |
| --- | --- |
| [implementation-status.md](implementation-status.md) | 本文，持续更新 commit 范围 |
| [workflow-spec.md](workflow-spec.md) | 更新「与当前实现的映射」表 |
| [workflow-agent-architecture.md](workflow-agent-architecture.md) | 增加「当前 MVP」小节，避免读者以为 nodes/*.py 已全线落地 |
| [python-node-design.md](python-node-design.md) | 文首注明：MVP 以 `graphs/{project}.py` + skill 为准，单文件节点为演进目标 |
| [README.md](README.md) | 索引增加 implementation-status |

## 6. graphify 更新建议

`.graphifyignore` 曾排除 `projects/`、`workflow_frontend/`、`skills/`，导致全仓图 **未包含近期主战场**。建议：

1. 放开 `projects/`、`workflow_frontend/`，`skills/` 改为仅排除 `skills/custom/`（保留 public skill）
2. 执行 `graphify update .`（AST，覆盖上述代码变更）
3. 对 `docs/design/project-agent/implementation-status.md` 等新增 md 做语义抽取或 IDE `/graphify docs/design/project-agent`

---

**维护**：每次大迭代后更新 §1 提交表与 §2 差异表即可。
