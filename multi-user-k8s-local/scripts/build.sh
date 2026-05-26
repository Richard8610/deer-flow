#!/bin/bash
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)

echo "Building workflow frontend (React/Vite)..."
cd "$REPO_ROOT/workflow_frontend"
npm install --silent
npm run build
# Copy dist into the Docker build context for the hub image
rm -rf "$REPO_ROOT/multi-user-k8s-local/workflow_frontend_dist"
cp -r dist/ "$REPO_ROOT/multi-user-k8s-local/workflow_frontend_dist"
cd "$REPO_ROOT"

echo "Pointing Docker CLI to Minikube's Docker daemon..."
eval $(minikube docker-env)

echo "Building hub image (context: multi-user-k8s-local/)..."
docker build -t deerflow-hub:latest \
  -f "$REPO_ROOT/multi-user-k8s-local/hub/Dockerfile" \
  "$REPO_ROOT/multi-user-k8s-local/"

echo "Building user-pod image (using backend/Dockerfile --target dev)..."
docker build \
  -t deerflow-user-pod:latest \
  --target dev \
  -f "$REPO_ROOT/backend/Dockerfile" \
  "$REPO_ROOT"

echo ""
echo "Done. Both images are available in Minikube's Docker daemon."
echo "  deerflow-hub:latest"
echo "  deerflow-user-pod:latest"