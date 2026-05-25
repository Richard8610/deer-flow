# Workflow Agent Architecture（Project Agent 架构）

## 背景

经过多次讨论与澄清，工作流创建的核心定位已从中心化 `project_agent` 调整为：**每个用户使用自己的个人助手 Agent，通过对话调用 workflow builder 能力，并在独立 Workflow Builder 画布中编辑、测试、发布工作流**。`project_agent` 可以继续作为当前代码中的实现骨架存在，但产品与架构概念上应退化为 workflow builder capability，而不是唯一创建主体。**初期人人可建**，治理见 [workflow-governance.md](workflow-governance.md)。

核心设计原则：**最大化复用 DeerFlow 2.0 现有架构能力，在成熟骨架之上做确定性增强，而非另起炉灶。** 但复用 DeerFlow 不等于把工作流工具绑死在 `project_agent` 图里：DeerFlow 是企业级 Agent 基座，Workflow Builder 是运行其上的工具 / 应用模块。工具分层详见 [workflow-tool-architecture.md](workflow-tool-architecture.md)。

### 当前 MVP（2026-05，相对目标架构）

> 详见 [implementation-status.md](implementation-status.md)。

| 能力 | 状态 |
| --- | --- |
| `workflow_frontend` 独立 Builder + Chat 落盘 `workflow.json` | ✅ |
| `workflow-code-generator` skill + `_scaffold_project` | ✅ |
| 示例 `projects/ai_news_daily`、`travel_planner`（`src/graphs/*.py`） | ✅ |
| 个人助手调用 workflow builder → Builder 编辑 → publish → 注册「我的能力」 | ❌ 待打通 |
| `workflow.draft` / `published`、decompose_v2、逐节点 `nodes/*.py` | ❌ 规划 |

**执行真相源（当前）**：`projects/{name}/src/graphs/{project}.py` + 画布 `workflow.json`；**非** `workflow.published.json` 驱动拆解。一期目标不是退回纯对话 MVP，而是直接复用独立 Builder，把当前能力串成可创建、可编辑、可测试、可发布、可调用的闭环。

---

## 一、DeerFlow 2.0 现有架构能力总览

理解现有能力是「发挥架构优势」的前提。

### 1.1 Subagent 体系 🟢 核心复用

