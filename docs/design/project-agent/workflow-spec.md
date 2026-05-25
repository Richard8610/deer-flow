# Project Agent Workflow Spec

> **精简主文档**见 [`../workflow-tool/spec.md`](../workflow-tool/spec.md)。本文保留完整版与历史细节。

## 背景

当前分支引入了 `project_agent`、`workflow_frontend`、`workflow-code-generator` skill 和多个 `projects/` 样例，意图把 DeerFlow 从通用超级智能体扩展为面向个人与团队工作的 workflow 构建、编辑、发布和调用系统。

本 spec 记录一个目标方向：工作流创建不应绑定为一个中心化 `project_agent`，而应成为**每个用户的个人助手 Agent 可调用的 workflow builder 能力**。用户在日常工作中通过对话发起创建，系统生成 workflow draft、`workflow.json` 和初始 runner/graph；用户直接在独立 Workflow Builder 画布中编辑节点和连线，也可以继续通过对话修改；最终工作流发布为用户「我的能力」，可被当前个人助手或用户自己的 custom agent 调用。

最新推荐路线见 [`workflow-agent-architecture.md`](workflow-agent-architecture.md)。一期不要求 Chat 内嵌画布，而是直接复用当前 `workflow_frontend` 独立 Builder 打通创建、编辑、测试、发布闭环；后续再演进为 Chat + 侧边栏画布的联动体验。

## 目标愿景

workflow builder 的目标是支持复杂业务工作流的低代码/代码化协同开发：

1. 用户用个人助手 Agent 描述业务目标、输入输出、节点职责和异常路径。
2. 个人助手调用 workflow builder / workflow-code-generator 生成工作流草案，包括节点、边、输入输出、节点类型、依赖关系和执行策略。
3. 独立 Workflow Builder 页面以 DAG 方式展示工作流，用户可以拖拽、增删、编辑节点和连线。
4. 用户可以继续用自然语言让个人助手修改已有工作流，例如“把市场调研拆成政策和竞品两个节点”。
5. 工作流最终发布为用户「我的能力」，优先形态是 callable manifest + workflow skill / runner / LangGraph graph。
6. 运行时执行已发布的确定流程，而不是每次让 LLM 即兴判断主流程。

核心原则是：**AI 参与工作流开发和维护，但业务流程执行应尽量确定化。**

## 非目标

当前 spec 不追求一次性实现完整 no-code 平台，也不要求完全兼容 Dify、Coze 或其他平台的 DSL。

短期非目标：

- 不把任意 React Flow JSON 直接作为生产执行源。
- 不允许未校验的前端节点定义直接执行任意代码。
- 不把所有业务节点都设计成纯 LLM 节点。
- 不要求第一期实现 Chat 内嵌侧边栏画布；独立 Workflow Builder 页面即可。
- 不要求第一期实现多人实时协作、商店评分、强审批和复杂组织权限。
- 不要求第一版支持复杂循环、人工审批、长事务补偿等高级编排能力。

## 当前实现概览

### LangGraph 注册

当前 `backend/langgraph.json` 注册了三个图：

- `lead_agent`：DeerFlow 默认主 Agent。
- `project_agent`：通用工作流 Agent。
- `competitive_analysis_agent`：竞品分析专用 Agent。

`project_agent` 的入口位于 `backend/packages/harness/deerflow/agents/project_agent/agent.py`。`make_workflow_agent()` 固定返回内置通用工作流图，`make_competitive_analysis_agent()` 则调用 `make_project_agent("competitive_analysis", config)`。

### 通用 project_agent

通用图位于 `backend/packages/harness/deerflow/agents/project_agent/graph.py`，当前流程为：

```text
START
  -> parse_input
  -> decompose
  -> search_skills
  -> plan_workflow
  -> execute_subtask x N
  -> evaluate
  -> prepare_retry? 
  -> synthesize
  -> END
```

它已具备这些能力：

- 从用户消息提取 `task_description`。
- 调用 LLM 拆解子任务。
- 读取当前启用的 skills。
- 调用 LLM 生成 subagent assignments。
- 使用 LangGraph `Send` 并行执行多个 `execute_subtask`。
- 通过 evaluator 判断子任务结果是否通过。
- 对失败子任务最多重试两次。
- 最终汇总输出。

### 项目动态加载

