# Coze 工作流开源调研

## 调研目标

本文聚焦 [coze-dev](https://github.com/coze-dev) 公开仓库中与工作流相关的实现，重点回答：

- Coze 开源体系中工作流是如何表达、编辑和执行的？
- 哪些仓库和目录对 DeerFlow `project_agent` 有参考价值？
- Coze 是否提供自然语言生成整张工作流、工作流图结构 API、或 spec 到 Python 代码生成能力？

本文只覆盖公开仓库与公开文档，不假设商业版 Coze 的闭源能力。

## 总体结论

Coze 开源体系中，工作流相关能力主要分布在：

- [coze-studio](https://github.com/coze-dev/coze-studio)：核心，全栈 Agent/Workflow 开发平台。
- [flowgram.ai](https://github.com/bytedance/flowgram.ai)：Coze Studio 的可视化工作流画布底层框架。
- [cloudwego/eino](https://github.com/cloudwego/eino)：Coze Studio 后端工作流确定性执行的 DAG 引擎。
- [coze-py](https://github.com/coze-dev/coze-py) / [coze-js](https://github.com/coze-dev/coze-js)：调用已发布工作流的 SDK。
- [coze-loop](https://github.com/coze-dev/coze-loop)：Agent 观测、评测、Prompt 管理平台，偏研发运维，不是工作流编排器。

Coze Studio 的工作流路线可以概括为：

```text
FlowGram Canvas
  -> Canvas JSON / schema_json
  -> 后端 NodeSchema
  -> Eino Workflow / Lambda
  -> /v1/workflow/run 或 /v1/workflow/stream_run
```

它更像是 **画布 spec + 中心化 Go/Eino 运行时**。公开仓库中未见完整的 **自然语言生成整张工作流** 或 **workflow spec 生成 Python/LangGraph 项目代码** 的实现。

## 仓库相关性

| 仓库 | 相关性 | 工作流相关价值 |
| --- | --- | --- |
| [coze-studio](https://github.com/coze-dev/coze-studio) | 高 | 画布、节点 schema、DAG 编译、节点执行、流式运行、中断恢复 |
| [flowgram.ai](https://github.com/bytedance/flowgram.ai) | 高 | Canvas、Form Engine、Variable Engine、节点物料、画布运行时 |
| [cloudwego/eino](https://github.com/cloudwego/eino) | 高 | Go 侧工作流执行引擎，负责确定性 DAG 调度 |
| [coze-loop](https://github.com/coze-dev/coze-loop) | 中 | Trace、评测、Prompt draft/commit，可参考观测和版本模型 |
| [coze-py](https://github.com/coze-dev/coze-py) | 中低 | 工作流运行、流式、恢复、历史 API；不暴露图结构 |
| [coze-js](https://github.com/coze-dev/coze-js) | 中低 | JS/TS SDK，支持 workflow run/stream/resume |
| [cozeloop-python](https://github.com/coze-dev/cozeloop-python) | 低 | Trace/Prompt SDK，无 workflow 编排 API |
| [rush-arch](https://github.com/coze-dev/rush-arch) | 低 | Rush monorepo 模板，与业务工作流编排关系弱 |

## Coze Studio 工作流架构

[coze-studio](https://github.com/coze-dev/coze-studio) 是调研中最重要的仓库。它是 Coze 开源版 Agent 开发平台，包含工作流编辑、Agent、插件、知识库、调试和发布等能力。

### 核心分层

Coze Studio 工作流大致分为三层：

```text
前端画布层
  FlowGram Canvas / Node Form / Variable Engine

中间 schema 层
  Canvas Node / Edge / schema_json
  NodeSchema / WorkflowSchema

后端执行层
  Eino Workflow / Lambda
  NodeBuilder / InvokableNode / StreamableNode
```

这三个层次的设计值得重点参考：

1. **Canvas JSON 不直接等于运行时对象**  
   前端保存画布结构，后端经过 adaptor 和 validate 后转成执行 schema。

2. **节点类型前后端双注册**  
   前端决定节点如何展示、配置、校验；后端决定节点如何执行。

3. **控制流和数据流分离**  
   DAG 中的连线不仅表示执行顺序，也包含变量映射、分支跳过、输入输出流转。

4. **工作流执行由确定性引擎负责**  
   LLM 可以是节点之一，但图结构执行由 Eino 驱动，不由 LLM 每次临时判断。

### 关键目录和文件

| 主题 | 路径/链接 | 说明 |
| --- | --- | --- |
| IDL / API 契约 | [`idl/workflow/workflow.thrift`](https://github.com/coze-dev/coze-studio/blob/main/idl/workflow/workflow.thrift) | 工作流、节点类型、运行接口等定义 |
| 画布 VO | [`backend/domain/workflow/entity/vo/canvas.go`](https://github.com/coze-dev/coze-studio/blob/main/backend/domain/workflow/entity/vo/canvas.go) | 画布节点和边的后端表示 |
| 执行 schema | [`backend/domain/workflow/internal/schema/`](https://github.com/coze-dev/coze-studio/tree/main/backend/domain/workflow/internal/schema) | NodeSchema / WorkflowSchema |
| 构图与执行 | [`backend/domain/workflow/internal/compose/`](https://github.com/coze-dev/coze-studio/tree/main/backend/domain/workflow/internal/compose) | 将 schema 构造成 Eino 工作流 |
| 节点实现 | [`backend/domain/workflow/internal/nodes/`](https://github.com/coze-dev/coze-studio/tree/main/backend/domain/workflow/internal/nodes) | LLM、Code、QA、Loop、Batch、SubWorkflow 等节点 |
| 中断事件 | [`interrupt_event.go`](https://github.com/coze-dev/coze-studio/blob/main/backend/domain/workflow/entity/interrupt_event.go) | human-in-the-loop 中断/恢复 |
| 前端工作流 | [`frontend/packages/workflow/`](https://github.com/coze-dev/coze-studio/tree/main/frontend/packages/workflow) | 工作流画布、节点、测试运行、变量等 |
| FlowGram 适配 | [`frontend/packages/common/flowgram-adapter/`](https://github.com/coze-dev/coze-studio/tree/main/frontend/packages/common/flowgram-adapter) | 对 FlowGram 的平台封装 |
| 子图封装 | [`frontend/packages/workflow/feature-encapsulate/`](https://github.com/coze-dev/coze-studio/tree/main/frontend/packages/workflow/feature-encapsulate) | 选中节点封装为子工作流 |
| 工作流 API | [API Reference Wiki](https://github.com/coze-dev/coze-studio/wiki/6.-API-Reference) | run、stream_run、resume、debug_url |
| 新增节点文档 | [前端节点 Wiki](https://github.com/coze-dev/coze-studio/wiki/10.-Add-new-workflow-node-types-(frontend)) / [后端节点 Wiki](https://github.com/coze-dev/coze-studio/wiki/11.-Add-new-workflow-node-types-(backend)) | 节点开发方式 |

## 工作流表达：Canvas JSON 与 NodeSchema

Coze Studio 的公开资料显示，工作流不是直接以 SDK 暴露的 `nodes/edges` CRUD API 管理，而是在 Studio 内部以画布 JSON 和后端 schema 管理。

典型链路：

```text
前端 FlowGram 节点
  -> Canvas Node / Edge
  -> schema_json
  -> NodeSchema
  -> Eino Lambda
```

这说明 Coze 并不是让用户直接写执行代码，而是维护一个可解释的 workflow schema，再由平台后端执行。

对 DeerFlow 有价值的点：

- 可以借鉴 Canvas JSON 与执行 schema 分离的设计。
- 可以借鉴节点类型、输入输出、异常配置、流式配置的 schema 化。
- 可以借鉴前后端节点注册的一致性检查。

对 DeerFlow 不可直接复用的点：

- Coze 的执行端是 Go + Eino，不是 Python + LangGraph。
- Coze Studio 不导出 `projects/{name}/src/nodes/*.py` 这种 Git 可版本化项目代码。
- Coze 的工作流 spec 更像平台运行时数据，不是 Python 项目源码。

## 工作流执行：Eino DAG

Coze Studio 后端使用 [Eino](https://github.com/cloudwego/eino) 作为 Agent/Workflow 编排框架。它将 NodeSchema 编译为可执行图，支持：

- DAG 编排
- 节点 Lambda
- 控制流
- 数据流
- 流式输出
- interrupt / resume
- 复合节点或子工作流

这对 DeerFlow 的启发是：**确定性执行层应该与 AI 设计层分离**。在 DeerFlow 中，对应的执行引擎应是 LangGraph；LLM 可以辅助生成/修改 spec，但发布后的工作流应由 LangGraph 确定性执行。

## 可视化编辑：FlowGram

[FlowGram](https://github.com/bytedance/flowgram.ai) 是 Coze Studio 画布底层框架，提供：

- Free layout / fixed layout 画布
- 表单引擎
- 变量引擎
- 节点物料
- 条件、循环、代码编辑器等能力
- 工作流 runtime 模块

如果 DeerFlow 继续加强 `workflow_frontend`，可以参考 FlowGram 的几个设计方向：

- 节点表单与节点类型解耦。
- 变量作用域和类型推断独立建模。
- UI layout 与执行语义分离。
- 复杂节点如 Loop、Batch、SubWorkflow 作为复合节点处理。

## 人机协同与中断恢复

Coze Studio 支持问答节点、输入节点、LLM 工具调用等中断恢复场景。公开资料中的关键词包括：

- `InterruptEvent`
- `ResumeRequest`
- `Question`
- `InputNode`
- `stream_resume`

对 DeerFlow 的启发：

- 工作流执行过程中需要明确的 `node_path` 或 `node_id`。
- 中断事件应保存用户待回答的问题、节点上下文和恢复所需数据。
- 恢复时不应整图重跑，而应基于 checkpoint 从中断点继续。
- LangGraph 的 interrupt/checkpoint 可以承接这类设计。

## SDK：只执行已发布工作流，不编辑图

[coze-py](https://github.com/coze-dev/coze-py) 和 [coze-js](https://github.com/coze-dev/coze-js) 主要面向 Open API 调用方，提供：

- 非流式运行：`/v1/workflow/run`
- 流式运行：`/v1/workflow/stream_run`
- 中断恢复：`/v1/workflow/stream_resume`
- 对话流：`/v1/workflows/chat`
- 异步历史与节点执行历史

典型调用只需要：

```json
{
  "workflow_id": "xxx",
  "parameters": {
    "input": "..."
  }
}
```

SDK 不暴露完整的 `nodes/edges` 图结构，也不提供工作流画布 CRUD 或 spec 到代码生成能力。

因此，SDK 对 DeerFlow 的参考价值主要是：

- 发布后通过 `workflow_id` 或 `assistant_id` 调用。
- 支持 `run / stream / resume / history` 的 API 形态。
- 流式事件中携带节点标题、节点序号、完成状态等运行态信息。

## Coze Loop：观测、评测与版本模型

[coze-loop](https://github.com/coze-dev/coze-loop) 不是工作流编排平台，而是 AI Agent 优化平台，主要能力包括：

- Trace / Span
- Prompt 管理
- Playground
- 评测集
- 实验
- 全链路观测

对 DeerFlow `project_agent` 的价值集中在后期里程碑：

### 运行与测试

可以借鉴：

- 节点级 span 树
- run trace 查询
- 评测集与 experiment
- 轨迹分析

### 发布与版本

可以借鉴 Prompt 模块中的 draft/commit 模式：

```text
PromptDraft
PromptCommit
version
base_version
description
committed_at
```

这可以映射为 DeerFlow 的：

```text
WorkflowDraft
WorkflowRelease
spec_hash
workflow_version
published_at
changelog
```

但 coze-loop 并不提供 workflow DSL，也不提供图执行或 Python codegen。

## 开源 Coze 未覆盖的能力

公开仓库中没有看到以下能力的完整实现：

1. **自然语言生成整张 workflow graph**  
   Coze Studio 有 Copilot 相关类型，但公开代码中主要用于测试输入、定时脚本、onboarding 等局部辅助，并非完整 NL -> workflow graph。

2. **workflow graph 导出为 Python 项目代码**  
   Coze Studio 运行时是 Go + Eino。Code 节点支持 Python/JS 沙箱片段，但不是把整个工作流生成到仓库中的 Python 文件。

3. **SDK 读写图结构**  
   coze-py / coze-js 能运行已发布 workflow，但不能 CRUD 画布图。

4. **Git 风格工作流代码版本化**  
   Coze 更接近平台内版本管理；不是 `projects/{name}/src/nodes/*.py` 这种仓库源码模式。

## 对 DeerFlow 可借鉴的设计清单

### 高优先级

- Workflow spec 与 UI layout 分离。
- 节点类型 schema 化。
- 前端节点表单与后端节点执行双注册。
- 控制流和数据流分离。
- 节点级运行状态、debug_url 或 trace。
- 中断恢复模型。
- 已发布 workflow 通过稳定 ID 执行。

### 中优先级

- 子图封装为 SubWorkflow。
- Loop / Batch / Condition 等复合节点。
- 单节点试运行。
- 变量作用域和类型推断。
- Draft / Release 版本模型。

### 低优先级或不建议直接照搬

- 直接引入 Go/Eino 运行时替换 LangGraph。
- 直接复刻 Coze Studio 的完整 DDD 后端。
- 依赖 Coze SDK 获取图结构。
- 把 Code 节点沙箱片段当作 DeerFlow 的代码生成方案。

## 推荐阅读顺序

1. [coze-studio README](https://github.com/coze-dev/coze-studio)
2. [Coze Studio API Reference Wiki](https://github.com/coze-dev/coze-studio/wiki/6.-API-Reference)
3. [Add new workflow node types - frontend](https://github.com/coze-dev/coze-studio/wiki/10.-Add-new-workflow-node-types-(frontend))
4. [Add new workflow node types - backend](https://github.com/coze-dev/coze-studio/wiki/11.-Add-new-workflow-node-types-(backend))
5. [flowgram.ai](https://github.com/bytedance/flowgram.ai)
6. [cloudwego/eino](https://github.com/cloudwego/eino)
7. [coze-py workflows](https://github.com/coze-dev/coze-py)
8. [coze-js workflow example](https://github.com/coze-dev/coze-js/blob/main/examples/coze-js-node/src/workflow.ts)
9. [coze-loop](https://github.com/coze-dev/coze-loop)

## 小结

Coze 开源体系对 DeerFlow `project_agent` 最有参考价值的是：

```text
画布 spec
  -> 后端执行 schema
  -> 确定性 DAG 运行时
  -> 流式运行 / 中断恢复 / 调试观测
```

但它并没有提供 DeerFlow 目标中最关键的：

```text
自然语言生成整图
  -> Web 协同编辑
  -> 生成 Python nodes/graph
  -> Git 可版本化
  -> LangGraph 确定性执行
```

因此，Coze 可以作为 **产品交互、schema 分层、节点注册、运行调试** 的参考，但 `workflow.json -> Python/LangGraph 项目代码` 这条链路需要 DeerFlow 自研。

结合后续 `project_agent` 路线调整，DeerFlow 不必把 Python/LangGraph codegen 作为唯一目标。更推荐的集成形态是：

```text
WorkflowSpec / 画布 schema
  -> workflow skill
  -> custom agent 调用
  -> 确定性 runner 或 LangGraph graph
```

也就是说，Coze 主要启发 DeerFlow 如何设计和维护工作流；DeerFlow 则应优先复用自身的 skills、custom agent、Gateway、IM channels 和 `DeerFlowClient` 来完成业务接入。
