# Project Agent Workflow Skill Architecture

> **状态说明（2026-05）**：本文档描述的是「workflow skill + custom agent 调用」路线。
> 该路线不再是唯一主线，但其中 **workflow skill 作为 published workflow 的包装形态** 仍可复用。
> 当前新主路线为：**个人助手调用 workflow builder → 独立 Workflow Builder 编辑 → publish → 注册到「我的能力」→ 个人助手 / custom agent 调用**。
> 请参阅 [`workflow-agent-architecture.md`](workflow-agent-architecture.md)。
> 本文保留作为 workflow skill 包装方案参考。

## 背景

此前讨论中，`project_agent` 的目标一度偏向“把工作流固化为 Python/LangGraph 项目代码”，甚至进一步讨论“一节点一 Python 文件”。这个方向仍然有价值，但它不是目标本身。

新的判断是：**工作流的内部产物形态并不是核心，核心是 Agent 能协助用户创建、编辑、维护业务工作流，并把工作流发布为可确定执行、可复用、可交付的能力。**

在 DeerFlow 现有架构中，最自然的发布形态不是“每个业务场景都注册一个新的 LangGraph assistant”，而是把业务工作流沉淀为 **workflow skill**，再让 `lead_agent` 或 custom agent 在合适场景下调用。

## 核心结论

推荐路线（按当前口径修订）：

```text
个人助手 Agent
  -> 调用 workflow builder / workflow-code-generator
  -> 协助设计 / 编辑 / 维护 WorkflowSpec
  -> 独立 Workflow Builder 画布编辑
  -> 生成或维护确定性执行产物
  -> publish 为 callable workflow
  -> 注册到「我的能力」
  -> 可选包装为 workflow skill
  -> 个人助手 / custom agent 按场景调用
```

因此，`project_agent` 的定位应从“业务工作流执行 Agent / 唯一创建主体”调整为：

```text
Workflow Builder Capability:
被用户当前个人助手调用的工作流设计、维护、发布能力。
```

业务运行期的入口则应优先复用 DeerFlow 已有的：

- `lead_agent`
- custom agent (`agent_name`)
- skills
- Gateway runs API
- IM channels
- `DeerFlowClient`

## 为什么 workflow skill 更适合 DeerFlow

### 1. 与现有 Agent 架构一致

当前 Gateway 中，自定义 `assistant_id` 并不会真正切换到一个独立 LangGraph graph，而是转成：

```text
assistant_id: <custom-agent>
  -> lead_agent
  -> runtime context agent_name=<custom-agent>
  -> 加载该 agent 的 SOUL.md / config.yaml / skills
```

这说明业务场景更适合表达为“某个 custom agent 拥有哪些能力”，而不是为每个场景单独注册一个 LangGraph graph。

### 2. Skill 是业务能力的天然封装单元

一个业务工作流 skill 可以包含：

```text
skills/custom/{workflow_name}/
├── SKILL.md
├── workflow.json
├── workflow.schema.json
├── scripts/
│   └── run.py
├── templates/
└── tests/
```

其中：

- `SKILL.md` 描述何时使用、输入要求、输出交付物、注意事项。
- `workflow.json` 保存 Coze 风格的设计态 spec 或画布 schema。
- `scripts/run.py` 或等价实现负责确定性执行。
- `tests/` 保存 smoke test 或关键路径测试。

这比“注册一个新的 `{project}_agent`”更贴近 DeerFlow 当前 skills 体系，也更容易通过 custom agent 的 `skills` 白名单控制可用能力。

### 3. 内部实现可以演进，不绑死节点文件形态

workflow skill 的执行产物可以有多个阶段：

```text
MVP：SKILL.md + 脚本化确定流程
进阶：WorkflowSpec + 模板化 runner
增强：WorkflowSpec + LangGraph graph
复杂场景：WorkflowSpec + Python package + node-level trace
```

这意味着第一版不必强制“一节点一文件”。只要满足以下条件即可：