| 能力 | 现状 | 架构文档 |
|------|------|---------|
| `SubagentConfig` | name / description / system_prompt / tools 白名单 / skills / model / max_turns / timeout | [config.py](file:///Users/fengrunda/myWork/gitLab_unicom/智能体/deerflow-unicom-gd/backend/packages/harness/deerflow/subagents/config.py) |
| `SubagentExecutor` | `execute_async()` 异步后台执行，状态跟踪 PENDING→RUNNING→COMPLETED/FAILED | [executor.py](file:///Users/fengrunda/myWork/gitLab_unicom/智能体/deerflow-unicom-gd/backend/packages/harness/deerflow/subagents/executor.py) |
| `SubagentRegistry` | built-in（general-purpose / bash）+ config.yaml custom_agents 层叠覆盖 | [registry.py](file:///Users/fengrunda/myWork/gitLab_unicom/智能体/deerflow-unicom-gd/backend/packages/harness/deerflow/subagents/registry.py) |
| 并行执行 | `_run_subagents_parallel()` — LangGraph Send API fan-out → 轮询完成 | [nodes.py:L73-L90](file:///Users/fengrunda/myWork/gitLab_unicom/智能体/deerflow-unicom-gd/backend/packages/harness/deerflow/agents/project_agent/nodes.py#L73-L90) |
| 递归限制 | `SubagentLimitMiddleware` 截断过深调用 | [subagent_limit_middleware.py](file:///Users/fengrunda/myWork/gitLab_unicom/智能体/deerflow-unicom-gd/backend/packages/harness/deerflow/agents/middlewares/subagent_limit_middleware.py) |

> **我们的用法**：业务 Agent 工作流的每个节点 → 即时注册为 `SubagentConfig` → `SubagentExecutor` 执行 → 并行/串行调度由主 Agent graph 的 Send API 控制。

### 1.2 Sandbox 体系 🟢 核心复用

| 能力 | 现状 |
|------|------|
| 抽象 Sandbox 接口 | `execute_command` / `read_file` / `write_file` / `download_file` / `list_dir` |
| Local Sandbox | 本地文件系统沙箱 |
| SandboxMiddleware | before_agent 获取沙箱 → after_agent 释放 |
| 用户数据挂载 | `/mnt/user-data/uploads/` / `workspace/` / `outputs/` |
| Skills 挂载 | `/mnt/skills/{category}/{skill_name}/` |
| 安全控制 | path traversal 防护、host bash 开关 |

> **我们的用法**：每个用户独立 sandbox（`per_user` 策略）。工作流节点通过 sandbox 读写中间文件和交付物。无需修改。

### 1.3 Memory 体系 🟢 核心复用

| 能力 | 现状 |
|------|------|
| `FileMemoryStorage` | 按 user_id + agent_name 索引的 JSON 文件存储 |
| 记忆结构 | user.workContext / personalContext / topOfMind + history + facts |
| MemoryMiddleware | 在系统提示中按 token 预算注入跨会话记忆 |
| Agent 专属记忆 | `agents/{name}/memory.json` |

> **我们的用法**：业务 Agent 拥有自己的 memory 文件，存储该业务场景的持久化偏好。所有用户共享同一个业务 Agent 实例，但用户级记忆按 `user_id` 隔离。无需修改。

### 1.4 Skills 体系 🟢 核心复用

| 能力 | 现状 |
|------|------|
| `Skill` 类型 | name / description / category(PUBLIC/CUSTOM) / allowed_tools / enabled |
| SKILL.md 解析 | YAML front-matter → 结构化元数据 |
| 工具策略 | `filter_tools_by_skill_allowed_tools()` |
| 安全扫描 | `SecurityScanner` |
| SkillStorage | 本地文件系统 + 安装器 |

> **我们的用法**：Skills 作为上层概念保留。业务 Agent 可以加载 Skills（Skills 内部可包含工作流，但 Skill ≠ 工作流）。商店管理的是 Agent 和 Skill 的选用关系。无需修改。

### 1.5 Middleware 链 🟢 核心复用

| 阶段 | Middleware（14 个主 Agent / 4 个 subagent）|
|------|------|
| before_agent | ThreadData → Uploads → Sandbox |
| before_model（每轮） | ViewImage |
| after_model（每轮，反序） | Clarification → LoopDetection → SubagentLimit → Title → DanglingToolCall |
| after_agent | Sandbox（释放）→ Memory（入队） |

> **我们的用法**：业务 Agent 通过 `create_deerflow_agent()` 或 `make_lead_agent()` 创建，自动继承完整中间件链。`RuntimeFeatures` 可按需关闭 memory / subagent 等。

### 1.6 Gateway + IM Channels + Client 🟢 核心复用

| 入口 | 描述 |
|------|------|
| HTTP Gateway | `POST /api/runs/stream`，assistant_id 路由到具体 Agent |
| IM Channels | 飞书、钉钉、企微、微信、Slack、Telegram、Discord → ChannelManager → Gateway |
| DeerFlowClient | Python 嵌入式，`client.chat()` / `client.stream()`，无需 Gateway |

> **我们的用法**：业务 Agent 发布后可同时通过 Web 工作区、IM 渠道、内嵌 Client 三种方式调用。无需修改。

### 1.7 Project Agent 骨架 🟢 核心复用

```
parse_input → decompose → search_skills → plan_workflow
       ↘ Send×N ↘                              ↙ Send×M (retry)
                  execute_subtask ────→ evaluate → synthesize → END
                                          ↘ prepare_retry ↗
```

| 节点 | 现状 | [graph.py](file:///Users/fengrunda/myWork/gitLab_unicom/智能体/deerflow-unicom-gd/backend/packages/harness/deerflow/agents/project_agent/graph.py) |
|------|------|------|
| `parse_input` | 从消息提取 task_description | L117 |
| `decompose` | LLM 拆解子任务列表 | L120-122 |
| `search_skills` | 读取已启用 skills 列表 | L123 |
| `plan_workflow` | LLM 生成 subagent assignments | L124-128 |
| `execute_subtask` | 调用 SubagentExecutor 异步执行 | L129 |
| `evaluate` | LLM 判断子任务结果是否通过 | L130 |
| `prepare_retry` | 标记失败子任务，重试最多 2 次 | L131 |
| `synthesize` | LLM 整合所有子任务结果 | L132 |

> **关键洞察**：这套骨架 = **单监督者 + 临时 subagent 模式**，DeerFlow 自带且已经在跑。我们的新方案不是重写它，而是在它的基础上**把 LLM 动态拆解替换为已发布工作流 DAG 的确定拆解**。

---

## 二、新方案架构：在 DeerFlow 骨架上的确定性增强

### 2.1 整体架构

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ① 设计态：个人助手 + workflow builder + 独立 Builder                    │
│    ┌─────────────┐     ┌──────────────────┐                             │
│    │ 个人助手对话  │ ──▶ │ workflow builder │                            │
│    │ 独立 Builder │ ◀──▶│ / code-generator │                            │
│    └─────────────┘     └────────┬─────────┘                             │
│                                 │ 生成                                   │
│                    ┌────────────▼─────────┐                             │
│                    │ WorkflowSpec          │                             │
│                    │ workflow.json          │                             │
│                    │ runner / graph.py      │                             │
│                    └──────────┬───────────┘                             │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │ 发布
┌───────────────────────────────┼──────────────────────────────────────────┐
│ ② 发布态：注册到用户「我的能力」                                        │
│                    ┌──────────▼───────────┐                             │
│                    │ users/{user}/workflows │                             │
│                    │   manifest.yaml        │ ← 🆕 callable manifest       │
│                    │   workflow.published.json│ ← 🆕 发布态 spec           │
│                    │   src/graphs/           │ ← 复用 project graph 加载  │
│                    └──────────────────────┘                             │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ ③ 运行态：个人助手 / custom agent 调用 published workflow                │
│                                                                          │
│  用户请求 ──▶ 个人助手 ──▶ 我的能力/已启用 workflow ──▶ runner/graph      │
│                                                              │           │
│       执行时使用调用者自己的 sandbox / memory / uploads / credentials     │
│                                                                          │
│  复杂工作流仍可内部复用 project_agent 骨架：parse → decompose_v2 → execute │
│                                                                          │
│  execute_subtask: 🟢 复用 SubagentExecutor + _run_subagents_parallel     │
│                    🆕 每个 subagent 加载对应 nodes/{node}.py              │
│                                                                          │
│  evaluate: 🟢 复用 evaluate_node 骨架                                    │
│            🆕 可关联节点级 pass_condition 做结构化评测                      │
│                                                                          │
│  synthesize: 🟢 完全复用 synthesize_node                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 复用 vs 新增对照表

| 组件 | 复用现有 | 新增 | 说明 |
|------|:---:|:---:|------|
| **subagent 执行引擎** | ✅ | | `SubagentExecutor` + 并行轮询，零改动 |
| **subagent 类型注册** | ✅ | | built-in + config.yaml custom_agents |
| **sandbox 隔离** | ✅ | | SandboxMiddleware + per-thread sandbox |
| **memory 持久化** | ✅ | | FileMemoryStorage（user_id + agent_name 隔离） |
| **skills 体系** | ✅ | | Skill 加载、工具过滤、上下文注入 |
| **middleware 链** | ✅ | | 14 个 middleware，业务 Agent 自动继承 |
| **Gateway / IM / Client** | ✅ | | 三种入口均无需改动 |
| **project_agent / builder 骨架** | ✅ | | 当前实现可复用 parse → decompose → execute → evaluate → retry → synthesize |
| **项目目录结构** | ✅ | | `projects/{name}/src/graphs/` 动态加载机制 |
| **LangGraph Send 并行** | ✅ | | `_route_subtasks` + `Send` fan-out |
| **检查点持久化** | ✅ | | SQLite / Redis checkpointer |
| — | — | — | — |
| **WorkflowSpec 定义** | | 🆕 | 节点类型、输入输出 schema、pass_condition |
| **nodes/*.py 代码生成** | | 🆕 | workflow builder 根据 Spec 生成节点代码 |
| **确定拆解（decompose v2）** | | 🆕 | 读 workflow.published.json 替代 LLM 动态拆解 |
| **节点级 evaluate** | | 🆕 | 结构化 pass_condition 替代纯 LLM 判断 |
| **我的能力 / 工作流注册表** | | 🆕 | manifest.yaml + publish/install/fork |
| **可选企业权限** | | 🆕 | admin / developer / user 三级可作为后置收窄 |
| **per-user sandbox 策略** | | 🆕 | 每用户独立 sandbox 容器 |
| **sandbox 自动伸缩** | | 🆕 | 预热池 + 按需分配 + 空闲回收 |

---

## 三、逐层设计（复用标注）

### 3.1 设计态：个人助手调用 workflow builder

```
用户: "帮我做一个供应商评估工作流，流程是：
      提取供应商→工商查询→舆情分析→风险评估→生成报告"

个人助手 Agent（lead_agent + user_id + 可选 agent_name）:
  1. 🟢 调用 workflow builder / workflow-code-generator
  2. 🆕 输出结构化 WorkflowSpec（5 个节点定义）
  3. 🟢 生成 workflow.json + 初始 runner/graph
  4. 🟢 返回独立 Workflow Builder 链接
  5. 🆕 用户在 Builder 审阅并微调节点/连线，也可继续对话修改
  6. 🆕 运行 smoke test（复用 SubagentExecutor）
  7. 🆕 publish 后注册为用户「我的能力」
```

**项目目录结构（最大复用现有）：**

```text
users/{user_id}/workflows/supplier-evaluation/
├── workflow.draft.json              ← 🆕 设计态 spec（可由当前 workflow.json 演进）
├── workflow.published.json          ← 🆕 发布态 spec
├── manifest.yaml                    ← 🆕 注册到「我的能力」
├── src/
│   ├── state.py                     ← 🆕 工作流 State（基于 WorkflowState）
│   ├── nodes/                       ← 🆕 节点代码
│   │   ├── __init__.py
│   │   ├── extract_supplier.py
│   │   ├── business_query.py
│   │   ├── sentiment_analysis.py
│   │   ├── risk_evaluation.py
│   │   └── generate_report.py
│   ├── graphs/
│   │   └── workflow_graph.py        ← 🟢 复用 make_project_agent 约定
│   └── tests/                       ← 🆕
│       ├── test_extract_supplier.py
│       └── test_workflow_smoke.py
└── releases/                        ← 🆕
    ├── v1.0.0/
    └── v1.1.0/
```

当前代码可先继续落在 `projects/{name}/`，但 spec / manifest 需要显式记录 `owner_user_id`、`visibility`、`forked_from`，避免长期把全局项目目录误当作用户资产模型。

### 3.2 发布态：注册为「我的能力」

```yaml
# users/{user_id}/workflows/supplier-evaluation/manifest.yaml
name: supplier-evaluation
display_name: 供应商智能评估
type: workflow
owner_user_id: u_123
visibility: private                 # private / shared / public
entrypoint: src.graphs.supplier_evaluation:make_supplier_evaluation_graph
published_spec: workflow.published.json
callable_as:
  - tool
  - skill
enabled_for_agents:
  - default                         # 默认个人助手
  - procurement-assistant            # 用户自己的 custom agent
```

发布后，当前用户的个人助手可以从「我的能力」中发现并调用该 workflow。复杂工作流仍可复用现有 [`make_project_agent`](file:///Users/fengrunda/myWork/gitLab_unicom/智能体/deerflow-unicom-gd/backend/packages/harness/deerflow/agents/project_agent/agent.py#L37-L59) / `load_project_graph()` 动态加载机制，但调用入口不再要求表现为一个单独业务 Agent。

### 3.3 运行态：主 Agent 确定执行

```text
用户输入 ──▶ parse_input ──▶ decompose_v2 ──▶ execute_subtask × N ──▶ evaluate ──▶ synthesize ──▶ END
               🟢 复用       🆕 读 DAG 确定     🟢 复用 Send+Executor   🆕 节点级    🟢 复用
```

**decompose_v2（核心改动点）：**

```python
async def decompose_v2_node(state: WorkflowState, config: RunnableConfig) -> dict:
    """🆕 替代原有 decompose_node：读取已发布工作流 DAG 确定拆解。"""

    project_name = state.get("project_name")
    spec = _load_published_spec(project_name)  # 🆕 读 workflow.published.json

    # 根据 DAG 拓扑排序生成子任务序列
    assignments = [
        {
            "subtask_id": node.id,
            "prompt": _build_node_prompt(node, state),  # 从 nodes/*.py 和 state 构造
            "subagent_type": node.subagent_type,         # 🆕 每个节点可指定 subagent 类型
            "node_file": node.handler,                   # 🆕 指向 nodes/*.py
            "pass_condition": node.pass_condition,       # 🆕 评测通过条件
        }
        for node in _topological_sort(spec.nodes, spec.edges)
    ]

    return {"subagent_assignments": assignments}
```

**execute_subtask（零改动，完全复用）：**

原有 `_run_subagents_parallel()` 已支持并行执行多个 subagent，轮询等待完成，状态跟踪。**唯一的增强**：subagent 加载对应 `nodes/{node_id}.py` 中的 `run()` 函数——这可以通过 `SubagentConfig.system_prompt` 注入节点指令实现。

**evaluate（结构化增强）：**

```python
async def evaluate_v2_node(state: WorkflowState) -> dict:
    """🆕 在原有 evaluate_node 基础上增加节点级 pass_condition 检查。"""
    results = state.get("subagent_results", [])
    all_passed = True

    for r in results:
        assignment = _find_assignment(state, r["subtask_id"])
        condition = assignment.get("pass_condition")

        if condition:
            # 🆕 结构化通过条件检查
            passed = _check_pass_condition(r["result"], condition)
        else:
            # 🟢 fallback: 原有 LLM evaluate
            passed = await _llm_evaluate(r["result"])

        r["node_passed"] = passed
        if not passed:
            all_passed = False

    return {"subagent_results": results, "all_passed": all_passed}
```

### 3.4 用户调用入口（最小改动）

```text
Web 工作区                  IM（飞书/企微）               Python SDK
     │                           │                          │
     ▼                           ▼                          ▼
────────────────── ─────────────────── ──────────────────────────
assistant_id:       channel config:        DeerFlowClient(
  lead_agent          assistant_id:           agent_name=
  + workflow name     lead_agent              "default/custom"
                    )                       )
────────────────── ─────────────────── ──────────────────────────
     │                           │                          │
     └───────────────────────────┼──────────────────────────┘
                                 ▼
                    make_lead_agent(agent_name=<user selected agent>)
                                 │
                                 ▼
                    lookup user's enabled workflows / manifest
                                 │
                                 ▼
                    runner / workflow_graph.compile()
                                 │
                                 ▼
                    🟢 完整 Middleware 链自动生效
                    🟢 per-thread Sandbox 自动分配
                    🟢 Memory 自动注入
                    🟢 Checkpointer 自动持久化
```

三种入口均可复用现有 Gateway / IM / Client。最小新增点是「我的能力」注册表与 workflow manifest 查找；执行时仍继承完整 middleware、thread、sandbox、memory 与 checkpointer。

---

## 四、企业场景的架构复用

### 4.1 用户隔离

| 需求 | 复用项 |
|------|--------|
| 用户认证 | 🟢 AUTH_DESIGN.md：强制认证 + session/JWT |
| 文件隔离 | 🟢 `users/{user_id}/threads/{thread_id}/user-data/` 路径自动解析 |
| Memory 隔离 | 🟢 `FileMemoryStorage(user_id=..., agent_name=...)` |
| Sandbox 隔离 | 🆕 per-user sandbox 策略 + 🟢 SandboxMiddleware |

### 4.2 自动伸缩

| 需求 | 复用项 |
|------|--------|
| Gateway 水平扩展 | 🟢 无状态 Gateway + Redis checkpointer |
| Sandbox 池管理 | 🆕 Sandbox Manager（预热池 + 按需分配 + 空闲回收）|

### 4.3 Agent/Skills 商店

| 需求 | 复用项 |
|------|--------|
| Agent 配置存储 | 🟢 `agents/{name}/config.yaml` |
| Skills 存储 | 🟢 `skills/custom/` + SkillStorage |
| 工具过滤 | 🟢 `filter_tools_by_skill_allowed_tools()` |
| 安全扫描 | 🟢 Skills SecurityScanner |

---

## 五、新增工作量评估

### 需新建的文件/模块

| 模块 | 说明 | 复杂度 |
|------|------|--------|
| `WorkflowSpec` schema | Pydantic model：节点、边、pass_condition 等 | 中 |
| `decompose_v2_node` | 替代 decompose_node，读 DAG 确定拆解 | 低 |
| `evaluate_v2_node` | 增强 evaluate_node，支持结构化 pass_condition | 中 |
| Codegen 引擎 | WorkflowSpec → nodes/*.py + graph.py + tests/ | 高 |
| workflow builder prompt 升级 | 生成结构化 WorkflowSpec / patch，而非纯文本 | 中 |
| 「我的能力」注册表 | manifest + publish/install/fork + enabled workflows | 中 |
| Agent/Skills 商店 API + 前端 | 发现、分发、评分、审批（后续增强） | 高 |
| Sandbox Manager | 预热池 + 按需分配 + 自动伸缩 | 高 |
| RBAC 角色扩展 | admin / developer / user 权限检查（企业后置） | 低 |

### 需修改的现有文件

| 文件 | 改动 |
|------|------|
| `workflow_frontend/server/main.py` | 增加 test / publish / manifest 注册 API |
| `workflow_frontend/src/*` | Builder 显示 draft/published 状态与发布入口 |
| `project_agent/graph.py` | 可选：decompose 节点增加 v2 分支判断 |
| `project_agent/nodes.py` | 可选：新增 decompose_v2_node |
| `project_agent/agent.py` | 复用 `load_project_graph` 加载已发布 graph |
| `agents/factory.py` | 无需改动（动态加载已支持） |
| `auth/models.py` | 可选：新增 developer role（企业后置） |
| `config.yaml` schema | 新增 sandbox autoscaling 配置段 |

---

## 六、核心差异化总结

```
                  当前 project_agent              新方案（个人助手 + Workflow Builder）
                  ──────────────────              ───────────────────────────────
创建主体          固定 project_agent 原型          用户当前个人助手调用 builder 能力
编辑入口          workflow_frontend 原型           独立 Builder 作为一期正式编辑入口
执行模式          LLM 即兴演奏 / 手写 graph         published workflow 按谱演奏
子任务来源        decompose_node LLM 当场生成      workflow.published.json 或 runner/graph
子任务内容        LLM 生成的 prompt               nodes/{node}.py / graph node / runner
执行引擎          SubagentExecutor（🟢 复用）       SubagentExecutor / LangGraph（🟢 复用）
可复现性          ❌ 通用 Agent 不稳定              ✅ 发布态 DAG/graph 固定
可测试性          ❌ 无法单独测子任务               ✅ workflow smoke test + 节点单测
可审计性          ❌ 难以追溯                      ✅ 节点级 trace
业务入口          Gateway / IM / Client（🟢）      个人助手 / custom agent（🟢）

核心价值：在 DeerFlow 成熟骨架之上，把「个人助手即兴处理」沉淀为「用户可编辑、可发布、可复用的工作流能力」。
```

---

## 七、后续待明确

1. **DAG 串行 vs 并行策略**：decompose_v2 如何根据 workflow.published.json 中节点间依赖关系判断串行或并行（Send API 已支持并行 → 串行通过 graph 边定义）。
2. **节点间数据流转**：上游节点输出如何作为下游节点输入，通过 state 字段映射。
3. **节点级 trace 与可观测**：每个 subagent 执行的输入/输出/耗时/错误收集和展示。
4. **人工审批节点**：是否需要支持中断等待人工确认的节点类型（可复用 ClarificationMiddleware 中断机制）。
5. **子工作流复用**：一个工作流节点是否能作为另一个工作流的子节点（可复用 LangGraph subgraph 机制）。
6. **我的能力注册表**：复用 skills 白名单，还是新增 workflows registry。
7. **Chat 与 Builder 同步**：一期只做独立 Builder；后续是否做嵌入式侧边栏画布与实时同步。