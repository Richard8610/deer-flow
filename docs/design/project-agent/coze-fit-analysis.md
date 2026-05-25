# Project Agent 与 Coze 工作流契合度分析

## 分析目标

本文基于 [`workflow-spec.md`](workflow-spec.md) 中提出的目标愿景，以及 [`coze-workflow-research.md`](coze-workflow-research.md) 对 Coze 开源仓库的调研，分析：

- Coze 开源工作流与 DeerFlow `project_agent` 目标是否一致。
- 哪些设计值得借鉴。
- 哪些能力 Coze 开源没有覆盖，需要 DeerFlow 自研。
- 当前 `project_agent` 应如何演进，才能更接近“人机协同编程式业务工作流”。

## 目标对齐结论

Coze 的公开工作流体系与 `project_agent` 目标在 **产品方向** 上高度相似，但在 **实现路线** 上明显不同。

共同点：

- 都强调可视化工作流。
- 都需要节点、边、输入输出、条件分支、运行状态。
- 都需要工作流从设计态进入可执行态。
- 都需要支持复杂业务流程的拆分、调试和维护。
- 都需要让 Agent/LLM 成为某些节点或开发辅助能力，而不是唯一运行时。

差异点：

- Coze 开源版是 **画布 spec + Go/Eino 中心化运行时**。
- DeerFlow 新目标已调整为 **个人助手调用 workflow builder → 独立 Workflow Builder 编辑 → publish → 注册到「我的能力」→ 个人助手 / custom agent 调用**；节点 Python 文件化是复杂 workflow 的高级执行实现。

因此，Coze 可以作为 **架构参考和交互参考**，但不能直接作为 `project_agent` 的代码生成和执行方案。新的主线详见 [`workflow-agent-architecture.md`](workflow-agent-architecture.md)。

## 需求匹配矩阵

| 需求 | Coze 开源支持度 | DeerFlow 当前状态 | 结论 |
| --- | --- | --- | --- |
| 可视化工作流编辑 | 高 | 原型已具备 | 可重点参考 FlowGram / Coze Studio |
| 节点类型体系 | 高 | 较弱 | 应借鉴 Coze 节点 schema 与前后端双注册 |
| 工作流 spec | 高 | 目前只是 React Flow JSON | 需要升级为业务语义 spec |
| spec 到确定性执行 | 高，但基于 Go/Eino | Python graph 已可执行，`workflow-code-generator` 已能生成 `src/graphs/*.py` | 可借鉴分层，发布为 callable workflow / skill 包装，内部用 Python runner 或 LangGraph |
| 自然语言生成整图 | 低 | 未实现 | 需要 DeerFlow 自研 |
| 人机协同修改 workflow | 中低 | 未实现 | 可借鉴 Coze Copilot 局部辅助理念，自研 patch 流程 |
| 前端编辑同步后端执行 | 高，平台内闭环 | 未打通 | 需要 `workflow spec -> runner/graph -> publish 到我的能力` |
| 生成 Python nodes/graph | 无 | 手写项目图存在 | 可选高级实现 |
| 业务工作流能力复用 | 中，平台内 workflow/tool | skills/custom agent 体系已具备 | DeerFlow 差异化方向 |
| 节点级调试/观测 | 高 | 较弱 | 可借鉴 debug_url、trace、coze-loop |
| draft/published 发布模型 | 中 | 未实现 | 可借鉴 Prompt draft/commit 思路 |
| SDK 运行已发布工作流 | 高 | Gateway assistant_id 可类比 | 可借鉴 run/stream/resume/history API |

## 当前 project_agent 与 Coze 的对应关系

### 已经相似的部分

当前 `project_agent` 已具备一些 Coze 式工作流的基础：

- 已有 `project_agent` 与 `{project}_agent` 的 LangGraph 注册模式。
- 已有 skills 与 custom agent 能力，可作为业务工作流发布和调用入口。
- 已有 `projects/{project_name}/` 目录，承载业务项目。
- 已有 Python graph 动态加载机制。
- 已有 `workflow_frontend` 画布。
- 已有 `competitive_analysis` 业务样例。
- 已有 subagent 并行执行和结果汇总能力。

