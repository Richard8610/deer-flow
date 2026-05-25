# Workflow Tool Architecture（工作流工具架构）

> **主文档已迁至** [`../workflow-tool/architecture.md`](../workflow-tool/architecture.md)。新内容请只改 workflow-tool 目录。

> **口径**：工作流创建已从中心化 `project_agent` 调整为 **个人助手调用 workflow builder 工具**。本文回答：既然是工具，为什么仍基于 DeerFlow，以及这个工具本身应如何分层设计。

## 1. 结论

**DeerFlow 仍然应该作为企业级 Agent 基座；Workflow Builder 则应作为运行在 DeerFlow 之上的工具 / 应用模块。**

换句话说：

```text
DeerFlow = 企业级 Agent OS / Runtime
Workflow Builder = 构建、编辑、发布 workflow 的工具
Published Workflow = 用户拥有、可安装、可调用的能力资产
```

不应继续把“创建工作流”绑定为某个固定 `project_agent` 的职责。`project_agent` 可以保留为当前代码中的历史实现或内部 builder 能力，但产品和架构主语应是：

```text
用户当前个人助手 Agent
  -> 调用 workflow_builder tool / app
  -> 创建、编辑、测试、发布 workflow
```

## 2. 为什么仍基于 DeerFlow

Workflow Builder 自己不应重造企业级 Agent 基座。DeerFlow 已提供以下能力：

| 能力 | DeerFlow 现状 | Workflow Builder 用法 |
| --- | --- | --- |
| 用户身份 | `user_id`、认证上下文、ContextVar | workflow owner、visibility、fork/install |
| 个人助手 | `lead_agent` + per-user custom agent | 从对话发起创建、修改、运行 workflow |
| 沙箱与文件 | user/thread 隔离的 workspace/uploads/outputs | workflow 测试运行、产物保存、附件输入 |
| Memory | user + agent_name memory | 调用者自己的上下文，不共享作者数据 |
| Tools | `get_available_tools`、tool groups | 暴露 `workflow_builder`、`workflow_runner` |
| Skills | `SkillStorage`、`SKILL.md`、allowed_tools | published workflow 可选包装成 Skill |
| Gateway / IM / Client | Web、飞书、企微、Python Client | workflow 可被不同入口调用 |
| Subagent / LangGraph | 并行执行、评测、重试、状态图 | 复杂 workflow 的执行实现 |

因此，基于 DeerFlow 的理由不是“必须用 `project_agent` 做工作流”，而是：

> Workflow Builder 需要复用 DeerFlow 的用户隔离、Agent 调用、沙箱、工具体系、Skills、Gateway 与企业接入能力。

## 3. 不应该绑定什么

不建议继续采用以下结构：

```text
用户创建工作流
  -> 必须进入 project_agent
  -> project_agent 内部保存 / 编辑 / 发布
  -> project_agent 负责所有运行
```

这样会把工作流工具绑死在单个 Agent 图里，后续很难支持：

- 默认个人助手调用
- 用户自定义 custom agent 调用
- 独立 Workflow Builder 页面
- 分享 / fork / install
- 商店化
- 后端服务 API
- 非 Agent 场景调用

## 4. 推荐分层

```text
┌────────────────────────────────────────────┐
│ DeerFlow Agent Layer                        │
│ lead_agent / custom agent / tools / skills  │
└────────────────────────────────────────────┘
                  │ 调用
                  ▼
┌────────────────────────────────────────────┐
│ Workflow Builder Tool / App                 │
│ 对话创建、patch、打开 Builder、publish       │
└────────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│ Workflow Domain Service                     │
│ draft/published/spec/manifest/fork/install  │
└────────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│ Execution Adapters                          │
│ Python runner / LangGraph graph / Skill 包装 │
└────────────────────────────────────────────┘
```

### 4.1 DeerFlow Agent Layer

职责：

- 用户通过个人助手或 custom agent 发起 workflow 创建、修改、运行。
- Agent 通过 tools 调用 workflow 能力，而不是自己持久化 workflow 数据。
- Agent 使用调用者自己的 `user_id`、thread、sandbox、memory、credentials。

典型工具：

```text
workflow_builder.create(...)
workflow_builder.patch(...)
workflow_builder.open_builder(...)
workflow_builder.publish(...)
workflow_runner.list_my_workflows(...)
workflow_runner.run(...)
```

