# DeerFlow 标准部署与 Kubernetes 概念

> 目的：先把 **K8s 基础概念** 和 **DeerFlow 标准部署模型** 讲清楚。  
> 若要看标准部署与 `multi-user-k8s-local/` 的差异，见 [standard-vs-minikube.md](standard-vs-minikube.md)。

## 1. 先记住一句话

DeerFlow 标准线的核心是：

```text
多用户共享一组 DeerFlow 应用后端（Gateway）
用户隔离靠 user_id + 存储路径 + 数据库
命令执行隔离靠 Sandbox（本机目录 / Docker 容器 / K8s Pod）
```

Kubernetes 只是部署方式之一。上 K8s 后，Gateway、frontend、Sandbox 等会变成 Pod；但 **用户、Agent、thread 仍是应用模型，不会自动变成 Pod**。

## 2. K8s 四层：Cluster、Node、Pod、Container

```text
Cluster（集群）
 └── Node（节点）
       └── Pod
             └── Container（容器）
```

| 概念 | 通俗理解 | AWS 类比 |
| --- | --- | --- |
| **Container** | 镜像跑起来后的进程环境 | Docker 容器 / ECS Container |
| **Pod** | K8s 调度的最小单位，通常 1 个主容器 | 接近 ECS Task |
| **Node** | 真正跑 Pod 的机器，通常是 VM 或物理机 | 一台 EKS Worker EC2 |
| **Cluster** | 控制面 + 若干 Node，统一调度 Pod | 整个 EKS 集群 |

补充几个常见对象：

| K8s 对象 | 作用 | DeerFlow 例子 |
| --- | --- | --- |
| **Deployment** | 维持 N 个相同 Pod | `gateway` 副本数 3 |
| **Service** | 给 Pod 提供稳定集群内访问名 | `gateway.default.svc` 指到 gateway Pod |
| **Ingress** | 集群外 HTTP 入口 | `deerflow.company.com` 路由到 frontend / Gateway |
| **PVC** | 申请一块持久盘 | 存 `.deer-flow/users/...` 或 Sandbox 数据 |
| **ConfigMap / Secret** | 配置与密钥 | `config.yaml`、模型 API Key |
| **RBAC** | 允许某服务账号调用 K8s API | Sandbox Provisioner 创建 Sandbox Pod |

## 3. DeerFlow 的应用模型

这些概念属于 DeerFlow 本身，不属于 K8s：

| DeerFlow 概念 | 标准线里是什么 | 不是什么 |
| --- | --- | --- |
| **用户** | 登录账号，对应 `user_id` | 不是 OS 用户，也不是 Pod |
| **Agent** | Gateway 内的配置、图、skills、SOUL | 不是独立进程，也不是 Pod |
| **thread** | 一次对话会话 | 不是 Gateway 副本 |
| **Sandbox** | Agent 跑 bash、读写文件的工作区 | 不是 Agent 本体 |
| **Gateway** | DeerFlow 的 FastAPI 应用后端 + Agent 运行时 | 不是 ALB / Ingress |

标准线里最重要的边界是：

```text
Gateway 跑 Agent 逻辑
Sandbox 跑命令执行
user_id 决定数据归属
thread_id 决定会话与工作区
```

## 4. 术语澄清：Gateway 不是 ALB / Ingress

行业里 Gateway 常指流量入口，比如 ALB、Nginx、K8s Ingress、API Gateway。

DeerFlow 代码里的 `backend/app/gateway` 命名容易误导。它实际更像：

| 更贴切的名字 | DeerFlow Gateway 实际职责 |
| --- | --- |
| 应用 API 服务 / BFF | 登录、threads、runs、agents、skills、uploads、memory、MCP |
| Agent 运行时宿主 | 内嵌 LangGraph runtime，执行 `lead_agent` / custom agent |
| 业务后端 | 读写持久化、驱动工具调用，不只是转发 |

因此部署图里建议这样读：

```text
浏览器
  └── ALB / Nginx / Ingress      ← 真正的流量入口
        ├── frontend             ← 页面
        └── DeerFlow Gateway     ← 应用后端 + Agent 大脑
```

下文若说 **Gateway 集群**，意思是 **DeerFlow 应用后端多副本**，不是多台 ALB。

## 5. 标准部署形态一：`make dev`

本地开发没有 K8s。它本质是一台机器上多个进程：

```text
你的 Mac / Linux
 ├── nginx :2026
 │    ├── frontend :3000
 │    └── Gateway :8001
 │          ├── .deer-flow/users/{user_id}/...
 │          └── Sandbox（常见为本机目录）
```

对应关系：

| 问题 | 答案 |
| --- | --- |
| 有 Cluster / Node / Pod 吗？ | 没有 |
| 跑 Agent 的地方 | Gateway 进程 |
| 多用户怎么隔离 | `user_id` + `.deer-flow/users/{user_id}/...` |
| Sandbox 是什么 | 常为本机目录；可按配置切到 Docker |

## 6. 标准部署形态二：Docker Compose

`docker/docker-compose.yaml` 是标准生产入门形态之一。它有 Docker 容器，但仍没有 K8s 的 Cluster / Node / Pod。

