# Project Agent 一节点一 Python 文件方案设计

> **口径更新（2026-05）**：一节点一 Python 文件是 published workflow 的**高级执行实现**，不是第一期唯一目标。当前一期主线为：个人助手调用 workflow builder → 独立 Workflow Builder 编辑 → publish → 注册到「我的能力」。当前 MVP 以 `projects/{name}/src/graphs/{project}.py` + `workflow.json` + [workflow-code-generator](../../../skills/public/workflow-code-generator/SKILL.md) 为准，见 [implementation-status.md](implementation-status.md)。

## 背景

workflow builder 的目标是把 DeerFlow 从通用 Agent 运行时扩展为面向个人与团队工作的协同编排系统，仿照 Coze 编程式工作流功能。节点独立文件化路线如下：

```text
个人助手对话 / 独立 Workflow Builder
  -> workflow builder 生成 WorkflowSpec
  -> 生成 nodes/*.py + graph.py
  -> publish 为 callable workflow
  -> 注册到「我的能力」
  -> 个人助手 / custom agent 调用
```

本文聚焦一个已确定的设计选择：**将每个工作流节点固化为独立 Python 文件，支持 Agent 协同生成、前端画布编辑、Git 版本管理和独立测试。**

结论：该方案在 DeerFlow 当前技术栈（Python + LangGraph）下完全可行，适合作为复杂 workflow 的演进目标。节点独立文件化有利于 Agent 协同、代码 review、单元测试和增量修改。

## 目标

一节点一 Python 文件方案作为主路线，目标是：

1. 每个业务节点有独立源码文件，便于阅读、测试、审计和局部修改。
2. 独立 Workflow Builder 编辑的是 WorkflowSpec，个人助手可根据用户语言修改 WorkflowSpec。
3. workflow builder 根据 WorkflowSpec 生成或更新节点 Python 文件和 LangGraph graph。
4. 发布后的 workflow 运行时加载 Python graph，个人助手 / custom agent 调用确定流程，而非 LLM 每次动态规划。
5. 节点尽量接近纯函数：输入来自 `state/config`，输出为 state patch，副作用显式声明。
6. 支持节点级评测（evaluate）和重试（retry）机制。

## 非目标

短期内不追求：

- 兼容 Coze Studio 的内部 Go/Eino 运行时。
- 直接执行任意前端节点 JSON。
- 生成任意自由 Python 代码并无审查执行。
- 第一版支持复杂循环、人工审批、多版本并发运行、分布式调度。
- 每个节点都强制绝对纯函数，因为 LLM、工具、文件写入、外部 API 调用天然存在副作用。

## 当前实现对照

当前 `projects/competitive_analysis` 示例的真实执行图位于：

```text
projects/competitive_analysis/src/graphs/competitive_analysis.py
```

这个文件里同时包含：

- helper 函数
- subagent 并行执行逻辑
- `extract_company_node`
- `research_node`
- `generate_report_node`
- `save_report_node`
- `make_competitive_analysis_graph`

当前结构优点是简单、集中；缺点是节点职责和图定义耦合，后续 Agent 或前端要对单个节点做增量修改时，不容易定位、diff、测试和复用。

目标结构应拆成：

```text
projects/competitive_analysis/src/
├── state.py
├── nodes/
│   ├── __init__.py
│   ├── extract_company.py
│   ├── research_company.py
│   ├── research_competitors.py
│   ├── research_market.py
│   ├── generate_report.py
│   └── save_report.py
├── graphs/
│   └── workflow_graph.py
└── tests/
    ├── test_extract_company.py
    ├── test_generate_report.py
    └── test_workflow_smoke.py
```

## 与 Coze 开源版方案的核心区别

### Coze 开源版

