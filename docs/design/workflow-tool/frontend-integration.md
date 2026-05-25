# Workflow Builder 前端整合设计

> 基于 `workflow_frontend/` 与 `frontend/` 现有代码的对照分析，说明如何把当前工作流画布作为 **Workflow Tool 的右侧编辑区**，并整合进 DeerFlow 主站。

## 1. 结论（先看）

**已决（MVP）**：右侧 Workflow Builder **先用 React** 并入主站 `frontend/`（`@xyflow/react` + 扩展 `ChatBox`），**不**做 Web Component / Vue 拆分；框架解耦、独立仓库、WC 嵌入列为 **M2+ 演进项**（见 §12）。

| 维度 | 现状 | 目标 |
| --- | --- | --- |
| 应用形态 | 独立 Vite 应用（`:5173`）+ FastAPI 旁路服务（`:8002`） | 嵌入 DeerFlow Next.js **Workspace**，与 Chat **同屏** |
| 布局主从 | Builder 居中，Chat 在右（`ChatPanel` 360px）或独立 `/chat` | **Chat 为主（左）**，Builder 为 **右侧面板**（对齐 Artifact 模式） |
| 对话能力 | `workflow_frontend` 自建 `streamChat` → 代理 Gateway | **复用**主站 `useThreadStream` / LangGraph SDK，**不再**在 Builder 内嵌第二套 Chat |
| 持久化 API | `workflow_frontend/server/main.py` 读写 `projects/*/workflow.json` | 迁到 **Gateway** `/api/workflows/*`（见 [architecture.md](architecture.md)） |
| 整合抓手 | 无 | 复用 `ChatBox` 的 `ResizablePanelGroup` 模式，新增 `workflow` 第三面板或替换 artifacts 槽位 |

**一期仍允许**独立 Builder URL（深链、调试）；**二期**在 `/workspace/chats/[thread_id]` 内用右侧面板完成「对话改流程 + 画布编辑」闭环。

---

## 2. 现状：`workflow_frontend` 布局与职责

### 2.1 页面结构

```text
App.tsx（/）
├── topbar（项目选择、保存状态、跳转 /chat、切换 Agent 侧栏）
└── .layout（横向 flex）
    ├── Sidebar（240px，节点拖拽库）
    ├── Canvas（flex:1，@xyflow/react）
    ├── Inspector（300px，选中节点属性）
    └── ChatPanel?（360px，toggle「🤖 Agent」）

ChatPage（/chat）
├── 左侧营销卡片
└── FloatingChat（完整 Chat + skills/tools/模型，可 POST 创建 project）
```

关键代码：

```151:158:workflow_frontend/src/App.tsx
      <div className="layout">
        <Sidebar />
        <main className="canvas-wrap">
          <Canvas />
        </main>
        <Inspector />
        {showChat && <ChatPanel activeProject={activeProject} />}
      </div>
```

### 2.2 状态与数据

| 模块 | 技术 | 职责 |
| --- | --- | --- |
| `store/useWorkflow.ts` | zustand + `@xyflow/react` | nodes/edges、选中节点、import/export JSON |
| `api.ts` | fetch | `/api/workflow/projects`、`/api/chat/stream` |
| `App.tsx` | debounce 1s | 有 `activeProject` 时自动 `PUT` 保存 |
| `ChatPanel` | 正则提取 \`\`\`json | 从助手回复中检测 `nodes+edges`，「Load to canvas」 |

### 2.3 旁路服务 `server/main.py`

| 路由 | 行为 |
| --- | --- |
| `GET/PUT /api/workflow/projects/{name}` | 读写仓库根目录 `projects/{name}/workflow.json` |
| `POST /api/workflow/projects` | Chat 检测到 workflow JSON 时创建目录 |
| `POST /api/chat/stream` | 用固定账号登录 Gateway，代理 `lead_agent` 流式（**非**主站 cookie） |
| `GET /api/models`、`/api/skills` | 代理或扫本地 `skills/` |

开发时 Vite 把上述路径代理到 `:8002`（`vite.config.ts`）。

**问题**：与主站认证、thread、CSRF **脱节**；用户在两套 UI 间切换会丢对话上下文。

---

## 3. 现状：DeerFlow `frontend` Workspace

### 3.1 壳层

```text
/workspace/layout.tsx
  └── WorkspaceContent
        ├── WorkspaceSidebar（线程列表、导航）
        └── SidebarInset
              └── /workspace/chats/[thread_id]/page.tsx
