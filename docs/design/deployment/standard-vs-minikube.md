# DeerFlow 标准部署 vs Minikube Hub-and-Spoke 方案对比

> 本文只回答一个问题：**当前 `multi-user-k8s-local/` 方案与 DeerFlow 标准部署相比，差异在哪里，适合什么场景，后续应如何演进。**  
> K8s 基础概念、Node / Pod / Container、DeerFlow 标准部署详解见 [standard-deployment.md](standard-deployment.md)。

## 1. 结论先行

| 维度 | 标准 DeerFlow 部署 | 当前 Minikube Hub-and-Spoke |
| --- | --- | --- |
| 定位 | 产品主路径 / 企业交付目标 | 本地 PoC / 硬隔离实验线 |
| 后端模型 | 多用户共享 Gateway，多副本水平扩展 | 每个用户一颗 User Pod，Pod 内跑整颗 DeerFlow |
| 入口 | ALB / Ingress / nginx → frontend + Gateway | Ingress → Hub → 用户专属 User Pod |
| 用户身份 | Gateway 原生认证与 `user_id` 贯穿（**✅**） | Hub 自建用户表、JWT，并代理到 User Pod |
| 角色 / RBAC | **🟡** 认证有；`admin`/`user` 字段有；**❌** developer、`@require_role` | **❌** 非 Gateway 权限模型 |
| 数据隔离 | `user_id` + DB + 目录 / PVC + Sandbox（**✅**） | 用户 Pod + 用户 PVC 物理隔离 |
| skills 商店 | 目标：共享 Gateway 统一治理（**❌** 商店级能力） | Hub 静态 skills 列表（**🟡** demo） |
| 成本 | 共享服务，资源利用率高 | 每用户整颗 DeerFlow，成本高、维护重 |
| 推荐用途 | 正式产品、企业多用户、长期演进 | 演示 K8s 隔离、验证 per-user Pod 模型 |

一句话：**Minikube 方案不是标准部署的替代品，而是把“每用户一套 DeerFlow”跑在本地 K8s 里的实验方案。**

### 1.1 实现状态图例（读 §3–§5 时对照）

本文档中 **「标准线应该怎么做」** 与 **「仓库里已经有什么」** 分开标注，避免把设计目标当成现网能力。

| 标记 | 含义 |
| --- | --- |
| **✅ 已实现** | 当前 Gateway / 标准路径代码中可用 |
| **🟡 部分实现** | 有基础能力或骨架，但未覆盖企业场景 |
| **❌ 未实现** | 仅在设计文档或产品目标中，代码尚无 |
| **📋 产品规则** | 应用层约定，需文档 + 代码共同落地 |

权威依据：[backend/docs/AUTH_DESIGN.md](../../../backend/docs/AUTH_DESIGN.md)（认证与隔离的**现状**）、[enterprise-deployment.md](../project-agent/enterprise-deployment.md)（企业能力的**目标**）。

## 2. 两条部署线的结构

### 2.1 标准部署

```text
浏览器
  └── ALB / Ingress / nginx
        ├── frontend
        └── Gateway Deployment（1..N 个副本，全员共享）
              ├── 用户认证（✅）/ 角色权限（🟡 见 §3.3）
              ├── Agent / workflow / skills API
              ├── DB / Redis / Checkpoint
              ├── .deer-flow/users/{user_id}/...
              └── Sandbox Provisioner
                    └── Sandbox Pod / Container（按 thread）
```

特征：

- Gateway 是 **应用后端 + Agent 运行时**，不是 ALB。
- 所有用户共享 Gateway 层，靠 `user_id` 做逻辑隔离。
- Sandbox 只负责命令执行隔离，通常按 `thread_id` 申请或复用。
- Gateway、frontend、Redis、DB、Sandbox 都可以跑在 K8s，也可以用 Docker Compose / VM。

### 2.2 当前 Minikube Hub-and-Spoke