这些能力对应 Coze 中的：

```text
Workflow Project
Canvas
Node
Graph Runtime
SubWorkflow / Agent Tool
Run API
```

### 明显不同的部分

当前 `project_agent` 仍是 **运行时动态规划 Agent**：

```text
用户输入
  -> LLM decompose
  -> LLM plan
  -> subagent execute
  -> LLM evaluate
  -> LLM synthesize
```

Coze 工作流则更像：

```text
用户编辑/配置 workflow
  -> 保存 schema
  -> 后端编译 schema
  -> 确定 DAG 执行
```

而当前目标是：

```text
个人助手对话 + 独立 Workflow Builder 编辑
  -> workflow spec
  -> 生成 runner / graph / 可选 nodes/*.py
  -> publish 到「我的能力」
  -> 个人助手 / custom agent 调用
  -> 确定执行 → 评测/重试 → 交付物
```

所以当前 `project_agent` / `workflow_frontend` 还只是目标形态的前半部分，尚未形成 Coze 式工作流平台的创建、编辑、发布、调用闭环。

## 关键差距分析

### 1. 缺少真正的 Workflow Spec

当前 `workflow_frontend` 保存的是 React Flow 风格的 UI JSON：

```json
{
  "nodes": [],
  "edges": []
}
```

它主要表达前端画布状态，不足以表达：

- 节点输入 schema
- 节点输出 schema
- 节点 handler
- 工具名
- subagent 类型
- prompt 模板
- 条件表达式
- 超时和重试
- 副作用声明
- 版本信息

Coze 的做法是区分 Canvas Node 与 NodeSchema。DeerFlow 也应该引入类似分层：

```text
UI Layout
  + Workflow Spec
  -> Python Codegen
  -> LangGraph Runtime
```

### 2. 缺少 Spec 到「我的能力」的发布链路

这是与用户目标差距最大的地方。

当前已有手写项目图：

```text
projects/competitive_analysis/src/graphs/competitive_analysis.py
```

但没有：

```text
workflow.json
  -> 生成 runner / graph / 可选 nodes/*.py
  -> 注册为用户「我的能力」
  -> 个人助手 / custom agent 调用
```

Coze 开源体系也没有这个能力。Coze 选择的是 schema 由平台解释执行；DeerFlow 可以采用 Python runner / LangGraph graph / 节点 Python 文件化等实现，由 workflow builder 生成代码并发布为用户可调用的 workflow。

### 3. 缺少 Agent 对已有工作流的结构化 patch

目标中的人机协同不是一次性生成，而是循环修改：

```text
用户：把市场调研拆成政策环境和竞品趋势两个节点
Agent：返回对 workflow spec 的 patch
前端：展示变更
用户：确认
后端：更新 spec 并重新生成受影响代码
```

当前 `project_agent` 的输出是普通 `final_output` 文本，并不是结构化 patch。

需要新增：

- `GenerateWorkflowSpec`
- `PatchWorkflowSpec`
- `ExplainWorkflowChange`
- `GenerateNodeCode`
- `ValidateWorkflow`

### 4. 缺少发布态和草稿态

Coze 平台中的工作流会有编辑、保存、发布、运行等状态。Coze Loop 的 Prompt 模块也有 draft/commit 模式。

DeerFlow 目前没有：

```text
draft workflow
generated code
published graph
version history
rollback
```

建议引入：

```text
projects/{project}/workflow.draft.json
projects/{project}/workflow.published.json
projects/{project}/src/
projects/{project}/releases/
projects/{project}/CHANGELOG.md
```

### 5. 缺少节点级调试与可观测

Coze API 和 Studio 调试强调 `debug_url`、节点输入输出、run history。Coze Loop 提供 trace / span / evaluation。

DeerFlow 当前 Gateway 有 run/event/feedback/token usage，但 `project_agent` 缺少针对工作流节点的：

- 节点状态
- 节点输入
- 节点输出
- 节点耗时
- 节点错误
- retry 次数
- node-level trace

