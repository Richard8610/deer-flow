# Project Agent Workflow Spec

## 背景

当前分支引入了 `project_agent`、`workflow_frontend` 和 `projects/competitive_analysis`，意图把 DeerFlow 从通用超级智能体扩展为面向业务工作流的协同编排系统。

本 spec 记录一个目标方向：`project_agent` 不应只是运行时动态拆任务的 Agent，而应成为类似 Coze 编程式工作流的人机协同编排助手。用户可以用自然语言生成或调整工作流，也可以在 Web 画布中手动编辑节点和连线；最终工作流应固化为可版本管理、可测试、可审计、可复现的确定流程。

最新推荐路线见 [`workflow-skill-architecture.md`](workflow-skill-architecture.md)。本文中提到的 Python nodes/graph codegen 应理解为一种可选固化方式，而不是唯一目标；更优先的 DeerFlow 集成形态是将已发布业务工作流沉淀为 workflow skill，再由 custom agent 在业务场景中调用。

## 目标愿景

`project_agent` 的目标是支持复杂业务工作流的低代码/代码化协同开发：

1. 用户用自然语言描述业务目标、输入输出、节点职责和异常路径。
2. Agent 根据描述生成工作流草案，包括节点、边、输入输出、节点类型、依赖关系和执行策略。
3. Web 页面以 DAG 方式展示工作流，用户可以拖拽、增删、编辑节点和连线。
4. 用户可以继续用自然语言让 Agent 修改已有工作流，例如“把市场调研拆成政策和竞品两个节点”。
5. 工作流最终发布为可复用的业务能力，优先形态是 workflow skill，必要时再生成 Python runner 或 LangGraph graph。
6. 运行时执行已发布的确定流程，而不是每次让 LLM 即兴判断主流程。

核心原则是：**AI 参与工作流开发和维护，但业务流程执行应尽量确定化。**

## 非目标

当前 spec 不追求一次性实现完整 no-code 平台，也不要求完全兼容 Dify、Coze 或其他平台的 DSL。

短期非目标：

- 不把任意 React Flow JSON 直接作为生产执行源。
- 不允许未校验的前端节点定义直接执行任意代码。
- 不把所有业务节点都设计成纯 LLM 节点。
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

### 未实现

- 后端不读取 `projects/{name}/workflow.json`。
- 后端不会把 `workflow.json` 编译为 LangGraph。
- 前端画布编辑不会影响真实执行图。
- `project_agent` 没有稳定输出可执行 workflow spec。
- 没有 `workflow.json -> Python nodes/graph` 的代码生成器。
- 没有节点级 input/output schema 校验。
- 没有草稿态、已生成态、已发布态的生命周期。
- 没有将用户自然语言修改映射为对已有 workflow spec 的结构化 patch。

因此，当前更准确的定位是：

```text
后端：工作流 Agent 原型 + Python 项目图加载机制
前端：工作流可视化编辑器原型
中间：只通过 workflow.json 做画布持久化，尚未接入执行
```

而目标形态应是：

```text
自然语言需求
  -> Agent 生成 workflow spec
  -> Web 画布人机协同编辑
  -> Agent 生成 Python nodes/graph
  -> 后端加载 Python graph
  -> 确定性执行
```

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

### 1. Workflow Spec 层

需要定义一个后端可理解的 workflow spec。它可以继续使用 `workflow.json`，但必须从 UI 状态升级为业务语义明确的规范。

建议拆成两部分：

```json
{
  "version": "1",
  "project": "competitive_analysis",
  "metadata": {},
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

Agent 生成或修改 workflow spec 后，系统应发布可复用的 workflow skill。Python 代码生成仍然可用，但它是 workflow skill 的内部执行实现之一，而不是对外集成形态。

推荐发布结构：

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

需要支持：

- 选择项目。
- 加载草稿 workflow spec。
- 拖拽增删节点。
- 编辑节点输入输出、prompt、工具名、subagent 类型、超时、重试等。
- 校验断开的边、缺失输入、循环依赖。
- 保存草稿。
- 请求 Agent 根据用户描述修改当前 spec。
- 请求后端生成/更新 Python 代码。
- 显示代码生成 diff。
- 发布工作流版本。

### 4. Runtime 层

运行时优先由 custom agent 识别并调用 workflow skill：

```text
业务系统
  -> Gateway / IM / DeerFlowClient
  -> assistant_id 或 agent_name
  -> lead_agent/custom_agent
  -> workflow skill
  -> 确定性 runner 或 LangGraph graph
```

复杂工作流仍可在 skill 内部加载已发布的 Python graph：

```text
projects/{project}/src/graphs/workflow_graph.py
```

执行优先级建议：

1. 如果存在已发布 workflow skill，则由 custom agent 调用 skill。
2. 如果 skill 内部存在 Python runner 或 LangGraph graph，则执行对应固化产物。
3. 如果只有 workflow spec，则拒绝生产执行，并提示先发布。
4. 仅在开发模式下允许从 spec 临时解释执行。

这样可以保证生产路径确定。

## 人机协同流程

### 新建工作流

```text
用户描述业务目标
  -> project_agent 生成 workflow spec 草案
  -> 前端画布展示
  -> 用户编辑
  -> project_agent 根据编辑后 spec 生成 workflow skill
  -> 用户 review diff
  -> 运行校验
  -> 发布