- 流程确定。
- 输入输出明确。
- 可测试。
- 可审计。
- 能被 Agent 正确识别和调用。
- 能产出稳定交付物。

## 与 Coze 的结合方式

Coze 对 DeerFlow 最值得借鉴的是产品与 schema 分层，而不是 Go/Eino 运行时本身。

建议映射关系：

| Coze 思路 | DeerFlow 对应 |
| --- | --- |
| FlowGram Canvas | `workflow_frontend` 画布 |
| Canvas JSON / schema_json | `workflow.json` / WorkflowSpec |
| NodeSchema | DeerFlow Workflow Node schema |
| Eino DAG 执行 | Python runner 或 LangGraph graph |
| Workflow 发布运行 | workflow skill 发布 |
| workflow_id 调用 | skill name / custom agent name 调用 |
| debug_url / run history | Gateway run events / workflow trace |

新的目标链路：

```text
个人助手对话
  -> workflow builder 生成 WorkflowSpec 草案
  -> workflow_frontend 独立 Builder 编辑
  -> workflow builder 生成或更新 runner / graph / skill 包装
  -> 用户 review / test / publish
  -> 注册到「我的能力」
  -> 个人助手 / custom agent 在业务场景中调用该 workflow
  -> 产出报告、文件、结构化数据或业务动作结果
```

## 三层架构

### 1. 设计态：WorkflowSpec

设计态用于人机协同编辑，不直接作为生产执行源。

```text
workflow.draft.json
workflow.published.json
ui layout
node schema
edge mapping
input/output contract
```

设计态重点解决：

- 用户和 Agent 如何共同理解流程。
- Web 画布如何展示和修改流程。
- 修改如何以 patch 或 diff 形式审查。

### 2. 发布态：Workflow Skill

发布态是给 Agent 使用的能力包。

```text
SKILL.md
workflow.published.json
runner / scripts
manifest
tests
```

发布态重点解决：

- Agent 什么时候应该调用该工作流。
- 调用时需要哪些输入。
- 输出交付物是什么。
- 失败时如何处理。
- 版本和变更如何记录。

### 3. 运行态：Custom Agent 调用

运行态优先使用已有入口。

```text
业务系统
  -> Gateway / IM / DeerFlowClient
  -> assistant_id 或 agent_name
  -> lead_agent/custom_agent
  -> skill selection
  -> workflow skill runner
  -> artifact / answer / structured output
```

这条链路比“每个 workflow 都成为一个独立 LangGraph assistant”更符合当前代码现状。

## 业务接入方式

### HTTP Gateway

适合 Web、后端服务和外部系统接入。

```text
POST /api/runs/stream
assistant_id: competitive-analysis
input.messages: [...]
```

在当前实现中，`competitive-analysis` 应被理解为 custom agent 名，而不是一个独立 graph id。Gateway 会把它注入为 `agent_name`，再由 `lead_agent` 加载对应配置和 skills。

### IM Channels

适合飞书、企业微信、钉钉、Slack、Telegram 等渠道。

```yaml
channels:
  session:
    assistant_id: competitive-analysis
```

渠道层同样会把非 `lead_agent` 的 `assistant_id` 转为 `lead_agent + agent_name`。

### Embedded Python Client

适合 Python 服务内部直接调用 DeerFlow，不启动 HTTP Gateway。

```python
from deerflow.client import DeerFlowClient

client = DeerFlowClient(agent_name="competitive-analysis")
result = client.chat("请分析这家公司：示例公司")
```

这个方式适合业务后端嵌入式集成，但当前也是 custom agent 路线，不是直接调用 `project_agent` 生成的独立 graph。

## 与项目 graph 路线的关系

当前代码中仍有 `project_agent` 和 `competitive_analysis_agent` 的 LangGraph 注册：

```text
backend/langgraph.json
  project_agent
  competitive_analysis_agent
```