这会影响后续复杂业务维护。

## 可借鉴的 Coze 设计

### 1. Canvas 与执行 schema 分离

不要让 React Flow 的 UI JSON 直接成为执行协议。应该明确：

```text
layout / ui：位置、颜色、折叠状态
spec：节点类型、输入输出、handler、边、执行策略
runtime：编译后的 Python graph
```

### 2. 节点类型注册机制

借鉴 Coze 前后端双注册思想：

```text
前端 NodeRegistry
  - 节点展示
  - 表单字段
  - 字段校验
  - 默认值

后端 NodeRegistry
  - 节点 kind
  - schema
  - codegen 模板
  - runtime handler
```

### 3. 控制流与数据流分离

Coze 工作流不是只连线，还关心变量如何传递。DeerFlow spec 应至少显式表达：

```json
{
  "source": "research_company",
  "target": "generate_report",
  "mapping": {
    "company_research": "company_research"
  }
}
```

否则复杂业务里会很快无法维护。

### 4. HITL 中断恢复

Coze 的 `InterruptEvent` / `resume` 模型可以映射到 LangGraph：

```text
node_id
interrupt_type
payload
resume_data
checkpoint_id
```

这对审批、补充输入、人工确认节点很重要。

### 5. Run / Stream / Resume / History API

Coze SDK 的工作流 API 形态值得参考：

```text
run
stream_run
stream_resume
run_history
node_execute_history
```

DeerFlow 目前有 runs 和 SSE，可在 `project_agent` 上补充 workflow 语义。

### 6. Debug URL / 节点运行详情

Coze 的 `debug_url` 思路可以转成 DeerFlow 的：

```text
/workspace/projects/{project}/runs/{run_id}
```

展示：

- DAG
- 当前执行节点
- 每个节点输入输出
- 错误和 retry
- artifact

## 不建议照搬的部分

### 1. 不建议替换为 Go/Eino 运行时

DeerFlow 已经基于 Python、LangGraph、FastAPI、skills、sandbox 和 subagents。引入 Eino 会造成双运行时，成本高且破坏现有架构。

推荐：

```text
借鉴 Coze 的 spec 分层
保留 DeerFlow 的 LangGraph 执行
```

### 2. 不建议把 Code 节点当作发布模型

Coze 的 Code 节点是运行时沙箱片段，不是发布一个可被 DeerFlow agent 稳定调用的业务能力。它不等价于：

```text
skills/custom/{workflow_name}/SKILL.md
skills/custom/{workflow_name}/scripts/run.py
```

DeerFlow 的目标如果是业务确定性和可维护，应生成可 review、可测试、节点独立 Python 文件化的业务 Agent，而不是仅存沙箱片段。主 Agent 拆解子任务后由 subagent 逐节点执行，配合评测与重试机制。

### 3. 不建议依赖 Coze SDK 做图编辑

coze-py / coze-js 不暴露 nodes/edges CRUD。它们只适合参考运行已发布工作流的 API。

### 4. 不建议直接复刻完整 Coze Studio 后端

Coze Studio 是大型平台，Go + DDD + Eino + 多模块 monorepo。DeerFlow 的 MVP 应围绕当前目录结构和 LangGraph 最小闭环建设。

## 推荐目标架构

结合 Coze 调研和 DeerFlow 当前代码，推荐目标架构如下：

```text
project_agent
  -> 生成 / 修改 WorkflowSpec
  -> 前端画布编辑 WorkflowSpec
  -> 后端校验 WorkflowSpec
  -> 发布 Workflow Skill
  -> 用户 review diff
  -> custom agent 加载 skill
  -> Gateway / IM / DeerFlowClient 调用 custom agent
```

### 文件结构建议

```text
skills/custom/{workflow_name}/
├── SKILL.md
├── workflow.draft.json
├── workflow.published.json
├── workflow.schema.json
├── manifest.json
├── scripts/
│   └── run.py
└── tests/
    └── test_workflow_smoke.py
```

复杂 workflow 可以在 skill 内部引用项目图：

