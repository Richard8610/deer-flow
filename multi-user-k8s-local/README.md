# DeerFlow — Multi-User Kubernetes (Minikube) Setup

A **Hub-and-Spoke** multi-user system for DeerFlow that runs entirely on local
Minikube. Each user gets an isolated DeerFlow backend pod with a dedicated
PersistentVolumeClaim so data survives pod restarts.

## Architecture

```
                          ┌─────────────────────────────────────────┐
                          │  Minikube cluster  (namespace: deerflow) │
                          │                                          │
Browser / curl            │  ┌──────────────────────┐               │
       │                  │  │   Hub (FastAPI)        │               │
       │  HTTP            │  │                        │               │
       └──────────────────┼─▶│  /register             │               │
            deerflow.local│  │  /login                │               │
            :80 (Ingress) │  │  /me                   │               │
                          │  │  /logout               │               │
                          │  │  /api/* ──proxy──────────────────┐    │
                          │  │                        │          │    │
                          │  │  SQLite (/data/)       │          ▼    │
                          │  │  hub-data-pvc          │  ┌──────────┐ │
                          │  └──────────────────────┘  │ User Pod  │ │
                          │           │                 │ alice     │ │
                          │           │ k8s SDK         │ port 8001 │ │
                          │           │ (pods/pvcs/svcs) │           │ │
                          │           ▼                 │ PVC:      │ │
                          │  ┌──────────────┐          │ deerflow- │ │
                          │  │  Kubernetes  │          │ data-1    │ │
                          │  │  API Server  │          └──────────┘ │
                          │  └──────────────┘                       │
                          │                           ┌──────────┐  │
                          │                           │ User Pod  │  │
                          │                           │ bob       │  │
                          │                           │ port 8001 │  │
                          │                           │           │  │
                          │                           │ PVC:      │  │
                          │                           │ deerflow- │  │
                          │                           │ data-2    │  │
                          │                           └──────────┘  │
                          └─────────────────────────────────────────┘
```

**Hub** authenticates users via JWT and manages per-user Kubernetes resources:
- Pod named `deerflow-{user_id}`
- PVC named `deerflow-data-{user_id}` (1 Gi, persisted across logouts)
- ClusterIP Service named `deerflow-{user_id}`

**User pods** run the DeerFlow backend. The Hub proxies `/api/*` requests
transparently, adding `X-User-Id` for traceability.

## Prerequisites

- [Minikube](https://minikube.sigs.k8s.io/docs/start/) >= 1.32
- [kubectl](https://kubernetes.io/docs/tasks/tools/) matching your cluster version
- [Docker](https://docs.docker.com/get-docker/) (used as the Minikube driver)

## Quick start

### 1. Start Minikube and enable addons

```bash
bash src/setup.sh
```

This starts Minikube with 4 CPUs / 6 GB RAM and enables the Nginx Ingress and
storage-provisioner addons.

### 2. Start the Minikube tunnel (separate terminal)

The tunnel makes the Nginx Ingress accessible on `localhost:80`.

```bash
minikube tunnel
```

Leave this running in its own terminal window.

### 3. Add a `/etc/hosts` entry

```bash
echo "$(minikube ip) deerflow.local" | sudo tee -a /etc/hosts
```

### 4. Build Docker images

Images are built **inside Minikube's Docker daemon** so they are available to
Kubernetes without a registry.

```bash
bash src/build.sh
```

This builds:
- `deerflow-hub:latest` from `hub/`
- `deerflow-user-pod:latest` from `backend/` using `user-pod/Dockerfile`

### 5. Deploy to Kubernetes

```bash
bash src/deploy.sh
```

Watch the Hub pod come up:

```bash
kubectl get pods -n deerflow -w
```

## API usage

### Register a new user

```bash
curl -X POST http://deerflow.local/register \
  -H 'Content-Type: application/json' \
  -d '{"username": "alice", "password": "s3cur3pass"}'
```

### Log in and receive a JWT

```bash
TOKEN=$(curl -s -X POST http://deerflow.local/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "alice", "password": "s3cur3pass"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "Token: $TOKEN"
```

Logging in also provisions the user's DeerFlow pod (may take ~30 s to become
`Running`).

### Check your user info and pod status

```bash
curl http://deerflow.local/me \
  -H "Authorization: Bearer $TOKEN"
```

### Call the DeerFlow API (proxied)

```bash
curl http://deerflow.local/api/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}' \
  --no-buffer
```

All `/api/*` requests are forwarded to the user's private DeerFlow pod.

### Log out (stops pod, preserves data)

```bash
curl -X POST http://deerflow.local/logout \
  -H "Authorization: Bearer $TOKEN"
```

## Direct access via NodePort (no tunnel required)

```bash
# Get the Minikube IP
MINIKUBE_IP=$(minikube ip)
# Hub is also exposed on NodePort 30080
curl http://${MINIKUBE_IP}:30080/health
```

## How DeerFlow skills work in this setup

DeerFlow skills are loaded from the `skills/` directory inside the backend. In
this multi-user setup there are two approaches:

1. **Baked into the image (default):** The `user-pod/Dockerfile` copies the
   entire `backend/` directory, including any `skills/` sub-directory, into the
   image at build time. All users share the same set of baked-in skills.

2. **Per-user skills via ConfigMap:** For advanced use-cases, create a
   Kubernetes ConfigMap containing the skill YAML files and mount it into each
   user pod under `/app/skills/`. Update `k8s_manager.py` to add a
   `configmap_key_to_path` volume mount when creating pods.

## Useful commands

```bash
# Watch all pods in the deerflow namespace
kubectl get pods -n deerflow -w

# View Hub logs
kubectl logs -n deerflow -l app=hub -f

# View a specific user's pod logs
kubectl logs -n deerflow deerflow-1 -f

# List PVCs (user data volumes)
kubectl get pvc -n deerflow

# Delete everything (keeps PVCs)
kubectl delete deployment,service,ingress hub hub-nodeport hub-ingress -n deerflow

# Full teardown including PVCs
kubectl delete namespace deerflow
```

## Scripts reference

| Script | Description |
|--------|-------------|
| `scripts/setup.sh` | Start Minikube, enable Ingress + storage-provisioner |
| `scripts/build.sh` | Build Docker images inside Minikube's daemon |
| `scripts/deploy.sh` | Apply all Kubernetes manifests |

All scripts are executable (`chmod +x` already applied). Run them from the
repo root or from the `multi-user-k8s-local/` directory.

## Configuration

Hub settings can be overridden via environment variables (see `hub/config.py`):

| Env var | Default | Description |
|---------|---------|-------------|
| `SECRET_KEY` | `change-me-in-production` | JWT signing key (set via `hub-secrets` Secret) |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Token TTL (8 hours) |
| `NAMESPACE` | `deerflow` | Kubernetes namespace |
| `DEERFLOW_IMAGE` | `deerflow-user-pod:latest` | User pod image |
| `DEERFLOW_PORT` | `8001` | DeerFlow backend port |
| `DB_PATH` | `/data/users.db` | SQLite database path |

To change the JWT signing key in production, update the `hub-secrets` Secret:

```bash
kubectl create secret generic hub-secrets \
  --from-literal=secret-key='your-strong-random-key' \
  -n deerflow \
  --dry-run=client -o yaml | kubectl apply -f -
```