`make_project_agent(project_name, config)` 支持从 `projects/` 下动态加载 Python graph。解析顺序为：

1. `projects/{name}/src/graphs/{name}.py` 中的 `make_{name}_graph()` 或 `make_graph()`。
2. `projects/{name}/src/graphs/workflow_graph.py` 中的 `make_workflow_graph()`。
3. `projects/{name}/src/agent.py` 中的 `make_{name}_agent()` 或 `make_agent()`。
4. 找不到则 fallback 到内置通用 `make_workflow_graph()`。

这说明当前后端执行源是 Python module，而不是前端保存的 `workflow.json`。

### competitive_analysis 示例

`projects/competitive_analysis/` 是当前最完整的业务示例。它的真实执行图位于 `projects/competitive_analysis/src/graphs/competitive_analysis.py`，流程为：

```text
START
  -> extract_company
  -> research
  -> generate_report
  -> save_report
  -> END
```

其中 `research` 节点内部并行启动三个研究 subagent：

- company research
- competitor research
- market research

报告最终保存为 Markdown 文件，路径形如：

```text
{DEER_FLOW_HOME}/projects/competitive_analysis/{company}_{date}_竞品分析.md
```

### workflow_frontend

`workflow_frontend` 提供 React Flow 画布，支持：

- 展示内置示例工作流。
- 拖拽新增节点。
- 编辑节点字段。
- 编辑连线。
- 导入/导出 `{ nodes, edges }` JSON。
- 按项目保存到 `projects/{project_name}/workflow.json`。
- 通过 chat 页面把消息代理到 `project_agent` 或 `{project}_agent`。

保存逻辑位于 `workflow_frontend/server/main.py`，仅负责读写 `workflow.json`：

```text
GET /api/workflow/projects/{name}
PUT /api/workflow/projects/{name}
```

聊天代理逻辑位于：

```text
POST /api/chat/stream
```

如果传入 `project=competitive_analysis`，前端服务会把 `assistant_id` 设置为 `competitive_analysis_agent`。

## 当前差距

当前实现尚未形成完整闭环。最关键的问题是：**前端 workflow JSON 与后端 Python graph 执行没有打通。**

### 已实现

- 后端有固定的通用 `project_agent` LangGraph。
- 后端支持从 `projects/{name}` 动态加载 Python graph。
- 有一个手写业务 graph：`competitive_analysis`。
- 前端能编辑和保存 React Flow 风格的 `nodes/edges`。
- 前端 chat 能识别 Agent 回复中的 `nodes/edges` JSON 并加载到画布。
- `workflow_frontend` 已具备独立 Builder 的基础形态，支持项目列表、加载、保存与 Chat 代理。
- `workflow-code-generator` skill 已能生成 `projects/{name}/`、`workflow.json` 和 `src/graphs/*.py` 形态的完整样例项目。

### 未实现

- 后端不读取 `projects/{name}/workflow.json`。
- 后端不会把 `workflow.json` 编译为 LangGraph。
- 前端画布编辑不会影响真实执行图。
- 个人助手还没有稳定地调用 workflow builder 输出可执行 workflow spec / patch。
- 没有 `workflow.json -> Python nodes/graph` 的代码生成器。
- 没有节点级 input/output schema 校验。
- 没有草稿态、已生成态、已发布态的生命周期。
- 没有将用户自然语言修改映射为对已有 workflow spec 的结构化 patch。
- 发布后尚未注册为用户「我的能力」，个人助手不能稳定按名称调用 published workflow。

因此，当前更准确的定位是：

```text
后端：工作流 Agent 原型 + Python 项目图加载机制
前端：独立 Workflow Builder 原型（已可编辑 / 保存 workflow.json）
中间：通过 workflow.json 做画布持久化，尚未接入发布与执行
```

而目标形态应是：

```text
用户使用个人助手
  -> 说：帮我做一个日报工作流
  -> 个人助手调用 workflow builder / workflow-code-generator
  -> 生成 workflow draft + workflow.json + 初始 runner/graph
  -> 自动打开或返回独立 Workflow Builder 链接
  -> 用户在画布中编辑节点/连线，也可继续通过对话调整
  -> 保存 draft，测试运行
  -> publish
  -> 注册为用户「我的能力」
  -> 当前个人助手后续可直接调用该 workflow
```

分享 / fork / install 时只复制流程、spec、代码和 manifest，**不复制作者的数据上下文**。执行始终使用调用者自己的 sandbox、memory、uploads 和 credentials。