```

### 3.2 Chat 页与「右侧面板」先例

主站已实现 **Chat | Artifacts** 可拖拽分栏，可直接作为 Workflow Builder 的整合模板：

```104:176:frontend/src/components/workspace/chats/chat-box.tsx
    <ResizablePanelGroup
      id={`${resizableIdBase}-panels`}
      orientation="horizontal"
      defaultLayout={{ chat: 100, artifacts: 0 }}
      groupRef={layoutRef}
    >
      <ResizablePanel className="relative" defaultSize={100} id="chat">
        {children}
      </ResizablePanel>
      <ResizableHandle ... />
      <ResizablePanel id="artifacts">
        ... ArtifactFileDetail / ArtifactFileList ...
      </ResizablePanel>
    </ResizablePanelGroup>
```

- 关闭：`{ chat: 100, artifacts: 0 }`
- 打开：`{ chat: 60, artifacts: 40 }`
- 触发：`ArtifactTrigger` + `ArtifactsProvider`

**Workflow Builder 右栏应复用同一模式**，而不是在 Builder 里再放 Chat。

### 3.3 主站 API 路径

`next.config.js` 将 `/api/*` rewrite 到 Gateway（`:8001`），LangGraph 走 `/api/langgraph`。主站 **没有** workflow 相关 rewrite；也 **未** 引用 `workflow_frontend`。

---

## 4. 目标 UX：Workflow Tool 右栏

### 4.1 整合后的空间分工

```text
┌──────────────────────────────────────────────────────────────────┐
│ WorkspaceSidebar │  Chat (主)          │  Workflow Builder (右)   │
│                  │  MessageList        │  ┌────┬────────┬──────┐  │
│                  │  InputBox           │  │Pal-│ Canvas   │Insp. │  │
│                  │  (现有 thread)      │  │ette│ (@xyflow)│ector │  │
│                  │                     │  └────┴────────┴──────┘  │
│                  │  [Workflow 按钮]     │  Save · Test · Publish  │
└──────────────────────────────────────────────────────────────────┘
```

- **左侧 Chat**：用户与个人助手对话；助手通过 `workflow_builder` 工具创建/修改流程。
- **右侧 Builder**：只负责 **可视化编辑 + 保存 draft**；从 thread 消息或 tool result **灌入** workflow JSON。
- **不**在右栏再放 `ChatPanel` / `FloatingChat`（避免双会话、双认证）。

### 4.2 与独立 Builder 的关系

| 场景 | 入口 |
| --- | --- |
| 日常编辑 | `/workspace/chats/{thread_id}` + 打开 Workflow 右栏 |
| 深链 / 大屏 | `/workspace/workflows/{id}` 全屏 Builder（复用同一套组件） |
| 本地调试 | 保留 `workflow_frontend` dev 直至组件迁完 |

---

## 5. 组件拆分（可迁移单元）

从 `workflow_frontend` 抽出 **与 Chat 解耦** 的 Builder 内核，供主站与独立应用共用：

```text
# 目标包（示意，可先放在 frontend 内，再抽 workspace 包）
frontend/src/components/workflow-builder/
  workflow-builder-panel.tsx    # 右栏容器：palette + canvas + inspector + 工具栏
  workflow-canvas.tsx           # 自 Canvas.tsx
  workflow-palette.tsx          # 自 Sidebar.tsx（节点库）
  workflow-inspector.tsx        # 自 Inspector.tsx
  workflow-toolbar.tsx          # 保存状态、Test、Publish（新建）
  hooks/use-workflow-document.ts  # 加载/自动保存（替代 App.tsx 内逻辑）
  store/workflow-store.ts       # 迁自 useWorkflow.ts
  nodes/ edges/ types/          # 迁自 workflow_frontend/src

# 明确不迁入主站右栏
  ChatPanel.tsx
  FloatingChat.tsx
  pages/ChatPage.tsx
```

### 5.1 `WorkflowBuilderPanel` 对外接口（建议）

```typescript
interface WorkflowBuilderPanelProps {
  workflowId: string;           // 或 project name（过渡期）
  threadId?: string;             // 关联对话，用于上下文展示
  initialDocument?: WorkflowData;
  onSave?: (doc: WorkflowData) => void;
  onPublish?: () => void;
  readOnly?: boolean;
}
```

主站右栏由 `WorkflowProvider` 持有 `workflowId`、`open` 状态（对齐 `ArtifactsProvider`）。

---

## 6. 主站整合：对齐 `ChatBox` 模式

### 6.1 状态 Provider

```text
frontend/src/components/workspace/workflows/
  context.tsx          # workflowsOpen, workflowId, setWorkflowId, document
  workflow-trigger.tsx # 顶栏按钮（对齐 ArtifactTrigger）
```

### 6.2 扩展 `ChatBox` 为三栏或互斥右栏

**方案 A（推荐，一期）**：Chat + Workflow **互斥**右栏（同一 `ResizablePanel` 槽位）

- 打开 Artifacts 时关 Workflow，反之亦然。
- 实现量小，避免 3 栏过窄。

**方案 B（后续）**：`chat | workflow | artifacts` 三栏，中间双 Handle。

### 6.3 从对话灌入画布

复用现有检测逻辑（`ChatPanel` / `FloatingChat` 相同正则）：

1. 在 `MessageList` 或 stream 完成回调中检测 assistant 消息内的 `nodes`+`edges` JSON。
2. 弹出 banner：「检测到工作流定义 → **在右侧打开并加载**」。
3. 调用 `importJSON` + 若尚无 `workflowId` 则 `POST /api/workflows` 创建。

更稳妥的长期形态：助手通过 **tool result** 返回结构化 `{ workflow_id, patch }`，前端不依赖正则。

### 6.4 顶栏入口

在 `chats/[thread_id]/page.tsx` header 与 `ArtifactTrigger` 并列增加 `WorkflowTrigger`：

- 无 active workflow：禁用或引导「在对话中创建工作流」。
- 有 `thread.values.workflow_id` 或 URL `?workflow=`：高亮打开右栏。

---

## 7. API 层迁移

### 7.1 现状 vs 目标

| 能力 | 现状（`:8002`） | 目标（Gateway） |
| --- | --- | --- |
| 列表/读/写 workflow | `main.py` 扫 `projects/` | `GET/PUT /api/workflows/{id}` |
| 创建 | `POST .../projects` | `POST /api/workflows` |
| 发布/测试 | 无 | `POST .../publish`、`POST .../test` |
| Chat | 代理 `lead_agent` | **删除**（用主站 thread） |

主站 `frontend/src/core/workflows/api.ts` 使用现有 `fetchWithAuth`（与 skills/agents 一致），走 `next.config.js` rewrite。

### 7.2 过渡期

- Next.js `rewrites` 增加 `/api/workflow/:path*` → 临时仍指向 `:8002`，或
- Gateway 实现新路由后，**废弃** `workflow_frontend/server`。

`workflow_frontend` 的 `api.ts` 改为可配置 `BASE`（环境变量），便于单机调试。

---

## 8. 路由与导航

| 路由 | 用途 |
| --- | --- |
| `/workspace/chats/[thread_id]` | 主场景：Chat + 可选 Workflow 右栏 |
| `/workspace/chats/[thread_id]?workflow={id}` | 打开会话同时展开右栏并加载 |
| `/workspace/workflows` | 我的工作流列表（「我的能力」） |
| `/workspace/workflows/[id]` | 全屏 Builder（无 Chat） |
| `/workspace/workflows/new` | 从空白创建 |

**不要**用 `history.push` 在流式对话中跳路由（主站已在 `onStart` 用 `history.replaceState` 避免 thread 重挂载，见 chat page 注释）。

打开右栏应 **只改 Provider 状态** 或 `replaceState` 追加 query，避免 remount `useThreadStream`。

---

## 9. 技术差异与对策

| 差异 | 影响 | 对策 |
| --- | --- | --- |
| React 18（workflow）vs 19（frontend） | 合并后 hooks 类型 | 以主站 19 为准，升级 workflow 依赖 |
| 样式：手写 CSS vs Tailwind 4 | 视觉不一致 | Builder 外壳用 shadcn + Tailwind；画布区可保留局部 CSS module |
| `@xyflow/react` | 需客户端组件 | 全部标 `"use client"`；动态 import 可选（减小 SSR  bundle） |
| 认证 | `:8002` 独立登录 | 仅 Gateway API；cookie/CSRF 与主站一致 |
| 自动保存 | App 内 debounce | `useWorkflowDocument` + TanStack Query mutation |

---

## 10. 分阶段实施

### Phase 0（当前，可保留）

- 独立 `workflow_frontend` + `make`/脚本启动 `:8002`。
- 个人助手返回 Builder 深链：`http://localhost:5173/?project={name}`。

### Phase 1 — 右栏嵌入（M1 最小闭环）

1. 迁 `Canvas` / `Sidebar` / `Inspector` / `useWorkflow` 到 `frontend/src/components/workflow-builder/`。
2. 实现 `WorkflowProvider` + `WorkflowTrigger` + 扩展 `ChatBox`（互斥右栏）。
3. Gateway 或 rewrite 提供 `GET/PUT /api/workflows/{id}`（可先继续写 `projects/`）。
4. 消息内 workflow JSON 检测 → 打开右栏并加载。
5. 顶栏：保存状态、Test（调 Gateway run）、Publish（占位 API）。

**验收**：在主站 Chat 中说「建一个日报工作流」→ 右栏出现画布 → 保存 → 刷新后仍在。

### Phase 2 — 全屏与列表

- `/workspace/workflows` 列表与全屏编辑页。
- 与「我的能力」registry 打通。

### Phase 3 — 弃用独立 Chat

- 下线 `workflow_frontend` 的 `ChatPanel`、`ChatPage`、`/api/chat/stream`。
- `workflow_frontend` 仅保留 dev 用 Vite 壳或删除，组件单一来源。

---

## 11. 与架构文档的对应

| 架构层 | 前端落点 |
| --- | --- |
| Agent 调 `workflow_builder.open` | thread tool event → `setWorkflowOpen(true)` |
| Domain `workflows/*` | `core/workflows/api.ts` |
| Builder App | `WorkflowBuilderPanel`（右栏 + 全屏页） |
| 执行 runner | Test 按钮 → Gateway run published graph |

---

## 12. Web Component / Vue3 方案（可选）

### 12.1 问题

右侧 Workflow Builder 是否做成 **Web Component**，从而与主站 React 解耦，并用 **Vue 3** 实现？

**可以**，但「能嵌入」≠「比同仓 React 更省事」。是否采用取决于团队技能栈与隔离诉求，而非技术不可行。

### 12.2 可行形态

```text
packages/workflow-builder-wc/     # 或 workflow_frontend-vue/
  Vue 3 + @vue-flow/core + defineCustomElement
  构建 → deerflow-workflow-builder.js（+ CSS）

主站 React（Next.js）
  <deerflow-workflow-builder
    workflow-id="..."
    api-base="/api"
  />
  + 监听 CustomEvent（save / publish / ready）
```

| 集成方式 | 说明 |
| --- | --- |
| **Custom Element（推荐若走 WC）** | `defineCustomElement` 导出 `<deerflow-workflow-builder>`；属性/事件与 React 通信用 DOM API |
| **iframe** | 隔离最强、样式与认证最简单；与 WC 类似但 URL 独立，不利于与 Chat 同屏拖拽分栏 |
| **React 包进 WC** | 用 `@r2wc/react-to-web-component` 包一层现有 React 画布；**仍是 React 运行时**，不能换 Vue |

### 12.3 与当前代码的关系

| 事实 | 含义 |
| --- | --- |
| 现有 `workflow_frontend` 使用 **`@xyflow/react`** | 迁 Vue 需改为 **`@vue-flow/core`**，节点/边/Inspector **不能直搬**，属重写画布层 |
| 主站 `frontend/package.json` **已有 `@xyflow/react`** | 主站已具备同技术栈；右栏用 React 组件 **无额外画布库成本** |
| 契约是 **`{ nodes, edges }` JSON** + REST | 与 UI 框架无关；WC/Vue/React 只要遵守同一 API 即可 |

### 12.4 对比（简表）

| 维度 | 同仓 React 组件 | Web Component + Vue 3 |
| --- | --- | --- |
| M1 交付速度 | **快**（迁文件 + 对齐 ChatBox） | 慢（重写 Flow + 建 WC 构建链） |
| 与 Chat 右栏联动 | Provider / 同页状态自然共享 | 靠 `workflow-id` + 事件，需约定协议 |
| 样式与主题 | Tailwind / shadcn 与 Workspace 一致 | Shadow DOM 与全局 Tailwind **易冲突**；常需 `shadow: false` 或构建时注入 design tokens |
| Next.js | `"use client"` 即可 | 需 **仅客户端** 动态 `import()` 注册 CE；SSR 不能渲染画布 |
| 包体积 | 一份 React Flow | 主站 React + WC 内 **Vue 运行时**（双框架，通常更大） |
| 团队 | 与 DeerFlow App 一致 | 适合 **独立小组** 只维护 Builder、主站任意框架 |

### 12.5 建议决策（MVP 已采纳第一条）

```text
【MVP / 当前路线】主站右栏 = React WorkflowBuilderPanel（@xyflow/react）
      → 满足 M1「Chat 左 + 画布右」且改动最小
      → 解耦、WC、Vue 等不在 M1 范围

【M2+ 再评估】可选（满足其一再考虑 WC + Vue）：
  · 明确由 Vue 团队长期维护 Builder，与 Next 发版解耦
  · 同一 Builder 要嵌入多套壳（非 DeerFlow 的 React 站、静态页、低代码平台）
  · 企业要求画布源码与主站仓库物理隔离（子仓库 + 独立 CI）

不推荐：
  · 仅为「不想用 React」而 WC——主站 Chat 仍是 React，双框架成本仍在
  · 用 WC 包一层 @xyflow/react——多一层边界，收益小于同仓组件
```

若采用 WC，**边界契约**建议固定为：

- **输入**：`workflow-id`、`api-base`（或 `document` JSON 属性）、`read-only`
- **输出事件**：`deerflow-workflow-change`、`deerflow-workflow-saved`、`deerflow-workflow-publish`
- **禁止**在 WC 内再实现 Chat / Gateway 流式（与 §4 一致）

### 12.6 开放问题（WC 路径）

1. Shadow DOM 是否与 DeerFlow 明暗主题同步？
2. WC 静态资源由 Next `public/` 托管还是独立 CDN？
3. Vue Flow 与 React Flow 的节点类型定义是否共用一份 JSON Schema（推荐 **共用 schema，双端各实现渲染**）？

---

## 13. 开放问题

1. 右栏与 Artifacts **互斥**还是 **并存**（三栏）？
2. `workflowId` 与过渡期 `projects/{name}` 命名是否 1:1？
3. 节点 palette 是否按租户/技能动态配置？
4. 全屏 Builder 是否仍需独立域名（企业内网 iframe 策略）？
5. Builder 实现选型：同仓 React vs Web Component + Vue（见 §12）？

---

## 14. 相关代码索引

| 路径 | 说明 |
| --- | --- |
| `workflow_frontend/src/App.tsx` | 当前三栏 + Chat 开关 |
| `workflow_frontend/server/main.py` | 持久化 + chat 代理（待迁） |
| `frontend/src/components/workspace/chats/chat-box.tsx` | **右栏整合模板** |
| `frontend/src/app/workspace/chats/[thread_id]/page.tsx` | Chat 页入口 |
| `frontend/next.config.js` | API rewrite |

维护：Phase 1 开工后在本文件 §10 勾选交付项，并同步 [implementation-status.md](implementation-status.md)。Builder 框架选型见 §12。