```text
浏览器
  └── Ingress deerflow.local
        └── Hub Pod（认证 + 代理 + workflow/skills 静态 API）
              ├── Hub PVC（users.db、projects）
              ├── K8s API：创建用户资源
              ├── User Pod: deerflow-alice（整颗 DeerFlow :8001）
              │     └── PVC: deerflow-data-alice
              └── User Pod: deerflow-bob（整颗 DeerFlow :8001）
                    └── PVC: deerflow-data-bob
```

特征：

- Hub 是入口、认证与 K8s 控制面。
- 每个登录用户拥有一个 User Pod 和一个 PVC。
- User Pod 内部跑 DeerFlow Gateway，但它不是共享 Gateway 集群。
- 当前更像“每个用户一台小型 DeerFlow 服务”，不是标准多租户后端。

## 3. 重点问题一：系统用户权限设计

### 3.1 标准部署（目标模型）

标准线**应以** Gateway 原生身份体系为主（架构目标）：

```text
请求
  └── Gateway AuthMiddleware                    ✅ 已实现
        ├── 解析 session / JWT                  ✅
        ├── 写入 request.state.user / ContextVar ✅
        ├── API 层按 role / permission 判断     🟡 见 §3.3（非完整 RBAC）
        └── Agent / tool / storage 继承 user_id ✅
```

**企业目标**权限模型（[enterprise-deployment.md](../project-agent/enterprise-deployment.md)）：

| 角色 | 目标能力 | 代码现状 |
| --- | --- | --- |
| `admin` | 用户管理、系统配置、全局 skills / agents / workflows 治理 | **🟡** 仅有 `system_role=admin` 字段；**❌** 无完整 admin 管理 API / `@require_role` |
| `developer` | 发布公共 workflow / skill，维护部门级能力 | **❌** 角色未定义；设计稿中的 `@require_role("developer")` **未实现** |
| `user` | 使用授权能力，创建和发布自己的个人 workflow / agent | **🟡** 可注册登录、按 `user_id` 隔离数据；**❌** 无按角色裁剪的 API 权限 |

标准线**架构上**的优势（实现 RBAC 后仍成立）：

- 权限判断应集中在统一 Gateway 层。
- 便于扩展组织、审计、审批流。
- 多副本 Gateway 共享 session / JWT / DB / Redis。

### 3.3 标准线：代码实现状态（2026-05，以仓库为准）

> **结论**：标准 DeerFlow **已有认证与用户数据隔离**，**尚未具备**文档 §3.1 表格中的完整「系统用户权限 / RBAC / developer」能力；企业交付需在现有 auth 底座上扩展。

| 能力 | 状态 | 说明 / 代码位置 |
| --- | --- | --- |
| 登录 / 注册 / JWT / HttpOnly cookie | **✅** | `backend/app/gateway/routers/auth.py`、`auth/jwt.py` |
| 首次 admin `/setup`、`/api/v1/auth/initialize` | **✅** | `auth.py`、`app.py` `_ensure_admin_user` |
| 全局 `AuthMiddleware` + CSRF | **✅** | `auth_middleware.py`、`csrf_middleware.py` |
| `system_role`：`admin` \| `user` | **✅ 字段** | `auth/models.py`；AUTH_DESIGN 明确 **❌ 细粒度 RBAC** |
| `developer` 角色 | **❌** | 仅 enterprise-deployment 设计 |
| `@require_role` 装饰器 | **❌** | 设计示例存在，**全仓无实现** |
| `@require_auth` / `@require_permission` | **🟡** | `authz.py`；部分 threads/runs 路由使用 |
| 登录后权限集合 | **🟡 缺口** | `_authenticate()` 对**所有已登录用户**赋 `_ALL_PERMISSIONS`，**未按 `system_role` 区分** |
| thread / run **归属校验**（owner） | **✅** | `require_permission(..., owner_check=True)` + `ThreadMetaStore.check_access` |
| 按 `user_id` 的文件 / memory / agents 路径 | **✅** | `paths.py`、AUTH_DESIGN § 用户隔离 |
| OAuth 第三方登录 | **❌** | 端点占位 |
| admin 用户管理 API（删改他人账号等） | **❌** | 无完整管理面 |
| 组织 / 部门 / 审计日志 | **❌** | 企业扩展项 |