## 为什么要固化为确定流程

复杂业务场景通常包含多个工作流，每个工作流中有大量节点、分支、异常路径和数据依赖。如果每次执行都让 LLM 动态决定流程，会带来以下风险：

- 节点顺序不稳定。
- 分支条件不稳定。
- 输出格式不稳定。
- 很难复现历史执行。
- 很难做单元测试和回归测试。
- 很难审计某次业务决策由哪个节点产生。
- 很难定位问题是 prompt、工具、模型还是流程本身导致。

因此，LLM 更适合参与“设计期”和“维护期”，而不是在“运行期”任意改写执行路径。

目标设计应遵循：

- Agent 负责生成、解释、修改工作流。
- 用户负责审核、确认、手动修正。
- 系统负责把工作流编译/固化为确定流程。
- 运行时只执行已发布版本的 workflow skill、runner 或 graph。

## 目标架构

### 0. 个人助手 + Workflow Builder 能力层

工作流创建的入口是用户当前正在使用的个人助手 Agent，而不是固定的 `project_agent`。`project_agent` 可以继续作为底层实现名称存在，但产品与架构口径应改为 **workflow builder capability**：

> 工具自身的分层设计见 [workflow-tool-architecture.md](workflow-tool-architecture.md)：DeerFlow 是 Agent 基座，Workflow Builder 是工具 / 应用模块，核心 workflow domain service 不应依赖某个 Agent 图。

```text
User
  -> Personal Assistant Agent（默认 lead_agent + user_id 上下文）
      -> 调用 workflow builder / workflow-code-generator
      -> 生成或修改 workflow draft
      -> 打开独立 Workflow Builder 编辑
      -> publish 后加入「我的能力」
```

DeerFlow 现有 custom agent 模型与此兼容：同一个用户可以有多个 custom agent，它们本质上是同一 `lead_agent` 图在不同 `agent_name`、`SOUL.md`、`config.yaml`、skills/tool/model 白名单下运行。workflow 发布后可以被默认个人助手调用，也可以被用户自己的 custom agent 通过 skills / callable manifest 白名单启用。

一期交互直接复用当前 `workflow_frontend` 独立页面，不要求 Chat 内嵌画布：

```text
Chat 创建/修改意图
  -> 生成 draft 与 workflow.json
  -> 返回 /workflow-builder?workflow_id=... 或 ?project=...
  -> 用户在独立 Builder 保存
  -> Chat 或 Builder 发起 test / publish
```

### 1. Workflow Spec 层

需要定义一个后端可理解的 workflow spec。它可以继续使用 `workflow.json`，但必须从 UI 状态升级为业务语义明确的规范。

建议拆成两部分：

```json
{
  "version": "1",
  "project": "competitive_analysis",
  "metadata": {
    "owner_user_id": "u_123",
    "visibility": "private",
    "collaborators": [],
    "forked_from": null
  },
  "nodes": [],
  "edges": [],
  "ui": {}
}
```

`nodes` 和 `edges` 是执行语义，`ui` 保存 React Flow 的 position、折叠状态、颜色等展示信息。

节点建议字段：

```json
{
  "id": "research_company",
  "kind": "subagent",
  "name": "Research Company",
  "description": "Research target company profile and recent news.",
  "inputs": {
    "company": "state.task_description"
  },
  "outputs": {
    "company_research": "str"
  },
  "handler": "projects.competitive_analysis.src.nodes.research_company:research_company_node",
  "config": {
    "subagent_type": "ca-researcher",
    "timeout_seconds": 300
  }
}
```

支持的节点类型第一版可以限制为：

- `start`
- `end`
- `llm`
- `subagent`
- `tool`
- `python`
- `condition`

### 2. 发布层

个人助手调用 workflow builder 生成或修改 workflow spec 后，系统应发布可复用的 callable workflow。Python 代码生成仍然可用，但它是 workflow skill / runner 的内部执行实现之一，而不是唯一对外集成形态。

推荐发布结构：

```text
users/{owner_user_id}/workflows/{workflow_name}/
├── workflow.draft.json
├── workflow.published.json
├── manifest.yaml              # 注册到「我的能力」的 callable manifest
├── src/
│   └── graphs/
│       └── {workflow_name}.py
└── tests/
```