```text
projects/{project_name}/
├── workflow.draft.json
├── workflow.published.json
├── workflow.schema.json
├── CHANGELOG.md
├── src/
│   ├── state.py
│   ├── nodes/
│   │   ├── __init__.py
│   │   ├── extract_input.py
│   │   ├── research_company.py
│   │   └── generate_report.py
│   └── graphs/
│       └── workflow_graph.py
├── tests/
│   ├── test_nodes.py
│   └── test_workflow_smoke.py
└── releases/
    └── 2026-05-24-v1/
```

### Spec 分层建议

```json
{
  "version": "1",
  "project": "competitive_analysis",
  "metadata": {
    "title": "Competitive Analysis Workflow"
  },
  "nodes": [
    {
      "id": "research_company",
      "kind": "subagent",
      "description": "Research target company profile.",
      "inputs": {},
      "outputs": {},
      "config": {}
    }
  ],
  "edges": [],
  "ui": {
    "layout": {}
  }
}
```

### 运行策略建议

```text
开发态：允许根据 workflow.draft.json 生成预览 nodes/*.py 和 graph.py
测试态：运行业务 Agent 的 smoke test
发布态：用户通过业务 Agent（主 Agent 拆子任务 + subagent 执行）调用已发布工作流
```

## 路线优先级

### P0：定义 WorkflowSpec

最先补齐。没有 spec，后续 Agent 生成、前端编辑、代码生成都没有稳定契约。

交付：

- Pydantic model 或 JSON Schema。
- React Flow JSON 到 WorkflowSpec 的转换。
- validate API。

### P1：让 project_agent 输出 spec/patch

把当前 `final_output` 文本协议升级为结构化输出。

交付：

- `generate_workflow_spec` prompt。
- `patch_workflow_spec` prompt。
- 前端 chat 带上当前 spec。
- Agent 返回 JSON patch 或完整 spec。

### P2：Spec 到业务 Agent 发布

这是和 Coze 开源最大的差异化。

交付：

- `nodes/*.py` 代码生成器。
- `graphs/workflow_graph.py` 编译器。
- 业务 Agent 注册（`agents/{name}/config.yaml`）。
- 发布 diff 展示。
- smoke test。
- 节点级评测和重试机制。

### P3：运行和调试

借鉴 Coze run/stream/history/debug。

交付：

- workflow run ID。
- node execution events。
- 节点输入输出记录。
- 前端可视化运行态。

### P4：发布与版本

借鉴 Coze Loop 的 draft/commit 思路。

交付：

- draft / published。
- spec hash。
- release metadata。
- changelog。
- rollback。

## 与现有 spec 的关系

本文建议作为 [`workflow-spec.md`](workflow-spec.md) 的外部参考，核心观点是：

1. Coze 验证了 **画布 spec + 节点 schema + 确定性 DAG 运行时** 的可行性。
2. Coze 开源没有提供 **自然语言整图生成** 和 **Python/LangGraph codegen**。
3. DeerFlow 不应照搬 Go/Eino，而应保留 Python/LangGraph 路线。
4. `project_agent` 的差异化应该是 **Agent-assisted workflow building**，即人机协同生成可发布为 skill 的确定性业务工作流。

## 最终判断

Coze 与当前 `project_agent` 需求的契合度可以概括为：

```text
产品形态：高度契合
交互模型：高度可借鉴
schema 分层：高度可借鉴
运行时：思想可借鉴，技术栈不宜照搬
NL 生成整图：开源侧不覆盖
Python codegen：开源侧不覆盖，可作为 DeerFlow 高级实现
workflow skill 发布：DeerFlow 应自研并作为差异化
```

因此，后续建设应避免把目标理解成"复刻 Coze Studio"，而应是：

```text
借鉴 Coze 的工作流产品架构
保留 DeerFlow 的 skills/custom agent/Gateway/Client 结构
补齐 workflow spec -> nodes/*.py -> 业务 Agent 发布 -> 主 Agent 拆子任务 + subagent 执行 -> 确定性交付 闭环
```
