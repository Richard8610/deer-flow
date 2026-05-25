# 实现进展快照

> **基线**：`259eda94` … `ad004d05`（2026-05-25）。  
> **对照设计**：[architecture.md](architecture.md)、[spec.md](spec.md)、[governance.md](governance.md)。

## 1. 近期提交（workflow 相关）

| Commit 区间 | 方向 | 要点 |
| --- | --- | --- |
| `d4e8a141` … `a4614c61` | `workflow_frontend` | React Flow、`workflow.json` 读写、Chat、Gateway 流式、**AI 生成 workflow 落盘** |
| `ec51f1de` | `project_agent` + skill | `workflow-code-generator`；`_scaffold_project` 种子 `workflow.json` |
| `3c4deef8` … `ad004d05` | `projects/` | `ai_news_daily`、`travel_planner` 样例 |
| `c6116bb9` | `project_agent` | Send API 子任务与 graph 对齐 |

## 2. 设计 vs 落地

| 主题 | 目标 | 当前 |
| --- | --- | --- |
| 创建主体 | 个人助手 + workflow builder + 独立 Builder | **部分**：前端+codegen 有；缺 publish/我的能力 |
| 源码形态 | 一节点一 py（演进） | **`src/graphs/{project}.py` + workflow.json** |
| Spec | draft / published 双文件 | **`projects/{name}/workflow.json`** |
| 拆解 | `decompose_v2` 读 published DAG | 仍 **LLM decompose** |
| 发布 | manifest + 「我的能力」 | **未实现** |
| RBAC | 人人可建（治理） | 代码**无硬编码**限制 |
| 前端 | 独立 Builder | **`workflow_frontend/` :8002** |

**结论**：已打通「对话 → 脚手架/生成 → Builder 编辑 workflow.json → 样例 StateGraph」基础；下一步建设 **test/publish/我的能力** 最小闭环（见 spec M1）。

## 3. 已具备（可 demo）

- **`workflow_frontend/`**：列表/读写 `workflow.json`；Chat 检测 JSON → `POST` 创建 project；`/?project=` 打开 Builder；Gateway 联调。
- **`project_agent`**：规划→子任务→执行→评估；`_scaffold_project`；build 类需求插入 workflow-code-generator 子任务。
- **`workflow-code-generator` skill**：完整 `projects/{name}/` 布局规范。
- **`projects/`**：`competitive_analysis`、`ai_news_daily`、`travel_planner`。

## 4. 仍缺（里程碑）

- `workflow.draft` / `workflow.published` 与 publish API
- workflow registry / callable manifest / 「我的能力」
- `decompose_v2`、workflow.json → 执行编译
- workflow skill 包装、custom agent 选用
- fork / share / collaborate（治理已定）
- `workflow_frontend` 与主站 `frontend/` 整合（见 [frontend-integration.md](frontend-integration.md)）

## 5. 建议代码落点（下一迭代）

见 [architecture.md §5](architecture.md#5-建议代码布局)：`deerflow/workflows/` 领域层、`workflow_builder_tool` / `workflow_runner_tool`、Gateway `workflows.py`。

---

**维护**：大迭代后更新 §1、§2 即可。