也有 `make_project_agent(project_name)` 从 `projects/{name}/src/graphs/` 动态加载 Python graph 的能力。

这条路线可以保留为高级执行后端，但不应作为第一优先级的业务接入模型。原因是当前 Gateway 兼容层的 `resolve_agent_factory()` 固定走 `make_lead_agent`，非默认 `assistant_id` 会被解释为 custom agent 名，而不是直接映射到 `langgraph.json` 中的 graph。

因此建议：

1. **短期**：发布 workflow skill，由 custom agent 调用。
2. **中期**：workflow skill 内部可调用确定性 Python runner 或 LangGraph graph。
3. **长期**：如果需要低延迟、强图运行态、节点级恢复，再补 Gateway 对 project graph 的直连执行。

## MVP 建设路线

### Phase 1：定义 workflow skill 产物协议

交付：

- `SKILL.md` 模板。
- `workflow.published.json` 最小 schema。
- `manifest.json`，记录版本、输入输出、runner、spec hash。
- smoke test 约定。

验收：

- 一个 workflow skill 能被 skills 系统加载。
- custom agent 可通过 skills 白名单只启用该工作流。

### Phase 2：workflow builder 生成 WorkflowSpec

交付：

- `GenerateWorkflowSpec` prompt。
- `PatchWorkflowSpec` prompt。
- 前端 chat 携带当前 workflow draft。
- Agent 返回结构化 spec 或 patch。

验收：

- 用户能用自然语言创建业务流程草案。
- 用户能用自然语言修改已有流程。

### Phase 3：发布为 workflow skill

交付：

- `WorkflowSpec -> SKILL.md` 生成器。
- `WorkflowSpec -> runner` 生成器或模板。
- 发布前 validate / dry-run。
- 发布后更新 custom agent config 的 skills 白名单。

验收：

- 新建的业务工作流可以作为 skill 被 custom agent 调用。
- 调用结果能稳定产出指定交付物。

### Phase 4：Coze 风格画布增强

交付：

- UI layout 与执行 spec 分离。
- 节点类型注册。
- 输入输出 schema。
- 运行态节点状态展示。

验收：

- 前端画布能解释、编辑、验证 workflow skill 的设计态 spec。

### Phase 5：可选 LangGraph 固化

交付：

- 对复杂 workflow 生成 LangGraph graph。
- 节点级 trace。
- resume / interrupt。
- project graph 与 Gateway 直连执行能力。

验收：

- 复杂业务流程可在 LangGraph 中确定执行，并能通过统一入口被 custom agent 或 Gateway 使用。

## 对既有文档的口径修正

已有文档中提到的“一节点一 Python 文件”和“Python graph codegen”应降级为 **一种可选实现策略**，而不是 workflow builder 的唯一目标。

新的主线应是：

```text
Agent-assisted workflow building
  -> WorkflowSpec
  -> Published Workflow / Workflow Skill
  -> 我的能力
  -> 个人助手 / Custom Agent 使用
  -> 业务系统接入
```

保留原则：

- 工作流必须能固化为确定流程。
- 运行期不依赖 LLM 即兴决定主流程。
- 业务交付物必须稳定。
- 设计态可借鉴 Coze。
- 运行态优先复用 DeerFlow skills/custom agent/Gateway/Client。

## 最终建议

`project_agent` 不应被设计成“每次直接替用户执行所有业务工作流”的入口，也不应成为唯一的创建主体；它应成为 DeerFlow 内部的 **Workflow Builder Capability**：

```text
它被用户当前个人助手调用，帮助用户把业务经验沉淀成 published workflow；
published workflow 注册到「我的能力」，可选包装成 workflow skill；
个人助手 / custom agent 负责在真实业务场景中识别并调用这些 workflow；
Gateway、IM 和 DeerFlowClient 负责把能力接入业务系统。
```

这样既能结合 Coze 的低代码工作流体验，又能最大化复用 DeerFlow 已有的 agent、skills、sandbox、Gateway 和 embedded client 能力。