如需让既有 skills 系统发现，也可以额外生成 skill 包装层：

```text
skills/custom/{workflow_name}/
├── SKILL.md
├── workflow.published.json
├── manifest.json
├── scripts/
│   └── run.py
└── tests/
```

复杂场景可以继续生成 Python/LangGraph 项目代码：

```text
projects/{project_name}/src/
├── nodes/
│   ├── __init__.py
│   ├── extract_company.py
│   ├── research_company.py
│   ├── research_competitors.py
│   ├── generate_report.py
│   └── save_report.py
├── graphs/
│   └── workflow_graph.py
├── state.py
└── tests/
```

节点函数建议约定：

```python
async def node_name(state: WorkflowState, config: RunnableConfig) -> dict:
    ...
    return {"field": value}
```

设计原则：

- 输入来自 `state` 和 `config`。
- 输出为 dict patch。
- 不隐式修改外部变量。
- 副作用必须显式集中在边界节点，例如保存文件、调用外部 API、写数据库。
- 每个节点应可单独测试。

### 3. Web 协同编辑层

前端画布应编辑 workflow spec，而不只是 UI JSON。

一期直接使用独立 Workflow Builder 页面，避免把完整画布嵌入 Chat 作为首要前提。需要支持：

- 选择项目。
- 加载草稿 workflow spec。
- 拖拽增删节点。
- 编辑节点输入输出、prompt、工具名、subagent 类型、超时、重试等。
- 校验断开的边、缺失输入、循环依赖。
- 保存草稿。
- 请求个人助手 / workflow builder 根据用户描述修改当前 spec。
- 请求后端生成/更新 Python 代码。
- 显示代码生成 diff。
- 发布工作流版本。

后续增强再考虑 Chat 内嵌侧边栏画布、实时同步、多人协作和冲突处理。

### 4. Runtime 层

运行时优先由用户当前个人助手识别并调用「我的能力」中的 published workflow：

```text
用户请求
  -> Gateway / IM / DeerFlowClient
  -> lead_agent 或 user custom agent
  -> 查询「我的能力」/ enabled workflows
  -> 调用 published workflow
  -> 确定性 runner 或 LangGraph graph
```

复杂工作流仍可在 skill 内部加载已发布的 Python graph：

```text
projects/{project}/src/graphs/workflow_graph.py
```

执行优先级建议：

1. 如果用户「我的能力」中存在已发布 workflow，则由当前个人助手调用该 workflow。
2. 如果 skill 内部存在 Python runner 或 LangGraph graph，则执行对应固化产物。
3. 如果只有 workflow spec，则拒绝生产执行，并提示先发布。
4. 仅在开发模式下允许从 spec 临时解释执行。

这样可以保证生产路径确定。

## 人机协同流程

### 新建工作流

```text
用户使用个人助手描述业务目标
  -> 个人助手调用 workflow builder / workflow-code-generator
  -> 生成 workflow draft + workflow.json + 初始 runner/graph
  -> 返回独立 Workflow Builder 链接
  -> 用户在 Builder 画布编辑，也可继续通过对话调整
  -> 保存 draft
  -> 测试运行 / smoke test
  -> 发布
  -> 注册到用户「我的能力」
```

### 修改工作流

```text
用户提出修改需求
  -> 系统加载当前 workflow spec 和代码摘要
  -> 个人助手调用 workflow builder 生成结构化 patch
  -> Builder 或 Chat 展示变更
  -> 用户确认或在独立画布手动修正
  -> 重新生成受影响 skill 产物
  -> 运行测试
  -> 发布新版本
```

### 执行工作流

```text
用户触发已发布 workflow
  -> Gateway / IM / DeerFlowClient 调用当前个人助手或 custom agent
  -> Agent 从「我的能力」中选择 published workflow
  -> workflow 调用确定 runner 或 LangGraph graph
  -> 返回结果、artifact、日志、节点状态
```

### 分享 / fork / install

```text
owner 发布 workflow
  -> 设置 visibility: private / shared / public
  -> 其他用户 fork / install
  -> 复制 workflow spec、代码产物和 manifest 到自己的命名空间
  -> 执行时使用调用者自己的 sandbox / memory / uploads / credentials
```

共享 workflow 共享的是流程和代码，不共享作者的数据上下文。

## 与当前实现的映射

> 详细 commit 级对照见 [implementation-status.md](implementation-status.md)（2026-05-25 快照）。