**与 §3.1 流程图的差异**：图中「API 层按 role / permission 判断」在现网是 **resource:action + thread 归属**，不是 **admin / developer / user 角色矩阵**。

### 3.2 Minikube 方案

当前 Hub 自建一套用户体系：

```text
Hub SQLite users.db
  ├── /register
  ├── /login
  ├── JWT
  └── /api/* 代理到对应 User Pod
```

问题：

- Hub 用户体系与 Gateway 原生认证是两套，长期会产生账号、权限、审计重复建设。
- Hub 代理时可以注入 `X-User-Id`，但这不是完整权限模型。
- User Pod 内部如果继续保留 Gateway 原生认证，会出现“双重认证”；如果绕过认证，又削弱标准线安全边界。

建议演进：

| 阶段 | 做法 |
| --- | --- |
| PoC | Hub JWT 保留，仅用于演示 per-user Pod |
| 过渡 | Hub 只做入口，身份改为调用 Gateway 原生认证 / token |
| 目标 | 回到共享 Gateway 权限模型；Hub 若保留，只做管理面或 demo 控制面 |

### 3.4 标准线建议扩展顺序（未实现项）

在现有 auth 底座上，建议按依赖顺序落地：

1. **按 `system_role` 分配 `permissions`**（替换登录即 `_ALL_PERMISSIONS`）
2. 实现 **`@require_role` 或等价机制**，并增加 **`developer`** 角色
3. **admin 管理 API**（用户、全局配置、下架公共 skill）
4. **skills / workflow** 路由接入角色与归属校验
5. （可选）组织维度、审计、OAuth

## 4. 重点问题二：skills 商店（发布 / 应用 / 分析 / 协作）

### 4.0 实现状态摘要

| 能力 | 标准 Gateway | Minikube Hub |
| --- | --- | --- |
| 列出 / 安装自定义 skill（基础） | **🟡** `routers/skills.py` 有 CRUD / install | **🟡** Hub `/api/skills` 静态快照 |
| 发布 / 审核 / 公共商店 | **❌** | **❌** |
| 安装到「我的能力」+ 权限范围 | **❌** 无角色级治理 | **❌** |
| 调用分析 / 协作 / fork | **❌** | **❌** |
| 与 `system_role` / developer 联动 | **❌** | **❌**（Hub 无 Gateway 角色模型） |

下文 §4.1 为 **目标架构**；带 **❌** 的行表示尚未在标准线代码中落地。

### 4.1 标准部署应该承载 skills 商店（目标）

skills 商店是产品能力，不应绑在某个用户 Pod 内。它更适合放在共享 Gateway 层：

```text
Gateway
  ├── Skill Registry（技能元数据）
  ├── Skill Package Storage（代码 / 版本 / 依赖）
  ├── Publish / Review / Install API
  ├── Usage Analytics
  └── Collaboration / Fork / Ownership
```

建议能力分层：

| 能力 | 标准线设计建议 | 代码现状 |
| --- | --- | --- |
| 发布 | 用户 / developer 发布 skill；公共发布可走审核 | **❌** 无商店级发布 / 审核流 |
| 应用 | 用户安装到“我的能力”；Agent / workflow 可引用已安装 skill | **🟡** 有 skill 安装相关 API，**❌** 无「我的能力」权限模型 |
| 分析 | 记录调用次数、失败率、耗时、消耗 token、被哪些 workflow 使用 | **❌** |
| 协作 | owner、collaborator、fork、版本、评论 / 变更记录 | **❌** |
| 治理 | admin 下架、封禁、升级、迁移、权限范围控制 | **❌** 依赖 §3 未实现的 RBAC |

数据归属建议：

| 数据 | 存放建议 |
| --- | --- |
| 官方 / 公共 skills | 共享 registry + 镜像内置或对象存储 |
| 用户自建 skills | `users/{user_id}/skills/...` + DB 元数据 |
| 团队共享 skills | `orgs/{org_id}/skills/...` 或 DB 权限表 |
| 安装关系 | DB 表：user / agent / workflow → skill version | **❌** 目标 schema，未作为统一 registry |

