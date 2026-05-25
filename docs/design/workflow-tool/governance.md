# Workflow Tool 治理（初期）

> 平台探索期口径：人人可建、可发、可拷、可协作；强 RBAC 与部门数据权限后置。

## 1. 与旧口径的差异

| 维度 | 旧口径 | 初期口径 |
| --- | --- | --- |
| 谁可创建 | 管理员 / 开发者 | **每个登录用户** |
| 创建入口 | 固定 `project_agent` | **个人助手 + workflow builder + 独立 Builder** |
| 使用方式 | 仅选用已发布 Agent | 发布 / fork / 分享 / 协作 |
| 权限重心 | 前置 RBAC | **可见性 + 资源 ACL**；数据权限后置 |
| 商店/审批 | 常强制审批 | 商店=发现分发；审批=**可选** |

## 2. 生命周期

```text
create -> draft（owner + 协作者可编辑）
      -> publish -> 「我的能力」+ 可选 Skill/App 包装
      -> distribute（我的 / 团队 / 公开）
      -> fork/install（新 owner，新命名空间）
      -> collaborate（共编 draft，不改 published 直写）
      -> deprecate（作者标记；已 fork 副本保留）
```

初期不做：部门数据权限引擎、强制 publish 审批、业务系统字段级授权。

## 3. 发布 / fork / 分享 / 协作

| 动作 | 含义 |
| --- | --- |
| **publish** | draft → `workflow.published.json` + 代码产物 + manifest，登记「我的能力」 |
| **fork** | 复制 workflow 包到新 owner；记录 `forked_from` |
| **share** | 只读链接或加入对方「我的工作流」 |
| **collaborate** | 共编 draft；`viewer` / `editor`；改 published 须 draft → 再 publish |

**关键**：共享的是流程、spec、代码、manifest；**不共享**作者 sandbox、memory、uploads、credentials。执行一律用**调用者**上下文。

## 4. 可见性与权限

### 初期默认

| 层级 | 规则 |
| --- | --- |
| 平台 | 登录即可建 workflow |
| 资源 | owner 决定 visibility、协作者 |
| 运行 | thread / memory / 产物按 **调用者 user_id** 隔离 |
| visibility | `private` / `team`（可后置组模型）/ `public` |

### 企业收窄（后置）

- 数据权限（部门、项目、输出可见性）
- 仅 developer 可 publish 到 public 或商店
- `publish_approval` 审批
- 配额（publish 数、存储、sandbox）

## 5. 与商店的关系

- 商店 = 发现、分发、计量，非唯一合法入口。
- 用户可直接 fork 公开 workflow，不必经审批。
- 详见 [../project-agent/agent-skill-marketplace.md](../project-agent/agent-skill-marketplace.md)。

## 6. 待决问题

1. public fork 后同名 workflow 命名冲突策略。
2. 协作是否支持「提议合并回 owner」。
3. `team` 先邀请列表还是 LDAP 组。
4. 商店条目与 `projects/{name}/` 是同一实体还是索引层。