根据 [coze-dev/coze-studio](https://github.com/coze-dev/coze-studio) 公开实现，Coze 工作流更接近：

```text
FlowGram Canvas
  -> Canvas JSON / schema_json
  -> 后端 NodeSchema
  -> Eino Workflow / Lambda
  -> run / stream_run / resume
```

它的节点通常是平台内置或注册的节点类型，后端节点实现主要在 Go 代码中。Python 出现在 Code 节点中时，更像运行时沙箱脚本片段，而不是生成到用户项目仓库里的 `nodes/*.py` 文件。

### DeerFlow 一节点一 Python 文件

DeerFlow 目标方案更接近：

```text
WorkflowSpec
  -> Codegen
  -> projects/{project}/src/nodes/*.py
  -> projects/{project}/src/graphs/workflow_graph.py
  -> LangGraph compile
  -> Gateway run
```

对比：

| 维度 | Coze 开源版 | DeerFlow 一节点一 Python 文件 |
| --- | --- | --- |
| 执行源 | 平台内 workflow schema | Git 仓库中的 Python graph |
| 节点实现 | 平台注册节点 / Go 实现 / Code 节点脚本 | 每个节点一个 Python 文件 |
| 运行时 | Go + Eino | Python + LangGraph |
| 用户可见源码 | 通常不可见完整运行时代码 | 可见、可 review、可测试 |
| 版本管理 | 平台内版本 | Git / 文件级版本 |
| 自然语言生成整图 | 开源侧未见完整实现 | 目标能力，需要自研 |
| spec 到 Python codegen | 无 | 核心差异化 |
| 前端编辑后执行 | 平台内 schema 解释执行 | 需要 spec -> codegen -> publish |

## 可行性分析

### 技术可行性

该方案与当前 DeerFlow 技术栈匹配度较高：

- 当前项目已经使用 Python 和 LangGraph。
- `make_project_agent(project_name, config)` 已支持从 `projects/{name}/src/graphs/` 动态加载 Python graph。
- `projects/competitive_analysis` 已证明项目目录模式可行。
- `WorkflowState` 已具备跨节点传递 state patch 的基础。
- `workflow_frontend` 已能编辑和保存节点/边，只需升级为业务 WorkflowSpec。

关键新增能力是：

```text
WorkflowSpec
  -> validate
  -> codegen nodes
  -> codegen graph
  -> import check
  -> smoke test
  -> publish
```

### 工程可维护性

一节点一文件的主要优势：

- 单个节点逻辑短小，便于人工 review。
- Agent 修改某个节点时 diff 更小。
- 单测粒度自然。
- 节点可复用、可移动、可废弃。
- 副作用边界更容易标注。
- Git 历史能清楚看到哪个业务节点被改动。

主要代价：

- 文件数量会增多。
- 简单工作流可能显得过度拆分。
- 需要代码生成器保持规范。
- 需要 import、命名、state 字段等约束。
- 需要处理 spec 与源码的同步问题。

### Agent 协同可行性

一节点一文件很适合 Agent 协同，因为 Agent 可以围绕明确边界工作：

- “新增一个节点文件”
- “修改某个节点的 prompt”
- “调整某个节点的输入输出 schema”
- “把一个节点拆成两个节点”
- “为某个节点生成单元测试”
- “解释某个节点的副作用”

相比在一个大 `graph.py` 中修改大量内联函数，节点文件化更适合做结构化 patch 和代码 review。

### 前端协同可行性

前端不应直接编辑 Python 源码，而应编辑 WorkflowSpec。推荐职责划分：

```text
前端编辑：
  - 节点名称
  - 节点类型
  - 输入输出字段
  - prompt / tool / subagent 参数
  - 连线
  - 条件分支
  - 超时和重试

后端生成：
  - Python 节点函数
  - graph.py
  - state.py
  - tests
```

这样前端保持低代码体验，代码生成保持工程确定性。

## 节点设计原则

### 节点函数签名

建议所有节点遵循统一签名：

```python
from langchain_core.runnables import RunnableConfig
from ..state import WorkflowState


async def run(state: WorkflowState, config: RunnableConfig) -> dict:
    ...
    return {"field_name": value}
```

或使用具名函数：

```python
async def extract_company_node(state: WorkflowState, config: RunnableConfig) -> dict:
    ...
```

两种方式都可行。推荐第一版使用具名函数，便于 graph.py 直接引用，也便于日志和 trace 可读。

### 输入输出

节点输入不应从全局变量隐式读取，应从 `state` 和 `config` 读取。

节点输出必须是 dict patch：

```python
return {
    "task_description": company,
}
```

不能在普通节点中直接修改传入的 `state`。

### 副作用

节点分三类：

| 类型 | 副作用策略 |
| --- | --- |
| pure | 不调用外部 API，不写文件，只做转换 |
| boundary | 显式调用外部工具、模型、网络或文件系统 |
| orchestration | 分派 subagent、并行、条件判断、聚合 |

WorkflowSpec 中应显式声明：

```json
{
  "side_effects": ["llm_call", "web_search", "write_file"]
}
```

这样可以用于审计、权限控制和测试 mock。

### 命名约束

建议：

- 节点 id 使用 snake_case。
- 文件名与节点 id 一致。
- 函数名使用 `{node_id}_node`。
- 输出字段也使用 snake_case。

示例：

```text
node_id: research_market
file: src/nodes/research_market.py
function: research_market_node
output: market_research
```

## WorkflowSpec 设计

一节点一文件不能直接依赖 React Flow JSON，需要独立 WorkflowSpec。

建议结构：

```json
{
  "version": "1",
  "project": "competitive_analysis",
  "metadata": {
    "title": "Competitive Analysis Workflow",
    "description": "Company input to Chinese competitive analysis report."
  },
  "nodes": [
    {
      "id": "extract_company",
      "kind": "python",
      "title": "Extract Company",
      "description": "Parse company name from user message.",
      "inputs": {
        "messages": {
          "source": "state.messages",
          "type": "list"
        }
      },
      "outputs": {
        "task_description": {
          "type": "str"
        }
      },
      "code": {
        "module": "projects.competitive_analysis.src.nodes.extract_company",
        "function": "extract_company_node"
      },
      "side_effects": []
    }
  ],
  "edges": [
    {
      "source": "extract_company",
      "target": "research_company",
      "mapping": {
        "task_description": "task_description"
      }
    }
  ],
  "ui": {
    "layout": {}
  }
}
```

### 节点类型

第一版建议支持：

| kind | 说明 | 生成方式 |
| --- | --- | --- |
| `python` | 普通 Python 节点 | 生成节点文件 |
| `llm` | LLM 调用节点 | 生成带 `create_chat_model` 的节点文件 |
| `subagent` | 子 Agent 节点 | 生成带 `SubagentExecutor` 的节点文件 |
| `tool` | DeerFlow 工具节点 | 生成从 `get_available_tools` 调用工具的节点文件 |
| `condition` | 条件分支 | 生成 graph 条件路由函数 |
| `start` | 起点 | 不生成业务文件 |
| `end` | 终点 | 不生成业务文件 |

## Codegen 设计

### 输入

```text
projects/{project}/workflow.draft.json
```

### 输出

```text
projects/{project}/src/
├── state.py
├── nodes/
│   ├── __init__.py
│   ├── node_a.py
│   └── node_b.py
└── graphs/
    └── workflow_graph.py
```

### 生成 graph.py

生成后的 graph 应显式 add_node / add_edge：

```python
from langgraph.graph import END, START, StateGraph

from ..state import WorkflowState
from ..nodes.extract_company import extract_company_node
from ..nodes.research_company import research_company_node
from ..nodes.generate_report import generate_report_node


def make_workflow_graph() -> StateGraph:
    builder = StateGraph(WorkflowState)
    builder.add_node("extract_company", extract_company_node)
    builder.add_node("research_company", research_company_node)
    builder.add_node("generate_report", generate_report_node)

    builder.add_edge(START, "extract_company")
    builder.add_edge("extract_company", "research_company")
    builder.add_edge("research_company", "generate_report")
    builder.add_edge("generate_report", END)
    return builder
```

### 生成节点文件

LLM 节点示例：

```python
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from deerflow.config import get_app_config
from deerflow.models import create_chat_model

from ..state import WorkflowState


async def generate_report_node(state: WorkflowState, config: RunnableConfig) -> dict:
    model = create_chat_model(thinking_enabled=False, app_config=get_app_config())
    prompt = state.get("report_prompt", "")
    response = await model.ainvoke([
        SystemMessage(content="You are a report writer."),
        HumanMessage(content=prompt),
    ])
    return {"final_output": response.content if isinstance(response.content, str) else str(response.content)}
```

### 生成测试

第一版可生成 smoke test：

```python
def test_workflow_graph_imports():
    from projects.competitive_analysis.src.graphs.workflow_graph import make_workflow_graph

    graph = make_workflow_graph()
    assert graph is not None
```

节点级测试可按节点 kind 生成模板。

## Agent 修改流程

### 新建工作流

```text
用户通过个人助手自然语言描述
  -> workflow builder 生成 WorkflowSpec
  -> 独立 Workflow Builder 展示
  -> 用户调整
  -> 后端 validate
  -> codegen
  -> import check / smoke test
  -> 用户确认发布到「我的能力」
```

### 修改工作流

```text
用户提出修改需求
  -> 加载当前 WorkflowSpec
  -> Agent 生成 JSON Patch
  -> 前端展示 diff
  -> 用户确认
  -> 更新 WorkflowSpec
  -> 只重生成受影响节点
  -> 运行测试
  -> 发布新版本
```

### 手动编辑节点

```text
用户在前端编辑节点字段
  -> 保存 workflow.draft.json
  -> 后端 validate
  -> 标记代码过期
  -> 用户点击生成代码
  -> codegen 更新节点文件
```

## 前端编辑边界

前端应编辑结构化字段，而不是直接编辑完整 Python。

允许编辑：

- title
- description
- kind
- inputs
- outputs
- prompt
- tool name
- subagent type
- timeout
- retry
- condition expression
- edge mapping
- UI layout

不建议第一版编辑：

- 任意 Python 源码
- 任意 import
- 任意 shell 命令
- 任意文件路径写入

如果必须支持源码编辑，应作为高级模式，并要求：

- 代码 diff
- 用户确认
- 静态检查
- import check
- 测试通过

## Source of Truth 设计

这是本方案最关键的风险点。

推荐：

```text
设计态 source of truth：workflow.draft.json
发布态 source of truth：Python graph + workflow.published.json
运行态 source of truth：published Python graph
```

每次 codegen 记录：

```json
{
  "spec_hash": "sha256...",
  "generated_at": "...",
  "generator_version": "..."
}
```

运行时可校验：

- Python graph 是否对应当前 published spec。
- draft 是否已经落后于 published。
- 前端编辑后是否需要重新生成代码。

## 版本与发布

建议引入：

```text
projects/{project}/releases/{version}/
├── workflow.published.json
├── generated_manifest.json
└── src_snapshot/
```

或者依赖 Git commit 作为版本边界。

第一版可以简单实现：

- `workflow.draft.json`
- `workflow.published.json`
- `generated_manifest.json`
- `CHANGELOG.md`

## 可观测与调试

一节点一文件天然适合节点级 trace。建议每个节点运行时记录：

- `run_id`
- `project_name`
- `workflow_version`
- `node_id`
- `node_kind`
- `input_summary`
- `output_summary`
- `started_at`
- `ended_at`
- `duration_ms`
- `status`
- `error`

前端可展示：

```text
DAG 节点颜色
  pending / running / success / failed / skipped

节点详情
  input
  output
  logs
  error
  retry
```

这可借鉴 Coze 的 `debug_url` 和 Coze Loop 的 span/trace 思路，但实现可以先复用 DeerFlow Gateway runs/events。

## 风险与应对

### 文件数量膨胀

风险：复杂项目会生成大量节点文件。

应对：

- 每个 project 独立目录。
- 节点按 domain 子目录分组。
- 支持小节点合并，但默认一节点一文件。

### 过度生成代码

风险：简单字段修改也重写大量文件，造成 diff 噪音。

应对：

- 按 node_id 定位文件。
- 只重生成受影响节点。
- graph.py 稳定排序。
- 模板输出保持 deterministic formatting。

### LLM 生成代码不可控

风险：Agent 生成不安全或不可维护代码。

应对：

- 先生成 WorkflowSpec，再由模板生成大部分代码。
- 自由代码生成仅限高级节点。
- 必须经过 review + lint + import check + test。

### 前端 spec 与代码不同步

风险：画布显示与实际运行不一致。

应对：

- spec hash 写入 generated manifest。
- 前端显示“代码已过期”状态。
- 发布前强制校验 hash。

### 副作用不可测试

风险：节点调用 LLM、web、文件系统，测试不稳定。

应对：

- spec 声明 side effects。
- 节点支持 dry-run/mock。
- 边界节点单独测试。
- 评测与真实执行分离。

## 与 Coze 方案的优劣对比

### DeerFlow 一节点一文件优势

- 更适合 Git 管理。
- 更符合 Python 开发者心智。
- 节点可单测、可 review、可静态分析。
- 与当前 LangGraph 技术栈一致。
- 业务确定性更强。
- 更适合企业私有化、审计和长期维护。

### DeerFlow 一节点一文件劣势

- 初始建设成本高。
- 需要维护 codegen。
- 前端编辑与代码同步复杂。
- 运行时热更新和发布管理复杂。
- 不如 Coze 平台内 schema 运行时轻量。

### Coze 开源方案优势

- 平台内 schema 和运行时闭环成熟。
- 前端工作流画布能力强。
- 节点注册和运行调试体系完整。
- 对低代码用户更直接。
- 不需要暴露源码和 Git 流程。

### Coze 开源方案劣势

- 不生成 Python/LangGraph 项目代码。
- 与 DeerFlow 当前 Python 栈不一致。
- 对源码级审计和 Git 版本化不友好。
- 二次开发需要理解较重的 Go/DDD/Eino/FlowGram 体系。

## 推荐方案

如果 workflow skill 内部需要 LangGraph 固化执行，推荐采用 **Hybrid Codegen**：

```text
WorkflowSpec 是设计源
Workflow Skill 是业务能力入口
Python nodes/graph 是可选执行源
前端编辑 WorkflowSpec
Agent 修改 WorkflowSpec 和节点实现
Codegen 生成稳定骨架
LLM 只在受控区域生成节点业务逻辑
```

具体策略：

1. 第一版不做完整自由代码生成，只支持有限节点 kind 的模板化生成。
2. `python` 节点允许 Agent 生成业务逻辑，但必须隔离为单文件并接受测试。
3. graph.py 永远模板生成，不允许 Agent 自由改图执行代码。
4. 前端只编辑 spec，不直接写 graph.py。
5. 发布运行只通过 workflow skill 入口触发，不解释 draft spec；skill 内部可加载 Python graph。

## MVP 路线

### Phase 1：Workflow Skill 与 Spec

- 定义 WorkflowSpec。
- 定义 workflow skill 目录与 `SKILL.md` 模板。
- 定义 manifest。
- 用简单 runner 先打通发布和调用。

### Phase 2：可选 Spec 到 graph.py

- 实现 spec validator。
- 实现 graph.py codegen。
- 支持 start/end/python/llm/subagent/tool 基础节点。
- 支持 import check。

### Phase 3：前端打通

- `workflow_frontend` 保存 WorkflowSpec，而非纯 UI JSON。
- 显示 codegen 状态。
- 支持点击“生成代码”。
- 显示生成 diff。

### Phase 4：Agent 协同

- `project_agent` 生成 WorkflowSpec。
- `project_agent` 根据用户自然语言返回 JSON Patch。
- 支持“解释当前工作流”和“建议拆分节点”。

### Phase 5：发布执行

- draft / published。
- workflow version。
- smoke test。
- custom agent 调用已发布 workflow skill。
- skill 内部按需加载 published graph。
- 节点级 run events。

## 最终结论

每个工作流节点作为独立 Python 文件是可行的，而且契合 DeerFlow 当前 Python/LangGraph/项目目录的技术路线。

但它既不是 Coze 开源版的实现方式，也不是 DeerFlow `project_agent` 的必选目标。Coze 的核心价值在于：

```text
画布 schema
节点注册
确定性 DAG 执行
调试与中断恢复
```

DeerFlow 应借鉴这些架构思想，而不是照搬其 Go/Eino 中心化运行时。

推荐将本文方案降级为 workflow skill 的高级执行实现。DeerFlow `project_agent` 的差异化定位应改为：

```text
Agent-assisted workflow building:
用 Agent 和 Web 画布协同设计工作流，
用 WorkflowSpec 作为设计协议，
用 workflow skill 作为发布和业务调用入口，
按需使用 Python/LangGraph 作为确定性运行时。
```
