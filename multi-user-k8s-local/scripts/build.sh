#!/bin/bash
set -e

echo "Pointing Docker CLI to Minikube's Docker daemon..."
eval $(minikube docker-env)

REPO_ROOT=$(git rev-parse --show-toplevel)

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