### 4.2 Minikube 当前状态

当前 Minikube 线更偏“能列出 skills / 能跑 demo”：

```text
Hub
  ├── 镜像内 skills_snapshot/
  └── /api/skills

User Pod
  └── 也可能有自己的 skills 目录
```

主要缺口：

- skills 列表由 Hub 静态提供，和 User Pod 内真实运行环境可能不完全一致。
- 缺少发布、审核、安装、版本、协作、分析等商店核心能力。
- 若每个用户 Pod 都有自己的 skills 副本，升级和治理成本高。

建议演进：

| 目标 | 建议 |
| --- | --- |
| 短期 demo | 保留 Hub `/api/skills`，只作为静态目录展示 |
| 中期对齐产品 | skills 元数据回到 Gateway / DB，Hub 不再独立维护商店逻辑 |
| 长期企业化 | 统一 Skill Registry；User Pod 模式若保留，只挂载同一份只读公共 skills 和用户私有 skills |

## 5. 重点问题三：数据隔离与共享

> **与权限的区别**：数据隔离（`user_id`、路径、thread owner）在标准线 **✅ 已实现**；§5.2 多 Agent 共享/隔离的细规则多为 **📋 产品规则**，需在 Gateway 与存储层一致贯彻。

### 5.1 标准部署的数据隔离

标准线是“逻辑隔离 + 执行隔离”：

```text
.deer-flow/
  users/
    alice/
      agents/
      threads/
      skills/
      memory/
    bob/
      agents/
      threads/
      skills/
      memory/
```

| 数据类型 | 标准线隔离方式 | 代码现状 |
| --- | --- | --- |
| 用户资料 / 权限 | DB 按 `user_id` | **✅** |
| 对话 thread | `users/{user_id}/threads/{thread_id}/...` | **✅** + thread meta owner_check |
| 用户自建 Agent | `users/{user_id}/agents/...` | **✅** 路径布局 |
| 用户私有 skills | `users/{user_id}/skills/...` | **✅** 目录；**❌** 无跨用户商店权限 |
| Memory | 按 `user_id + agent_name` 或更细粒度 key | **✅** 默认 per-user / per-agent |
| 文件 / outputs | thread 工作区 | **✅** |
| 命令执行环境 | Sandbox 按 thread 隔离 | **✅**（模式因部署而异） |

### 5.2 同一用户多个 Agent：隔离需求 vs 共享需求

同一用户下往往同时存在 **多个 Agent**（个人助手、不同 custom agent、不同 workflow 绑定）。这里要分清两件事：

- **用户之间**要不要隔离？——标准线与 Minikube 都能做到（见 §5.1 / §5.3）。
- **同一用户的不同 Agent 之间**要不要隔离、哪些要共享？——**与部署形态（标准 / Minikube）几乎无关**，主要由 **DeerFlow 应用层路径与产品规则** 决定；**每用户一颗 User Pod 不会自动解决 Agent 级问题**。

#### 5.2.1 需求矩阵（要什么）

| 数据 / 能力 | 典型隔离需求（为什么要分开） | 典型共享需求（为什么要共用） |
| --- | --- | --- |
| **Agent 配置 / SOUL / 工具集** | 角色、人设、能力不同，不能串台 | 一般**不共享** |
| **Agent Memory（长期记忆）** | 工作助手 vs 生活助手记忆不应混用 | 有时希望「用户画像」全 Agent 可见 |
| **对话 thread / checkpoint** | 一次聊天一条线，避免上下文污染 | 通常**不跨 thread**；极少需要「续聊另一 Agent 的 thread」 |
| **Sandbox 工作区（workspace/outputs）** | 按对话隔离，避免文件互相覆盖 | 同一 thread 内自然共享；**跨 Agent 复用文件**需显式设计 |
| **用户上传文件** | 敏感资料可只给某个 Agent | 常见：**资料库**给该用户所有 Agent 用 |
| **已安装 skills** | 某 Agent 只启用子集 | 常见：用户装一次，多 Agent 引用 |
| **workflow 草稿 / 发布物** | 草稿可仅创建者 Agent 可见 | 发布后进入「我的能力」，多 Agent 可调用 |
| **运行时进程** | 一般**不**要求每 Agent 独立进程 | 共享 Gateway / 共享 Pod 即可 |