```

### 修改工作流

```text
用户提出修改需求
  -> 系统加载当前 workflow spec 和代码摘要
  -> project_agent 生成结构化 patch
  -> 前端展示变更
  -> 用户确认或手动修正
  -> 重新生成受影响 skill 产物
  -> 运行测试
  -> 发布新版本
```

### 执行工作流

```text
用户触发已发布 workflow
  -> Gateway / IM / DeerFlowClient 调用 custom agent
  -> custom agent 根据场景选择 workflow skill
  -> workflow skill 调用确定 runner 或 LangGraph graph
  -> 返回结果、artifact、日志、节点状态
```

## 与当前实现的映射

| 目标模块 | 当前位置 | 当前状态 |
| --- | --- | --- |
| LangGraph 入口 | `backend/langgraph.json` | 已注册 `project_agent`、`competitive_analysis_agent` |
| 通用 workflow graph | `backend/packages/harness/deerflow/agents/project_agent/graph.py` | 已实现固定流程 |
| 通用 workflow 节点 | `backend/packages/harness/deerflow/agents/project_agent/nodes.py` | 已实现拆解、规划、执行、评估、汇总 |
| 项目动态加载 | `make_project_agent()` / `load_project_graph()` | 已实现 Python module 加载 |
| 业务示例 | `projects/competitive_analysis/` | 已有手写 Python graph |
| 前端画布 | `workflow_frontend/` | 已实现编辑和保存 UI JSON |
| workflow spec | `projects/{name}/workflow.json` | 目前只是 React Flow JSON |
| workflow skill 发布 | `skills/custom/{name}/` | 未实现 |
| spec 到代码生成 | 无 | 可选实现，未实现 |
| spec 到 LangGraph 执行 | 无 | 未实现 |
| 用户自然语言 patch | 无 | 未实现 |
| 发布/版本化 | 无 | 未实现 |

## 建议里程碑

### Milestone 1：明确 Spec 与保存协议

目标：让 `workflow.json` 成为可校验的业务 workflow spec。

交付：

- 定义 `workflow.schema.json` 或 Pydantic model。
- 区分执行字段与 UI 字段。
- 前端保存时符合 spec。
- 后端提供 validate API。

验收：

- 任意 `workflow.json` 可被后端校验。
- 缺失输入、未知节点类型、非法边能返回明确错误。

### Milestone 2：Agent 生成 workflow spec

目标：让 `project_agent` 稳定输出结构化 workflow spec，而不是普通总结文本。

交付：

- 新增 prompt：根据业务描述生成 workflow spec。
- 新增 patch prompt：根据用户修改请求修改现有 spec。
- 前端 chat 调用时携带当前 spec。
- Agent 返回结构化 JSON 或 patch。

验收：

- 用户描述“做一个竞品分析工作流”，Agent 能生成可加载的 spec。
- 用户描述“新增政策研究节点”，Agent 能基于现有 spec 生成 patch。

### Milestone 3：Spec 到 workflow skill 发布

目标：将 spec 固化为可被 custom agent 调用的 workflow skill。

交付：

- 生成 `SKILL.md`。
- 生成 `workflow.published.json`。
- 生成 `manifest.json`。
- 生成确定性 runner 或引用已有 graph。
- 输出发布 diff 给用户审核。

验收：

- skill 可被 skills 系统加载。
- custom agent 可通过 skills 白名单启用该工作流。
- 调用 skill 能产出稳定交付物。

### Milestone 4：运行与测试

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

### Milestone 5：发布与版本管理

目标：支持草稿、预览、发布和回滚。

交付：

- workflow draft 与 published 目录或状态字段。
- 发布前校验。
- 版本号与变更记录。
- 回滚机制。

验收：

- 生产执行只使用 published graph。
- 用户可以查看每次发布的变更。

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
5. 生成代码是否由 `project_agent` 直接写入仓库，还是只生成 patch 等用户确认？
6. 前端编辑后的 workflow 是否需要自动触发代码生成，还是手动点击“生成代码/发布”？
7. 是否需要支持人工审批节点、循环节点、批处理节点、长事务节点？

## 推荐结论

`project_agent` 应定位为 **业务工作流编排助手**，而不是普通执行 Agent。

它的核心价值不是“每次临时规划并执行任务”，而是帮助用户把复杂业务流程逐步沉淀为可维护、可调用的 workflow skill：

```text
自然语言需求
  -> workflow spec
  -> Web 协同编辑
  -> workflow skill
  -> 测试与发布
  -> custom agent 调用
  -> 确定性执行与交付物产出
```

当前实现已经有了通用 Agent、skills、custom agent、项目加载、竞品分析样例和前端画布，但缺少 `workflow spec -> workflow skill -> custom agent 调用` 的发布闭环。这应是后续建设的主线；`workflow.json -> Python graph` 可作为复杂 workflow 的内部执行实现继续保留。
