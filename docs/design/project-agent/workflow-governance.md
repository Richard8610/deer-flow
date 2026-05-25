# 工作流治理模型澄清（初期设计）

> **主文档已迁至** [`../workflow-tool/governance.md`](../workflow-tool/governance.md)。

> **状态**：2026-05 讨论结论，覆盖 README / 架构文档中「仅管理员/开发者可制定工作流」的旧口径。  
> **阶段**：初期方案设计，**不涉及具体业务交付与租户级数据权限**。

## 1. 口径调整摘要

| 维度 | 旧口径（文档草稿中常见） | **新口径（初期设计）** |
| --- | --- | --- |
| **谁可以创建工作流** | 管理员 / 开发者 | **每个登录用户**均可创建、编辑自己的 workflow |
| **谁可以使用** | 普通用户仅能「选用」已发布 Agent | 用户可 **发布 / 下载(复制) / 分享 / 协作**；使用方式更灵活 |
| **创建入口** | 固定 `project_agent` | **用户当前个人助手 Agent** 调用 workflow builder；独立 Workflow Builder 编辑 |
| **权限重心** | 前置 RBAC（developer 才能建） | 前置 **可见性与协作**；**数据权限后置** |
| **商店/审批** | 发布常伴随审批、按角色 access | 商店作为 **分发与发现** 渠道；审批 **可选**（企业配置项） |
| **适用阶段** | 偏企业交付态 | **平台能力探索期**，先跑通闭环 |

**原则**：先让「人人可建、可发、可拷、可协作」跑通；等企业场景、多租户、合规需求明确后，再用 **数据权限 + 可选审批** 收窄，而不是在初期就把创建权锁死在管理员。

## 2. 与现有技术主线的关系（不变）

以下能力 **不因治理调整而推翻**：

- `WorkflowSpec` + Web 画布 + 自然语言 patch（设计态）
- `workflow.draft.json` / `workflow.published.json` + `nodes/*.py`（发布态）
- 个人助手 / custom agent 运行时调用已发布 workflow，必要时 **decompose_v2** 读已发布 DAG，**确定性执行**（非每次 LLM 即兴拆解）
- 执行隔离：thread / checkpoint / **per-user sandbox**（用户数据仍隔离）

治理变的是 **谁能在设计态改 spec、谁能在目录/商店里看到副本**，不是运行时 DAG 执行模型。

## 2.1 一期交互形态：独立 Builder 闭环

结合当前已实现的 `workflow_frontend`，一期不退回纯对话，也不要求 Chat 内嵌 Coze/n8n 式侧边栏画布。默认交互是：

```text
用户使用个人助手
  -> 说：帮我做一个日报工作流
  -> 个人助手调用 workflow builder / workflow-code-generator
  -> 生成 workflow draft + workflow.json + 初始 runner/graph
  -> 自动打开或返回独立 Workflow Builder 链接
  -> 用户在 Builder 画布编辑，也可继续通过对话调整
  -> 保存 draft，测试运行
  -> publish
  -> 注册到「我的能力」
  -> 当前个人助手后续可直接调用该 workflow
```

后续再增强为 Chat + 嵌入式侧边栏画布、多人实时协作、商店评分和审批。独立 Builder 是一期正式入口，不是临时降级方案。

## 3. 初期：工作流生命周期

```text
create（用户创建草稿）
  -> draft：仅创建者 + 被邀请协作者可编辑
  -> publish：生成 published 版本 + 注册到「我的能力」（可选包装为 workflow skill / app）
  -> distribute：进入「我的 / 团队 / 公开」发现面（见下节）
  -> fork/download：其他用户复制到自己的 workflow 命名空间下再改
  -> collaborate：多人共编 draft（权限：view / edit / admin-on-resource）
  -> deprecate：作者标记弃用；已 fork 副本不强制删除
```

**非目标（初期不做）**：

- 部门级数据权限策略引擎
- 强制管理员审批才能 publish（可作为 `config.publish_approval: true` 预留）
- 与具体业务系统（采购、HR）的字段级授权

## 4. 发布 / 下载 / 分享 / 协作

