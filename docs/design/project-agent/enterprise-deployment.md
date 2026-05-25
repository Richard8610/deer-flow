# 企业部署架构设计

## 背景

DeerFlow 在企业场景中需要支撑多用户、多业务 Agent 的并发使用。部署一整套 DeerFlow 后，需要解决角色权限分级、用户数据隔离、沙箱环境管理和运维伸缩等问题。

核心澄清点：

1. **角色权限**：管理员/开发者使用 `project_agent` 新建/编辑业务 Agent 和工作流；普通用户使用已发布的业务 Agent。
2. **用户隔离**：每个用户拥有独立 sandbox 环境，用户间数据不交叉。
3. **自动伸缩**：运维层面需支持按负载自动伸缩 sandbox 容器和服务实例。
4. **数据持久化**：用户数据、Agent 配置、工作流产物在不同生命周期中保持持久。

## 企业部署拓扑

### 架构复用总览

企业部署方案最大程度发挥 DeerFlow 2.0 现有能力，新增部分聚焦于未覆盖的企业级需求：

| 企业需求 | 🟢 复用现有 | 🆕 需新增 |
|---------|:---:|:---:|
| **用户认证** | AUTH_DESIGN.md：强制认证 + session/JWT + ContextVar 身份贯穿 | developer 角色 |
| **API 权限控制** | AuthMiddleware + `request.state.user` | `@require_role` 装饰器 |
| **文件隔离** | `users/{user_id}/threads/{thread_id}/user-data/` 自动解析 | — |
| **Memory 隔离** | `FileMemoryStorage(user_id=..., agent_name=...)` | — |
| **Sandbox 隔离** | SandboxMiddleware（before_agent 获取 + after_agent 释放） | per_user 策略 + 自动伸缩 |
| **线程检查点** | SQLite/Redis checkpointer + LangGraph checkpoint | — |
| **Gateway 水平扩展** | 无状态 Gateway + Redis session/checkpointer | — |
| **IM 渠道** | 飞书/钉钉/企微/微信/Slack/Telegram/Discord — ChannelManager 零改动 | — |
| **DeerFlowClient 嵌入** | `client.chat()` / `client.stream()` 零改动 | — |
| **Middleware 链** | 14 个主 Agent middleware 自动继承 | — |
| **运维监控** | — | Sandbox 指标 + 告警 |
| **备份恢复** | `.deer-flow/` 目录结构已有 | 自动化备份脚本 |

```text
                          ┌──────────────────┐
                          │   Load Balancer   │
                          │   / Nginx Ingress │
                          └────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
          ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
          │  Gateway #1  │ │  Gateway #2  │ │  Gateway #N  │
          │  (主服务)     │ │  (主服务)     │ │  (主服务)     │
          └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                 │               │               │
                 └───────────────┼───────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
          ┌─────────────┐ ┌──────────┐ ┌──────────┐
          │   Sandbox    │ │  Redis   │ │  SQLite/ │
          │   Pool       │ │  (Cache/ │ │  PG      │
          │  (按需扩缩)   │ │  Check-  │ │  (用户   │
          │              │ │  point)  │ │   数据)  │
          └─────────────┘ └──────────┘ └──────────┘
```

## 角色与权限

### 角色定义

| 角色 | 权限范围 |
|------|---------|
| **管理员（admin）** | 系统配置、用户管理、全部 Agent 管理、全部数据访问 |
| **开发者（developer）** | 使用 `project_agent` 创建/编辑/发布业务 Agent 及工作流；管理所负责业务的 skills |
| **普通用户（user）** | 使用已授权的业务 Agent；管理自己的对话线程和数据 |

> 当前 DeerFlow 已有 `admin` 和 `user` 两种 `system_role`（见 [AUTH_DESIGN.md](../../backend/docs/AUTH_DESIGN.md)），
> `developer` 角色需新增。

### 权限控制矩阵

| 操作 | admin | developer | user |
|------|-------|-----------|------|
| 系统配置修改 | ✅ | ❌ | ❌ |
| 用户管理 | ✅ | ❌ | ❌ |
| 使用 project_agent 创建 Agent | ✅ | ✅ | ❌ |
| 编辑/发布业务 Agent | ✅ | ✅（自己创建的） | ❌ |
| 管理 Skills | ✅ | ✅（限定范围） | ❌ |
| 使用业务 Agent | ✅ | ✅ | ✅（按授权） |
| 管理自己的线程/数据 | ✅ | ✅ | ✅ |
| 查看他人线程/数据 | ✅ | ❌ | ❌ |

### 实现方式

权限控制应贯穿两个层面：

#### 1. API 层

```python
# Gateway 中间件层
from deerflow.runtime.user_context import get_current_user

def require_role(role: str):
    user = get_current_user()
    if user.system_role not in [role, "admin"]:
        raise PermissionDenied(f"需要 {role} 或更高权限")

# project_agent 相关路由
@router.post("/api/agents")
@require_role("developer")
async def create_agent(...):
    ...

# 普通业务 Agent 使用
@router.post("/api/runs/stream")
@require_role("user")
async def stream_run(...):
    ...
```

#### 2. Agent 层

每个业务 Agent 发布时指定可使用该 Agent 的用户/角色范围：

```yaml
# agents/supplier-evaluation/config.yaml
display_name: 供应商评估
model: gpt-4o
access:
  roles:
    - user
    - developer
  users:
    - specific_user_id_1
  departments:
    - 采购部
```

## 用户数据隔离

### 文件系统隔离

每个用户的数据在文件系统中按 `user_id` 隔离：

