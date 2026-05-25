# Workflow Tool Spec

## 1. 背景与愿景

DeerFlow 从通用超级智能体扩展为：用户通过**个人助手**描述需求 → 生成 workflow draft + `workflow.json` + 初始 runner/graph → 在**独立 Workflow Builder** 编辑 → 测试 → **publish** → 进入「我的能力」→ 个人助手 / custom agent 调用。

**核心原则**：AI 参与设计与维护；**运行期**执行已发布的确定流程，而非每次 LLM 即兴编排主流程。

架构与治理见 [architecture.md](architecture.md)、[governance.md](governance.md)。实现快照见 [implementation-status.md](implementation-status.md)。

## 2. 非目标（一期）

- 不把未校验的 React Flow JSON 直接作为生产执行源。
- 不要求 Chat 内嵌画布、多人实时协作、强审批、商店评分。
- 不强制一节点一 `nodes/*.py`（演进见 [../project-agent/python-node-design.md](../project-agent/python-node-design.md)）。
- 不要求第一期支持复杂循环、人工审批、长事务补偿。

## 3. 当前实现（代码事实）

### 3.1 后端

- `backend/langgraph.json`：`lead_agent`、`project_agent`、`competitive_analysis_agent`。
- 通用 `project_agent`：`parse_input → decompose → plan → execute_subtask×N → evaluate → synthesize`（LLM 动态拆解，非读 published DAG）。
- `make_project_agent(name)`：从 `projects/{name}/src/graphs/*.py` 加载；**不读** `workflow.json`。

### 3.2 前端 `workflow_frontend/`

- React Flow 编辑 `nodes/edges`，读写 `projects/{name}/workflow.json`。
- Chat 代理 Gateway；检测响应内 workflow JSON → `POST /api/workflow/projects` 创建工程。
- 独立 dev server（:8002），`/?project={name}` 打开 Builder。

### 3.3 生成与样例

- `skills/public/workflow-code-generator/`：生成完整 `projects/{name}/`（含 `workflow.json`、`src/graphs/*.py`）。
- `project_agent._scaffold_project`：种子目录 + 种子 `workflow.json`。
- 样例：`competitive_analysis`、`ai_news_daily`、`travel_planner`。

### 3.4 关键差距

**前端 `workflow.json` 与后端 Python graph 执行未打通**；无 draft/published 分离、无 publish API、无「我的能力」注册。

当前定位：

```text
后端：工作流 Agent 原型 + Python 项目图加载
前端：独立 Builder 原型（可编辑/保存 workflow.json）
中间：画布持久化；未接入发布与 spec→执行
```

## 4. 目标数据模型（演进）

建议 spec 结构（`nodes/edges` 为执行语义，`ui` 为展示）：

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

节点类型（第一版可限制）：`start`、`end`、`llm`、`subagent`、`tool`、`python`、`condition`。

发布目录（目标）：

```text
users/{owner_user_id}/workflows/{workflow_name}/
├── workflow.draft.json
├── workflow.published.json
├── manifest.yaml
└── src/graphs/{name}.py
```

过渡期仍使用 `projects/{name}/workflow.json`，须逐步补 owner 与 lifecycle 元数据。

## 5. 人机流程

| 阶段 | 流程 |
| --- | --- |
| 新建 | 个人助手描述 → builder/codegen → draft + json + graph → Builder 链接 → 编辑/对话调整 → 保存 → 测试 → publish → 「我的能力」 |
| 修改 | 加载 spec → 结构化 patch → 确认/手改 → 更新 runner → 测试 → 新版本 publish |
| 运行 | Gateway/IM → 个人助手/custom agent → 选 published workflow → runner/graph（**调用者** sandbox/memory/credentials） |
| fork | 复制 spec+代码+manifest；执行不共享作者数据上下文 |

## 6. 与代码映射

> Commit 级对照见 [implementation-status.md](implementation-status.md)。

| 目标 | 当前位置 | 状态 |
| --- | --- | --- |
| LangGraph 入口 | `backend/langgraph.json` | 已注册 |
| 通用流水线 | `agents/project_agent/graph.py` | 已实现 |
| 代码生成 | `skills/public/workflow-code-generator/` | 已实现 |
| 脚手架 | `_scaffold_project()` | 已实现 |
| 样例项目 | `projects/*` | 已实现 |
| Builder + Chat | `workflow_frontend/` | 已实现；缺 publish/我的能力 |
| 持久化 | `projects/{name}/workflow.json` | MVP；非 draft/published |
| 一期闭环 | 个人助手 + 独立 Builder | **部分** |
| 一节点一 py | `src/nodes/` | 未默认 |
| decompose_v2 | — | 未实现 |
| workflow 发布/skill | — | 未实现 |
| NL patch spec | Chat→整图 JSON | 部分 |
| fork/share | — | 未实现 |

## 7. 里程碑

### M1：个人助手 + 独立 Builder 闭环（一期）

- Chat 创建 draft + Builder 链接；编辑保存 `workflow.json`；绑定 `src/graphs/*.py`；test/smoke；publish + manifest + 「我的能力」。
- **验收**：可创建→编辑→保存→运行；个人助手能按名称调用 published workflow。

### M2：可校验 Spec

- Schema/Pydantic；区分执行字段与 UI；validate API。

### M3：对话 Patch + Codegen 增量

- 基于现有 draft 的结构化 patch；diff 展示。

### M4：发布为 Callable Workflow / Skill

- `workflow.published.json`、`manifest`、runner/graph；custom agent 白名单可选用。

### M5：运行与测试

- smoke、节点单测模板、dry-run、节点日志回传。

### M6：版本与分享

- draft/published 分离、版本/回滚、fork/share/install（调用者上下文隔离）。

## 8. 风险与开放问题（摘要）

| 风险 | 建议 |
| --- | --- |
| spec 与 graph 双源 | 开发态 spec 为源；发布态 runner/graph 为执行源；记录 spec_hash |
| 节点副作用 | 边界节点显式声明 `side_effects` |
| LLM 生成代码安全 | 用户确认 + 静态检查 + 模板限制 |

开放问题（节选）：`workflow.json` 是否唯一 source of truth；「我的能力」复用 skills 还是新 registry；对外形态是 tool / skill / app / manifest。

完整历史讨论见 [../project-agent/workflow-spec.md](../project-agent/workflow-spec.md)。