| 目标模块 | 当前位置 | 当前状态 |
| --- | --- | --- |
| LangGraph 入口 | `backend/langgraph.json` | 已注册 `project_agent`、`competitive_analysis_agent` |
| 通用 workflow graph | `agents/project_agent/graph.py` | 已实现（规划/拆解/执行/评估流水线） |
| 工作流代码生成 | `skills/public/workflow-code-generator/` + `prompts.py` | **已实现**：子任务读 skill，生成完整 `projects/{name}/` |
| 项目脚手架 | `nodes.py` `_scaffold_project()` | **已实现**：目录结构 + 种子 `workflow.json` |
| 业务项目样例 | `projects/ai_news_daily`, `travel_planner`, `competitive_analysis` | **已实现**（`src/graphs/*.py` + `workflow.json`） |
| 前端画布 + Chat | `workflow_frontend/` | **已实现**：编辑/保存 JSON、流式 Chat、**POST 创建 project** |
| workflow 持久化形态 | `projects/{name}/workflow.json` | **MVP**：React Flow JSON（非 draft/published 双文件） |
| 一期产品闭环 | 个人助手 + 独立 `workflow_frontend` Builder | **部分实现**：已有创建/编辑基础，缺 test/publish/我的能力 |
| 目标：一节点一 py | `projects/*/src/nodes/` | **未作为默认**；目标架构仍见 [python-node-design.md](python-node-design.md) |
| decompose_v2（读 published DAG） | — | **未实现**；仍为 LLM `decompose` |
| workflow skill 发布 | `skills/custom/{name}/` | 未实现 |
| 用户自然语言 patch spec | Chat → JSON 落盘 | **部分**：Chat 可写入整图 JSON，无结构化 patch 协议 |
| 发布/版本化 / fork / share | — | 未实现（治理见 [workflow-governance.md](workflow-governance.md)） |

## 建议里程碑

### Milestone 1：个人助手 + 独立 Builder MVP 闭环

目标：直接复用当前 `workflow_frontend`，让用户从个人助手发起创建，在独立 Builder 中编辑，保存后能测试并发布到「我的能力」。

交付：

- Chat 创建 workflow draft，并返回独立 Builder 链接。
- Builder 加载、编辑、保存 `workflow.json`。
- workflow-code-generator 生成或绑定 `src/graphs/*.py` runner。
- 提供最小 test / smoke run 入口。
- publish 后生成 callable manifest，并注册到当前用户「我的能力」。

验收：

- 用户从 Chat 发起创建，能得到一个可打开、可编辑、可保存的 workflow。
- 保存后的 workflow 能绑定一个可运行的 Python graph / runner。
- 用户再次对个人助手说“运行我的日报工作流”，助手能调用 published workflow。

### Milestone 2：明确 Spec 与保存协议

目标：让 `workflow.json` 成为可校验的业务 workflow spec，而不只是 React Flow UI JSON。

交付：

- 定义 `workflow.schema.json` 或 Pydantic model。
- 区分执行字段与 UI 字段。
- 前端保存时符合 spec。
- 后端提供 validate API。

验收：

- 任意 `workflow.json` 可被后端校验。
- 缺失输入、未知节点类型、非法边能返回明确错误。

### Milestone 3：对话 patch + codegen 更新

目标：让个人助手稳定基于现有 draft 生成结构化 patch，并更新受影响的 runner / graph。

交付：

- 新增 prompt：根据业务描述生成 workflow spec。
- 新增 patch prompt：根据用户修改请求修改现有 spec。
- 前端 chat 调用时携带当前 spec。
- Agent 返回结构化 JSON 或 patch。
- 代码生成器支持增量更新或全量重写后展示 diff。

验收：

- 用户描述“做一个竞品分析工作流”，Agent 能生成可加载的 spec。
- 用户描述“新增政策研究节点”，Agent 能基于现有 spec 生成 patch。

### Milestone 4：Spec 到 workflow skill / callable manifest 发布

目标：将 spec 固化为可被个人助手 / custom agent 调用的 workflow。

交付：

- 生成 `SKILL.md`。
- 生成 `workflow.published.json`。
- 生成 callable `manifest.yaml` / `manifest.json`。
- 生成确定性 runner 或引用已有 graph。
- 输出发布 diff 给用户审核。

验收：