```text
.deer-flow/users/{user_id}/
├── memory.json                    ← 用户长期记忆
├── threads/
│   └── {thread_id}/
│       ├── checkpoints/           ← 线程检查点
│       └── user-data/
│           ├── uploads/           ← 用户上传文件
│           ├── workspace/         ← Agent 工作目录
│           └── outputs/           ← 生成交付物
└── agents/
    └── {agent_name}/
        └── memory.json            ← Agent 级别记忆
```

> 当前 AUTH_DESIGN.md 已确认：filesystem 路径自动按当前用户解析，
> `users/{user_id}/threads/{thread_id}/user-data`。

### Sandbox 容器隔离

每个用户的 Sandbox 环境应独立创建，避免文件交叉污染：

```yaml
# sandbox 分配策略
sandbox:
  strategy: per_user       # 每用户一个 sandbox
  idle_timeout: 3600       # 空闲 1 小时后回收
  max_per_user: 3          # 每用户最多 3 个 sandbox（并发任务）
  image: deerflow-sandbox:latest
  mounts:
    - source: .deer-flow/users/{user_id}
      target: /mnt/user-data
      mode: rw
```

关键约束：

- 用户只能访问 `/mnt/user-data/{user_id}/` 下的文件。
- Sandbox 容器间网络隔离。
- 容器销毁时确保临时数据已持久化到用户目录。

### 数据生命周期

| 数据类型 | 持久化策略 | 清理策略 |
|---------|-----------|---------|
| 用户记忆 | 写时持久化 | 管理员手动清理 |
| 线程检查点 | 自动保存（每次 Agent 轮次后） | 用户可删除；支持 TTL 自动清理 |
| 上传文件 | 上传时持久化 | 关联线程删除时清理 |
| 工作区文件 | 任务结束时保留 | 用户可手动清理 |
| 交付物 | 任务结束时保存 | 按版本管理，不自动删除 |
| Sandbox 临时文件 | 容器回收时删除 | 自动清理 |

## 自动伸缩

### Sandbox 自动伸缩

```
┌─────────────────────────────────────────────────┐
│                 Sandbox Manager                   │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Idle Pool │  │ Active    │  │ Pending Queue│   │
│  │ (预热)    │  │ (使用中)   │  │ (排队等待)    │   │
│  │  0~N      │  │  0~MAX    │  │  0~N          │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
│                                                   │
│  Scale up: idle < min_idle → 创建新容器            │
│  Scale down: idle > min_idle × 2 → 回收空闲容器     │
│  Max containers: 受节点资源限制                     │
└─────────────────────────────────────────────────┘
```

配置示例：

```yaml
sandbox:
  autoscaling:
    min_idle: 2            # 最少保持 2 个预热容器
    max_idle: 10           # 最多空闲容器数
    max_total: 50          # 总容器上限
    scale_up_threshold: 1  # 空闲容器 < 该值时扩容
    scale_down_after: 300  # 空闲超过 5 分钟后回收
```

### Gateway 服务伸缩

Docker Compose 或 K8s 层面配置：

```yaml
# docker-compose.prod.yml
services:
  gateway:
    image: deerflow-gateway:latest
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "4"
          memory: 8G
    environment:
      - REDIS_URL=redis://redis:6379/0
      - CHECKPOINTER_TYPE=redis
```

关键点：

- Gateway 服务无状态（状态存 Redis），可水平扩展。
- 使用 Redis 作为 checkpointer 和 session 存储。
- 负载均衡器配置 sticky session 或前端自行管理 thread_id。

## 运维建议

### 监控指标

| 指标 | 说明 | 告警阈值建议 |
|------|------|-------------|
| Sandbox 使用数 | 当前活跃 sandbox 数量 | > max_total × 80% |
| Sandbox 排队等待时间 | 用户请求等待 sandbox 的时间 | > 30s |
| Gateway 响应时间 | P95 延迟 | > 10s |
| Agent 执行失败率 | evaluate 不通过率 | > 20% |
| 磁盘使用率 | `.deer-flow/` 目录大小 | > 80% |

### 备份策略

```bash
# 定期备份
0 2 * * * tar -czf /backup/deerflow-$(date +%Y%m%d).tar.gz .deer-flow/
0 3 * * 0 rsync -avz .deer-flow/ backup-server:/deerflow-backup/

# 关键配置纳入 Git
git add config.yaml agents/ projects/
```

### 安全加固

见 [README_zh.md 安全使用建议](../../README_zh.md#安全使用)：

- 配置 IP 白名单
- 前置身份验证（Nginx + OAuth2）
- 网络隔离（专用 VLAN）
- 定期审计 Agent 执行日志

## 与现有 AUTH_DESIGN 的关系

当前 `backend/docs/AUTH_DESIGN.md` 已实现：

- 强制认证（除健康检查和文档路由外）
- 用户身份贯穿 HTTP API、文件系统、memory、agent 配置
- 按用户隔离文件路径和 memory

本文在此基础上补充：

- 细粒度角色（新增 developer 角色）
- Agent 级别的访问控制（哪些用户可以使用某个 Agent）
- Sandbox 级别的用户隔离（per-user sandbox）
- 运维层面的自动伸缩和数据持久化策略

## 后续待明确

1. **部门/组织层级**：是否需要支持按部门划分用户组，统一管理权限。
2. **审计日志**：是否需要完整的操作审计日志（谁在何时使用了哪个 Agent，产生了什么结果）。
3. **计费/配额**：是否需要按用户或按调用量做配额管理。
4. **OAuth/SSO 集成**：企业场景通常需要对接 LDAP/SAML/OIDC，当前仅占位。
5. **跨用户协作**：是否需要支持线程共享、Agent 协作编辑等功能。