| 动作 | 含义 | 初期最小实现设想 |
| --- | --- | --- |
| **发布（publish）** | 将 draft 固化为 `workflow.published.json` + 代码产物，并登记到「我的能力」 | 与 [workflow-spec.md](workflow-spec.md) Milestone 1–6 一致 |
| **下载（fork）** | 复制他人已发布（或公开 draft）的 workflow 包到自己的 workflow 命名空间 | 文件拷贝 + 新 `owner_user_id`；provenance 记录 `forked_from` |
| **分享（share）** | 生成只读链接，或把 **选用权** 加入对方「我的工作流」 | 链接带 visibility；不要求对方有 developer 角色 |
| **协作（collaborate）** | 邀请用户共编 **draft**（非直接改 published） | ACL：`viewer` / `editor`；published 变更仍走「编辑 draft → 再 publish」 |

**关键约束**：共享 workflow 共享的是流程、spec、代码产物和 manifest，**不共享作者的数据上下文**。fork / install 后执行时使用调用者自己的 sandbox、memory、uploads、credentials 与可访问数据。

**与 Agent/Skills 商店的关系**：

- 商店 = **发现 + 分发 + 计量**（描述、版本、评分、使用量），不是「唯一合法使用入口」。
- 用户仍可直接 fork 仓库内 `projects/` 下的公开 workflow，不经过审批。
- [agent-skill-marketplace.md](agent-skill-marketplace.md) 中的 `review → 审批 → published` 降级为 **企业可选**，非默认路径。

## 5. 权限：初期 vs 后续

### 5.1 初期（默认）

| 层级 | 规则 |
| --- | --- |
| **平台** | 登录即可创建 workflow；系统级 admin 仍可管配置与用户 |
| **资源（workflow）** | 创建者 = owner；owner 决定 visibility + 协作者 |
| **运行** | 执行产物、thread、memory、uploads、credentials 仍 **按调用者 user_id 隔离**（见 [enterprise-deployment.md](enterprise-deployment.md)） |
| **可见性** | `private`（仅自己+协作者）/ `team`（同组，组模型可后置）/ `public`（全员可见可 fork） |

### 5.2 后续（收窄时用）

| 能力 | 说明 |
| --- | --- |
| **数据权限** | 按部门、项目、数据域限制「谁能看哪些 workflow 的输出/知识库/附件」 |
| **创建权收窄** | 配置项：仅 `developer` 可 publish 到 `public` 或商店 |
| **审批** | `publish_approval`：提交 → 管理员通过 → 上架 |
| **配额** | 每用户 publish 数、并发 sandbox、存储上限 |

## 6. 对现有文档的修订建议

| 文档 | 建议修订 |
| --- | --- |
| [README.md](README.md) | 核心定位改为「用户」而非「管理员/开发者」；口径说明指向本文 |
| [workflow-agent-architecture.md](workflow-agent-architecture.md) | 核心主语改为「个人助手调用 workflow builder」；能力表「角色权限 developer」标为 **Phase 2 可选** |
| [enterprise-deployment.md](enterprise-deployment.md) | 角色矩阵中「编辑/发布」对 user 改为 ✅（自己的）或拆成「创建自己的 / 管理他人的」 |
| [agent-skill-marketplace.md](agent-skill-marketplace.md) | 生命周期默认去掉强制 `review`；增加 fork/share 与 owner 字段 |
| [workflow-spec.md](workflow-spec.md) | 补充 visibility、owner、forked_from 等 metadata（可放 Milestone 5+） |

## 7. 与 Coze 的对照（便于讨论）

| Coze 平台倾向 | DeerFlow 初期取向 |
| --- | --- |
| 空间内成员可建 workflow | 登录用户可建，visibility 控制扩散范围 |
| 复制 / 模板 | **fork/download** 为一等公民 |
| 发布到 Bot/Agent | **publish** → 业务 Agent 或 workflow skill |
| 企业版权限 | 对应本文 **§5.2 数据权限**，后置 |

## 8. 待决问题（下一轮可收敛）

1. **public fork 后是否允许再 publish 同名 Agent**（命名空间冲突策略）。
2. **协作** 是仅共享 draft，还是允许「提议 PR 式」合并回 owner。
3. **team visibility** 依赖的组织模型：先 stub 为「邀请列表」还是接 LDAP 组。
4. **商店条目** 与 `projects/{name}/` 目录是同一实体还是商店仅索引。

---

**相关文档**：[workflow-agent-architecture.md](workflow-agent-architecture.md) · [workflow-spec.md](workflow-spec.md) · [agent-skill-marketplace.md](agent-skill-marketplace.md)
