# DeerFlow User Pod Image

This directory contains the Dockerfile for the per-user DeerFlow backend pod.

## How to build

The Dockerfile **must be built from the `backend/` directory** of the DeerFlow
monorepo so that the DeerFlow source code and its `requirements.txt` are
available as the Docker build context.

Run the following from the root of the DeerFlow repository:

```bash
# Build inside Minikube's Docker daemon (required for local Minikube deployments)
eval $(minikube docker-env)

docker build \
  -t deerflow-user-pod:latest \
  -f multi-user-k8s-local/user-pod/Dockerfile \
  backend/
```

Or use the provided convenience script from the repo root:

```bash
bash multi-user-k8s-local/src/build.sh
```

## What the image does

Each instance of this image runs as a single-user DeerFlow backend. The Hub
provisions one pod per authenticated user and mounts a dedicated
PersistentVolumeClaim at `/app/.deer-flow/` so that user-specific data
(conversation history, uploaded files, config) survives pod restarts.

The pod is started/stopped automatically:
- **Started** on first login via the Hub's `/login` endpoint.
- **Stopped** on `/logout` (PVC is kept, so data is preserved).

## Environment variables injected by the Hub

| Variable              | Description                          |
|-----------------------|--------------------------------------|
| `DEERFLOW_USER_ID`    | Unique user identifier (integer ID)  |
| `DEER_FLOW_CONFIG_PATH` | Path to user config file           |