推荐默认产品规则（与 [paths.py](../../../backend/packages/harness/deerflow/config/paths.py)、[AUTH_DESIGN.md](../../../backend/docs/AUTH_DESIGN.md) 对齐）：

```text
用户级：账号、（可选）用户 Memory、共享资料库、已安装 skills、个人能力库
Agent 级：config / SOUL、（默认）Agent Memory、启用的 skills 子集
Thread 级：对话、checkpoint、Sandbox 目录、uploads/outputs
```

#### 5.2.2 标准部署：实现路径与难度

标准线所有 Agent 跑在 **同一 Gateway 进程/副本** 内，多 Agent = **同进程、不同 `agent_name` + 不同目录**。

| 能力 | 目标 | 实现路径（标准线） | 难度 | 代码现状 |
| --- | --- | --- | --- | --- |
| Agent 配置隔离 | 各 Agent 独立 SOUL/配置 | 已有 `users/{user_id}/agents/{agent_name}/` | **低** ✅ | 已落地 |
| Thread / Sandbox 隔离 | 对话与执行环境不串 | 已有 `users/{user_id}/threads/{thread_id}/user-data/` + 按 thread 申请 Sandbox | **低** ✅ | 已落地 |
| Agent Memory 隔离 | 默认各 Agent 独立记忆文件 | `user_agent_memory_file(user_id, agent_name)`；注入时 `get_memory_data(agent_name, user_id=...)` | **低** ✅ | 已落地 |
| 用户级 Memory 共享 | 全 Agent 共享用户画像 | 使用 `users/{user_id}/memory.json`（`agent_name=None` 时写入）；需在 prompt 层 **合并** user + agent 两份 memory | **中** 🟡 | 路径有；**合并策略与 UI 开关** 未产品化 |
| 用户级文件共享区 | 跨 Agent 共用 PDF/表格等 | 新增 `users/{user_id}/shared/`（或 `library/`），上传 API + Sandbox 只读挂载；Agent 配置声明是否挂载 | **中** | **❌** 无统一共享区；upload 仍在 **thread** 下 |
| 跨 thread 共享文件 | A 对话产出给 B 对话用 | 显式「保存到用户库」工具或复制到 `shared/`；禁止默认共享 thread 目录 | **中** | **❌** 需产品 + 工具 |
| skills 用户装、Agent 选用 | 装一次、多 Agent 引用 | DB：`user_installed_skills` + `agent_enabled_skills`；Gateway skills 路由校验 | **中高** | **❌** 商店模型未实现 |
| workflow 发布共享 | 「我的能力」多 Agent 可调 | workflow registry + `user_id` 归属；run 时带 workflow_id | **高** | **📋** workflow-tool 目标 |
| 强制某 Agent 不可见另一 Agent 数据 | 合规 / 多租户子场景 | 路径已隔离；再加 API 校验 `agent_name` 与 resource 归属 | **中** | 路径 ✅；API 级 agent 归属 **🟡** 未全覆盖 |
| 每 Agent 独立进程 / Pod | 极强隔离 | **非标准线方向**；改架构为 sidecar 或 per-agent Pod | **很高** | 不做 |

**标准线小结**：**隔离的主干（Agent 目录、per-agent memory、per-thread sandbox）已实现，难度低**；**共享能力（用户资料库、memory 合并、skills/workflow 引用）多为产品层扩展，难度中到中高**，与是否上 K8s 无关。

#### 5.2.3 Minikube：实现路径与难度

Minikube 仅在 **用户之间** 多了一颗 User Pod + PVC；**Pod 内仍是标准 DeerFlow 目录布局**（`DEER_FLOW_HOME` → `.deer-flow/users/{hub_user_id}/...`）。