### 4.2 Workflow Builder Tool / App

职责：

- 提供独立 Workflow Builder 页面。
- 从 Chat 创建 draft 后返回 Builder 链接。
- 允许用户在画布中编辑、保存、测试和发布。
- 后续再增强 Chat 内嵌侧边栏画布。

一期交互：

```text
Chat 创建 draft
  -> 返回 Builder 链接
  -> 用户在 Builder 编辑
  -> 保存
  -> 测试
  -> 发布
```

### 4.3 Workflow Domain Service

这是最核心、最应该独立的领域层。它可以放在 DeerFlow repo 内，但不应依赖某个 Agent 图。

建议 API：

```text
create_draft
get_draft
update_draft
validate
generate_runner
test_run
publish
install
fork
list_my_workflows
run_published
```

核心数据：

```text
workflow.draft.json
workflow.published.json
manifest.yaml
owner_user_id
visibility
collaborators
forked_from
installed_by
spec_hash
runner_entrypoint
```

### 4.4 Execution Adapters

published workflow 可有多种执行形态：

| 形态 | 适用 |
| --- | --- |
| `src/graphs/*.py` | 当前最快落地，贴合 `ai_news_daily` / `travel_planner` |
| Python runner | 简单确定流程 |
| LangGraph graph | 复杂 DAG、状态流转、节点 trace |
| Skill 包装 | 让 Agent 更自然识别和调用 |
| App | 有独立 UI 或表单入口 |

`decompose_v2` 是复杂执行的一种可选实现，不是第一期必须前置的核心。

## 5. 一期落地边界

一期应基于现有能力直接打通最小闭环：

```text
workflow_frontend
  -> 独立 Workflow Builder

skills/public/workflow-code-generator
  -> 代码生成规范和初始生成能力

projects/{name}/workflow.json + src/graphs/*.py
  -> 当前 workflow 产物形态

DeerFlow lead_agent tools
  -> workflow_builder / workflow_runner tool

DeerFlow user_id + Paths
  -> owner_user_id / 我的能力 / sandbox 隔离
```

不建议把所有逻辑继续堆进：

```text
backend/packages/harness/deerflow/agents/project_agent/
```

该目录可以保留为历史实现、兼容入口或内部 builder agent，但不应成为产品架构中心。

## 6. 建议模块布局

```text
workflow_frontend/
  # 独立 Builder UI

backend/app/gateway/routers/workflows.py
  # workflow CRUD / validate / publish / run API

backend/packages/harness/deerflow/workflows/
  spec.py
  storage.py
  registry.py
  publisher.py
  runner.py
  codegen.py

backend/packages/harness/deerflow/tools/builtins/workflow_builder_tool.py
  # create / patch / publish / open_builder

backend/packages/harness/deerflow/tools/builtins/workflow_runner_tool.py
  # list_my_workflows / run_workflow
```

`workflows/` 是核心领域层；`tools/builtins/*` 只是 Agent 接口层；`workflow_frontend/` 是用户交互层。

## 7. 设计原则

- **领域层独立**：workflow 的 draft、publish、fork、install、run 不依赖某个 Agent 图。
- **Agent 只调用工具**：个人助手负责理解用户意图，但持久化和发布由 workflow service 完成。
- **执行用调用者上下文**：共享 workflow 共享流程和代码，不共享作者 sandbox、memory、uploads、credentials。
- **先复用现状**：一期继续使用 `workflow.json` + `src/graphs/*.py`，不强制一节点一文件。
- **渐进包装**：published workflow 可先作为 callable manifest，后续再包装成 Skill 或 App。

## 8. Success Criteria

一期完成后应满足：

- 用户从个人助手发起创建 workflow。
- 系统创建 draft，并打开独立 Workflow Builder。
- Builder 能编辑、保存并触发测试。
- publish 后生成 manifest，并进入当前用户「我的能力」。
- 个人助手能列出并运行用户自己的 published workflow。
- fork / install 后，执行使用调用者自己的数据上下文。

---

**一句话**：DeerFlow 是企业级 Agent 基座；Workflow Builder 是跑在这个基座上的工具。工具要保持自己的领域边界，但要复用 DeerFlow 的用户、Agent、sandbox、tools、skills 和 Gateway。
