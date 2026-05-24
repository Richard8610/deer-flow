# Project Agent 调研与设计

本目录存放 DeerFlow `project_agent` 相关的**调研、架构分析与方案设计**文档，不含实现计划（实现计划见 `docs/plans/`）。

## 阅读顺序

1. [`workflow-skill-architecture.md`](workflow-skill-architecture.md) — **主路线**：WorkflowSpec → workflow skill → custom agent 调用
2. [`workflow-spec.md`](workflow-spec.md) — 目标愿景、当前实现、差距与里程碑
3. [`coze-workflow-research.md`](coze-workflow-research.md) — Coze 开源工作流调研
4. [`coze-fit-analysis.md`](coze-fit-analysis.md) — 与 Coze 的契合度与可借鉴项
5. [`python-node-design.md`](python-node-design.md) — 可选方案：workflow skill 内部的 Python/LangGraph 一节点一文件

## 文档索引

| 文档 | 类型 | 说明 |
| --- | --- | --- |
| [workflow-skill-architecture.md](workflow-skill-architecture.md) | 架构设计 | 推荐主线：设计/发布 workflow skill，业务通过 Gateway / IM / DeerFlowClient 接入 |
| [workflow-spec.md](workflow-spec.md) | Spec | `project_agent` 目标、非目标、人机协同流程、里程碑 |
| [coze-workflow-research.md](coze-workflow-research.md) | 调研 | Coze Studio / FlowGram / Eino 等工作流能力梳理 |
| [coze-fit-analysis.md](coze-fit-analysis.md) | 分析 | Coze 与 DeerFlow 需求匹配、差距与路线优先级 |
| [python-node-design.md](python-node-design.md) | 备选设计 | 复杂 workflow 在 skill 内部固化为 Python nodes/graph 的方案 |

## 口径说明

- **主路线**：工作流产物形态不重要，关键是能固化为确定流程，并作为 **workflow skill** 被 custom agent 在场景中调用。
- **Coze**：借鉴画布 spec、节点 schema、发布与调试模型；不照搬 Go/Eino 运行时。
- **Python 一节点一文件**：仅作为 workflow skill 内部的高级执行实现，非必选。