```text
PVC deerflow-data-alice
  └── users/alice/
        ├── agents/agent-a/    ← 与标准线相同语义
        ├── agents/agent-b/
        ├── threads/{thread_id}/...
        └── memory.json / agents/*/memory.json
```

| 能力 | Minikube 实现路径 | 相对标准线 | 难度 |
| --- | --- | --- | --- |
| Agent 配置 / thread / Sandbox 隔离 | **与标准相同**：User Pod 内 Gateway + Paths | **无额外优势**；代码路径一致 | **低**（已随 DeerFlow 自带） |
| Agent Memory 隔离 / 用户 Memory | **与标准相同** | 无额外优势 | **低** / **中**（共享策略同上） |
| 用户级文件共享区 | **与标准相同**（改应用 + 挂载 PVC 子目录） | 无额外优势 | **中** |
| skills / workflow 共享 | **更难**：Hub 静态 skills + User Pod 内真实 skills 可能不一致；应先 **取消 Hub 侧重复逻辑**，统一回 Gateway/registry | 比标准线 **更乱** | **高**（先对齐架构再加功能） |
| 「每 Agent 一颗 Pod」 | K8s 为每个 `agent_name` 起 Pod | **可行但非推荐**；成本 ≈ 每用户每 Agent 一颗 DeerFlow，运维爆炸 | **很高** |
| 用户之间隔离 | 不同 PVC / User Pod | **Minikube 强项**（物理隔离） | **低**（已实现） |

**Minikube 小结**：对 **「同一用户多 Agent」** 而言，Minikube **不降低**共享/隔离的实现难度；隔离需求靠 **DeerFlow 路径** 即可，共享需求靠 **产品 + Gateway**。Minikube 的额外价值在 **alice / bob 之间**，不在 **agent-a / agent-b 之间**。

#### 5.2.4 两方案对比（仅针对「同用户多 Agent」）

| 维度 | 标准部署 | Minikube Hub-and-Spoke |
| --- | --- | --- |
| **Agent 间隔离（配置、memory、thread）** | ✅ 路径已支持 | ✅ 同左（同一套代码） |
| **Agent 间共享（资料库、用户 memory、skills）** | 需应用层扩展 | 需应用层扩展；**还多 Hub/User Pod 一致性问题** |
| **实现工作量主要在哪** | Gateway、Paths、DB、前端能力选择 | **先**对齐标准 Gateway，**再**谈共享；不宜在 Hub 重复造目录 |
| **运维成本** | 低（一套存储、一套 Gateway） | 中（每用户 Pod；Agent 级不增加 Pod 则与标准相当） |
| **适合「硬隔离每 Agent」** | 不推荐（改架构） | 可做 per-agent Pod，**不推荐** |

**建议落地顺序（两方案通用）**：

1. 固化默认规则（上表 + 文档）——**低**
2. 用户级 `shared/` + 上传/挂载 API——**中**
3. Memory：可选「用户画像 + Agent 私有」合并注入——**中**
4. skills：用户安装表 + Agent 启用子集——**中高**
5. workflow：发布到「我的能力」+ run 引用——**高**

### 5.3 Minikube 的数据隔离（用户之间）

Minikube 线采用更硬的物理隔离：

```text
PVC deerflow-data-alice
  └── alice 的整颗 .deer-flow

PVC deerflow-data-bob
  └── bob 的整颗 .deer-flow
```

优势：

- 用户之间天然隔离，直观、好演示。
- 删除 / 备份某个用户数据相对直接。

问题：

- 用户之间共享公共能力、公共 skills、组织数据更麻烦。
- 每个 User Pod 自己维护运行环境，容易产生版本漂移。
- 同一用户多个 Agent 的隔离规则仍要靠 DeerFlow 内部路径设计解决；不是有了独立 Pod 就自动解决 Agent 级隔离。

### 5.4 数据隔离对比