| Compose 服务 | 职责 | 将来上 K8s 时通常对应 |
| --- | --- | --- |
| `nginx` | 统一入口，反向代理 | Ingress / Nginx |
| `frontend` | Next.js 页面 | frontend Deployment |
| `gateway` | FastAPI + Agent 运行时 | gateway Deployment |
| `provisioner`（可选） | 调 K8s API 创建 Sandbox Pod | provisioner Deployment |

典型结构：

```text
Docker Host
 ├── container: nginx
 ├── container: frontend
 ├── container: gateway
 │     ├── /app/backend/.deer-flow  ← 挂载宿主机目录
 │     └── Docker socket            ← AioSandbox 可再起沙箱容器
 └── container: provisioner（可选）
```

注意：

- 多用户仍共享 `gateway` 容器。
- Sandbox 若使用 Docker 模式，通常由 Gateway 通过宿主机 Docker 再起额外沙箱容器。
- 这仍不是「每用户一颗 Gateway」。

## 7. 标准部署形态三：企业 K8s

企业 K8s 是把标准线的各服务放进集群调度：

```text
K8s Cluster
 └── Node 1..N
       ├── Pod: frontend-xxx       → Container: Next.js
       ├── Pod: gateway-xxx        → Container: FastAPI + Agent runtime
       ├── Pod: gateway-yyy        → Container: FastAPI + Agent runtime
       ├── Pod: provisioner-xxx    → Container: Sandbox Provisioner（可选）
       ├── Pod: sandbox-thread-a   → Container: 命令执行环境（动态）
       └── Pod: redis / db         → 也可使用集群外托管服务
```

从外部看：

```text
浏览器
  └── Ingress / ALB
        ├── frontend Service
        └── gateway Service
              ├── gateway Pod #1
              ├── gateway Pod #2
              └── gateway Pod #N
```

从 Agent 执行看：

```text
Gateway Pod
  ├── 读取 user_id，确定用户目录与权限
  ├── 读取 thread_id，确定会话与 checkpoint
  └── 需要执行 bash / 写文件时
        └── Sandbox Provisioner
              └── 创建或复用 Sandbox Pod
```

## 8. 标准线里各概念如何映射到 K8s

| DeerFlow 概念 | 标准 K8s 中通常对应 | 不应该理解为 |
| --- | --- | --- |
| 用户 `user_id` | 请求身份 + 共享存储中的目录前缀 | 每用户一个 Pod |
| Agent | Gateway 容器内的配置、图、skills | 独立 Pod |
| thread | 会话 ID + checkpoint + 工作区 | Gateway 副本 |
| Gateway 集群 | 多个相同 gateway Pod | 多个用户专属后端 |
| Sandbox | 动态 Sandbox Pod / Docker 容器 / 本机目录 | Gateway Pod |
| `.deer-flow` | PVC / NAS / 对象存储挂载后的数据根 | Pod 本身 |

## 9. Sandbox 的三种实现

| Sandbox 模式 | 适用场景 | 隔离强度 |
| --- | --- | --- |
| LocalSandbox | 单人本地开发，最轻 | 弱；本机目录，不是安全边界 |
| Docker / AioSandbox | Docker 部署或本机容器隔离 | 中；容器级隔离 |
| K8s Provisioner + Sandbox Pod | 企业多用户、需要统一调度与回收 | 强；每个沙箱会话可用独立 Pod |

容易混的点：

| 问题 | 结论 |
| --- | --- |
| 一个 Agent 一个 Sandbox？ | 否，默认按 thread 绑定 |
| 一个用户一个 Sandbox？ | 不一定；标准线更关注 thread 工作区 |
| Sandbox Pod 是 Gateway Pod 吗？ | 否，Gateway 跑 Agent 逻辑，Sandbox 跑命令 |
| 标准线只把 Sandbox 放 K8s 吗？ | 否，frontend / Gateway / Redis / DB 也可以上 K8s |

## 10. 标准部署的推荐心智模型

如果你熟悉 AWS，可以这样类比：

| DeerFlow 标准 K8s | AWS 心智模型 |
| --- | --- |
| Ingress / ALB | ALB |
| gateway Deployment | ECS Service / EKS Deployment，运行应用后端 |
| frontend Deployment | 前端 Web 服务 |
| Redis / DB | ElastiCache / RDS |
| PVC / NAS | EFS / EBS / FSx |
| Sandbox Pod | 按需创建的隔离执行任务，接近临时 ECS Task |

最终记忆句：

```text
Pod / Node 是部署层概念。
用户 / Agent / thread 是 DeerFlow 应用层概念。
标准线共享 Gateway，隔离靠 user_id、存储和 Sandbox。
```

## 11. 相关文档

| 文档 | 用途 |
| --- | --- |
| [standard-vs-minikube.md](standard-vs-minikube.md) | 标准部署 vs Minikube Hub-and-Spoke 对比 |
| [../project-agent/enterprise-deployment.md](../project-agent/enterprise-deployment.md) | 企业部署设计草案 |
| [../../../docker/docker-compose.yaml](../../../docker/docker-compose.yaml) | Docker Compose 生产入口 |
| [../../../backend/docs/AUTH_DESIGN.md](../../../backend/docs/AUTH_DESIGN.md) | 标准认证与 `user_id` 隔离 |
| [../../../frontend/src/content/zh/application/deployment-guide.mdx](../../../frontend/src/content/zh/application/deployment-guide.mdx) | 官方部署指南与 Sandbox 配置 |
