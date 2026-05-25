# Workflow Tool 设计文档

本目录是 **Workflow Builder / Workflow Tool** 的**唯一主阅读入口**。后续只看这里即可把握产品定位、架构分层、规格、治理与当前落地差距。

实现计划见 `docs/plans/`。历史调研与 `project_agent` 相关旧文档见 [../project-agent/README.md](../project-agent/README.md)。

## 核心定位

- **DeerFlow**：企业级 Agent 基座（用户、个人助手、沙箱、工具、Skills、Gateway）。
- **Workflow Tool**：跑在 DeerFlow 之上的工作流构建与调用能力。
- **用户入口**：当前个人助手 Agent 通过对话创建；在**独立 Workflow Builder** 中编辑；发布后进入「我的能力」，可被个人助手或用户自己的 custom agent 调用。
- **共享原则**：分享 / fork 只复制流程与代码，**不共享作者**的 sandbox、memory、uploads、credentials。

`project_agent` 仅是当前代码中的历史实现名，**不是**工作流创建的产品主体。

## 阅读顺序

| 顺序 | 文档 | 说明 |
| --- | --- | --- |
| 1 | [implementation-status.md](implementation-status.md) | 当前代码能做什么、还缺什么（先看） |
| 2 | [architecture.md](architecture.md) | 为什么仍基于 DeerFlow、四层架构、模块布局 |
| 3 | [frontend-integration.md](frontend-integration.md) | **工作流画布如何作为右栏并入主站 Chat**（基于代码） |
| 4 | [governance.md](governance.md) | 人人可建、发布/分享/fork/协作；数据权限后置 |
| 5 | [spec.md](spec.md) | 数据模型、人机流程、里程碑、与代码映射 |

## 一期目标（一句话）

```text
个人助手 → workflow_builder → draft + workflow.json + runner/graph
→ 独立 Builder 编辑 → 测试 → publish → 「我的能力」→ 个人助手 调用
```

**前端 MVP**：Builder 以 **React 组件**并入主站右栏（见 [frontend-integration.md](frontend-integration.md)）；Web Component / Vue 解耦不在一期。

不要求一期实现：Chat 内嵌画布、多人实时协作、强审批、商店评分、一节点一 py 全线落地、Builder 框架解耦。

## 延伸阅读（不在本目录重复）

| 主题 | 位置 |
| --- | --- |
| Coze 调研与契合度 | [../project-agent/coze-workflow-research.md](../project-agent/coze-workflow-research.md)、[coze-fit-analysis.md](../project-agent/coze-fit-analysis.md) |
| 一节点一 Python 文件（演进） | [../project-agent/python-node-design.md](../project-agent/python-node-design.md) |
| 企业部署 / 沙箱伸缩 | [../project-agent/enterprise-deployment.md](../project-agent/enterprise-deployment.md) |
| 商店与分发 | [../project-agent/agent-skill-marketplace.md](../project-agent/agent-skill-marketplace.md) |
| 历史 `project_agent` 架构长文 | [../project-agent/workflow-agent-architecture.md](../project-agent/workflow-agent-architecture.md) |