| 问题 | 标准部署 | Minikube |
| --- | --- | --- |
| alice / bob 是否隔离 | 是，靠 `user_id` + 存储 / DB + 权限 | 是，靠不同 Pod + PVC |
| 同一用户多个 Agent 是否隔离 | 需要应用层规则：agent / thread / memory key | 仍需要应用层规则 |
| 公共 skills 如何共享 | 共享 registry / 只读公共目录 | Hub 或每个 User Pod 同步，成本更高 |
| 企业审计 | 统一 Gateway / DB 做审计（**❌** 审计模块未实现） | Hub 和 User Pod 都可能要打点（**❌**） |
| 数据备份 | 共享存储按 user_id 备份 | 每用户 PVC 备份 |

## 6. 重点问题四：部署和维护成本

### 6.1 标准部署成本

标准线是共享池模型：

```text
少量 frontend Pod
少量 Gateway Pod
共享 Redis / DB / 存储
Sandbox 按需扩缩
```

优势：

- Gateway 资源共享，用户低峰时不浪费。
- 扩容粒度是服务副本数，而不是用户数。
- 版本升级只升级一组 Deployment。
- 监控、日志、告警集中在少数服务。

成本来源：

- 需要做好 Gateway 无状态化、Redis / DB / PVC。
- Sandbox Provisioner 需要运维 K8s 权限、镜像、资源回收。
- 需要在应用层认真设计权限与数据隔离。

### 6.2 Minikube 方案成本

Minikube 是每用户一颗服务：

```text
用户数 N
  ≈ N 个 User Pod
  ≈ N 个 PVC
  ≈ N 份 DeerFlow runtime
```

优势：

- 隔离直观。
- PoC 容易解释：一个用户一套后端。
- 单用户故障边界清晰。

成本问题：

- 空闲用户也占一份基础资源，资源利用率低。
- 用户越多，Pod、PVC、Service 数量线性增长。
- 升级 DeerFlow 镜像时，需要滚动处理大量 User Pod。
- 公共配置、skills、模型 Key、依赖版本容易漂移。
- Hub 成为额外控制面，需要维护自己的账号、代理、K8s 权限、状态恢复。

### 6.3 成本对比表

| 维度 | 标准部署 | Minikube |
| --- | --- | --- |
| 计算资源 | 共享 Gateway，按整体负载扩容 | 每用户一套 DeerFlow，线性增长 |
| 存储 | 共享 PVC / NAS / DB，按 user_id 分区 | 每用户 PVC |
| 升级 | 升级少数 Deployment | 处理 Hub + 所有 User Pod |
| 监控 | 集中在 Gateway / Sandbox / DB | Hub + 每个 User Pod |
| 故障排查 | 请求链统一 | 需要定位具体用户 Pod |
| 企业治理 | Gateway 统一治理 | Hub 与 User Pod 容易分裂 |
| 适合规模 | 中到大规模多用户 | 小规模 demo / 隔离实验 |

## 7. 认证、请求与运行链路对比

### 7.1 标准部署请求链

```text
Browser
  └── Ingress / nginx
        └── Gateway
              ├── AuthMiddleware 解析用户
              ├── RunManager 执行 Agent
              ├── DB / Redis / Storage
              └── Sandbox（需要执行命令时）
```

### 7.2 Minikube 请求链

```text
Browser
  └── Ingress
        └── Hub
              ├── 校验 Hub JWT
              ├── 找到当前用户对应 Service
              └── 代理 /api/* 到 deerflow-{user_id}:8001
                    └── User Pod 内 Gateway 执行 Agent
```

核心差异：

| 问题 | 标准部署 | Minikube |
| --- | --- | --- |
| 谁认证用户 | Gateway | Hub |
| 谁跑 Agent | 共享 Gateway | 用户专属 User Pod 内 Gateway |
| 谁创建 Pod | Sandbox Provisioner 创建 Sandbox Pod | Hub 创建 User Pod |
| Pod 隔离对象 | 通常是 Sandbox / 服务副本 | 用户 |

## 8. Workflow Tool 的关系

> workflow-tool 的 publish / fork /「我的能力」等多为 **📋 产品目标**；与 §3、§4 未实现项一致，需在共享 Gateway + RBAC 落地后统一治理。