- published workflow 出现在当前用户「我的能力」。
- 个人助手可按名称调用该工作流。
- custom agent 可通过 skills / workflow 白名单启用该工作流。

### Milestone 5：运行与测试

目标：让生成后的项目 graph 可稳定执行。

交付：

- 项目级 smoke test。
- 节点级单测模板。
- workflow dry-run API。
- 节点执行日志和状态回传。

验收：

- 发布后的 graph 可通过 Gateway 运行。
- 节点失败能定位到具体节点。
- 修改 workflow 后能回归测试。

### Milestone 6：发布、版本与分享

目标：支持草稿、预览、发布、回滚、fork / share / install。

交付：

- workflow draft 与 published 目录或状态字段。
- 发布前校验。
- 版本号与变更记录。
- 回滚机制。
- `owner_user_id`、`visibility`、`collaborators`、`forked_from`、`installed_by`。

验收：

- 生产执行只使用 published graph。
- 用户可以查看每次发布的变更。
- fork / install 只复制流程与代码，执行时使用调用者自己的 sandbox / memory / uploads / credentials。

## 设计风险

### workflow spec 与执行产物双源问题

如果 spec、workflow skill、runner 或 Python graph 同时存在，需要明确 source of truth。

建议：

- 开发态：spec 是源，执行产物由 spec 生成。
- 发布态：workflow skill 是业务能力入口，runner 或 graph 是执行源，spec 作为设计源和可视化源。
- 每次发布记录 spec hash，运行时可以检测执行产物是否落后于 spec。

### 节点副作用管理

业务节点不可能完全无副作用，但副作用必须显式。

建议：

- 普通处理节点尽量纯函数化。
- 文件写入、数据库写入、外部 API 调用等封装为边界节点。
- spec 中声明 `side_effects`。

### LLM 生成代码安全

Agent 生成 Python 代码后不能直接无审查执行。

建议：

- 必须经过用户确认。
- 必须通过静态检查和导入检查。
- 第一版限制可生成的节点模板。
- 禁止生成任意 shell 执行逻辑，除非显式授权。

### 前端 UI JSON 与执行语义耦合

React Flow 的字段不能直接等同于执行 DSL。

建议：

- `nodes/edges` 中保留执行语义。
- `ui` 或 `layout` 中保存前端展示信息。
- 前后端共享 schema。

## 开放问题

1. `workflow.json` 应该优先作为 source of truth，还是仅作为设计稿，由 Python graph 作为唯一 source of truth？
2. 是否允许开发模式下解释执行 workflow spec，还是必须先 codegen？
3. workflow skill 的第一版 runner 应该是脚本、LangGraph graph，还是两者都支持？
4. 节点输入输出 schema 使用 Pydantic、TypedDict 还是 JSON Schema？
5. 生成代码是否由 workflow builder 直接写入用户 workflow 命名空间，还是只生成 patch 等用户确认？
6. 前端编辑后的 workflow 是否需要自动触发代码生成，还是手动点击“生成代码/发布”？
7. 是否需要支持人工审批节点、循环节点、批处理节点、长事务节点？
8. 「我的能力」应复用 skills 白名单，还是新增 workflows registry？
9. 个人助手调用 workflow 时，工具形态应表现为 tool、skill、app，还是统一的 callable manifest？

## 推荐结论

工作流创建应定位为 **个人助手可调用的 workflow builder 能力**，而不是一个中心化 `project_agent` 独占的创建入口。

它的核心价值不是“每次临时规划并执行任务”，而是帮助用户把日常工作中的重复流程逐步沉淀为可维护、可发布、可分享、可调用的 workflow：

```text
个人助手对话
  -> workflow builder / workflow-code-generator
  -> workflow draft + 独立 Builder 编辑
  -> 测试与 publish
  -> 注册到「我的能力」
  -> 个人助手 / custom agent 调用
  -> 确定性执行与交付物产出
```

当前实现已经有了通用 Agent、per-user custom agent、skills、项目加载、样例项目和独立 `workflow_frontend` 画布。因此一期不必退回纯对话 MVP，可以直接建设 **个人助手 + 独立 Workflow Builder + 发布到「我的能力」** 的最小闭环。`workflow.json -> Python graph` 可作为复杂 workflow 的内部执行实现继续保留；Chat 内嵌侧边栏画布、多人协作与商店化属于后续增强。
