# Project Agent（Workflow Agent）调研与设计

本目录存放 DeerFlow `project_agent`（也称 `workflow_agent`）相关的**调研、架构分析与方案设计**文档，不含实现计划（实现计划见 `docs/plans/`）。

## 核心定位

`project_agent` 定位为**仿 Coze 编程式工作流的人机协同编排助手**。用户（管理员/开发者）通过自然语言与 Web 画布协同创建业务 Agent 及其工作流，工作流每个节点为独立 Python 文件，发布后由业务 Agent 调度子 Agent 执行。

## 阅读顺序

1. [`workflow-agent-architecture.md`](workflow-agent-architecture.md) — **主路线**：project_agent 协助创建业务 Agent + 工作流，节点 Python 文件化，主 Agent 拆子任务 → subagent 执行 → 评测/重试 → 整合
2. [`python-node-design.md`](python-node-design.md) — 一节点一 Python 文件方案（主路线）
3. [`workflow-spec.md`](workflow-spec.md) — 目标愿景、当前实现、差距与里程碑
4. [`enterprise-deployment.md`](enterprise-deployment.md) — 企业部署架构：角色权限、沙箱隔离、自动伸缩、数据持久化
5. [`agent-skill-marketplace.md`](agent-skill-marketplace.md) — Agent/Skills 商店管理设计
6. [`coze-workflow-research.md`](coze-workflow-research.md) — Coze 开源工作流调研
7. [`coze-fit-analysis.md`](coze-fit-analysis.md) — 与 Coze 的契合度与可借鉴项

## 文档索引

| 文档 | 类型 | 说明 |
| --- | --- | --- |
| [workflow-agent-architecture.md](workflow-agent-architecture.md) | 架构设计 | 主路线：project_agent 创建业务 Agent+工作流，主 Agent 拆解 → subagent 执行 → 评测重试 → 整合 |
| [python-node-design.md](python-node-design.md) | 节点设计 | 一节点一 Python 文件方案（已定为主路线） |
| [workflow-spec.md](workflow-spec.md) | Spec | 目标愿景、非目标、当前实现、差距、目标架构 |
| [enterprise-deployment.md](enterprise-deployment.md) | 架构设计 | 企业部署：权限分级、用户 sandbox 隔离、自动伸缩、数据持久化 |
| [agent-skill-marketplace.md](agent-skill-marketplace.md) | 功能设计 | Agent/Skills 商店管理：发布、审批、按权限选用 |
| [coze-workflow-research.md](coze-workflow-research.md) | 调研 | Coze Studio / FlowGram / Eino 等工作流能力梳理 |
| [coze-fit-analysis.md](coze-fit-analysis.md) | 分析 | Coze 与 DeerFlow 需求匹配、差距与路线优先级 |

## 口径说明（2026-05 更新）

- **主路线**：project_agent 协助管理员/开发者创建业务 Agent 及工作流，每个工作流节点是独立 Python 文件，发布后由业务 Agent 调度 subagent 逐节点执行，最终由主 Agent 整合结果（含评测机制与重试机制）。
- **Coze 参考**：借鉴画布交互、节点 schema、发布与调试模型；不照搬 Go/Eino 运行时。DeerFlow 基于 Python + LangGraph。
- **企业场景**：部署一整套 DeerFlow，角色分权限使用，每个用户独立 sandbox，运维层面支持自动伸缩与数据持久化。
- **Agent/Skills 商店**：custom agent 和 skills 具备商店式管理，普通用户按权限选用。