标准线更适合作为 workflow-tool 产品主路径：

```text
个人助手
  └── workflow builder
        ├── 保存草稿到用户空间
        ├── 发布到“我的能力”
        ├── 安装 / fork / 协作
        └── 在共享 Gateway 中运行
```

Minikube 当前可验证：

- 每用户独立后端能否运行 DeerFlow。
- Hub 中 workflow 前端和后端代理是否可跑通。
- PVC 是否保留用户数据。

但它暂时不适合承载完整产品能力：

- skills / workflow 商店治理不应散落在 Hub 和 User Pod。
- 发布、安装、分析、协作需要统一身份与统一 registry。
- 用户间共享能力不应靠复制到每个 Pod。

## 9. 选型建议

| 选择标准部署 | 选择 Minikube Hub-and-Spoke |
| --- | --- |
| 要做正式产品主路径 | 要做本地 K8s PoC |
| 要支持组织、权限、审计、skills 商店 | 要演示强物理隔离 |
| 要降低资源成本 | 用户数很少，资源成本不是重点 |
| 要统一升级和治理 | 想验证每用户独占后端的可行性 |
| 要长期承载 workflow-tool | 想临时验证 Hub + User Pod 模型 |

推荐路线：

```text
短期：Minikube 保留为 demo / 实验线
中期：补齐它与标准线的差异说明，避免被误认为生产主路径
长期：产品主路径回到共享 Gateway + 统一 skills/workflow registry + Sandbox Provisioner
```

## 10. 常见误解澄清

| 误解 | 澄清 |
| --- | --- |
| Gateway 就是 ALB / Ingress | 不是。DeerFlow Gateway 是应用后端 + Agent 运行时 |
| 标准部署不能跑 K8s | 可以。frontend、Gateway、Redis、DB、Sandbox 都可以上 K8s |
| 标准部署是一用户一 Pod | 不是。标准线是多用户共享 Gateway |
| Minikube 是官方生产拓扑 | 不是。它是本地 Hub-and-Spoke 实验线 |
| 有了用户 Pod，同一用户多个 Agent 就自然隔离 | 不是。Agent / thread / memory 仍要应用层规则 |
| skills 商店放 Hub 就够了 | 不够。发布、安装、分析、协作需要统一 registry 和权限模型 |
| 标准线已有完整 RBAC | **否**。已有认证 + `user_id` 隔离 + thread owner；**无** developer、`@require_role`、按角色 API |
| 登录即有全部 API 权限 | **是（当前缺口）**。`authz._authenticate` 对登录用户赋全量 `permissions`，待按角色收紧 |

## 11. 代码与文档索引

| 主题 | 路径 |
| --- | --- |
| K8s / 标准部署基础 | [standard-deployment.md](standard-deployment.md) |
| 企业部署设计 | [../project-agent/enterprise-deployment.md](../project-agent/enterprise-deployment.md) |
| Minikube 快速开始 | [../../../multi-user-k8s-local/README.md](../../../multi-user-k8s-local/README.md) |
| Hub 入口与代理 | `multi-user-k8s-local/hub/main.py` |
| User Pod 创建 | `multi-user-k8s-local/hub/k8s_manager.py` |
| User Pod 镜像 | `multi-user-k8s-local/user-pod/Dockerfile` |
| 标准 Gateway | `backend/app/gateway/` |
| 用户路径布局 | `backend/packages/harness/deerflow/config/paths.py` |
| 认证与隔离（**现状**） | [../../../backend/docs/AUTH_DESIGN.md](../../../backend/docs/AUTH_DESIGN.md) |
| 授权装饰器（**部分**） | `backend/app/gateway/authz.py` |
| 企业权限目标（**未全实现**） | [../project-agent/enterprise-deployment.md](../project-agent/enterprise-deployment.md) |
| skills 商店目标（**未全实现**） | [../project-agent/agent-skill-marketplace.md](../project-agent/agent-skill-marketplace.md) |
| workflow-tool 主设计 | [../workflow-tool/README.md](../workflow-tool/README.md) |
