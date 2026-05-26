#!/bin/bash
set -e

echo "Pointing Docker CLI to Minikube's Docker daemon..."
eval $(minikube docker-env)

REPO_ROOT=$(git rev-parse --show-toplevel)

echo "Building hub image..."
docker build -t deerflow-hub:latest "$REPO_ROOT/multi-user-k8s-local/hub/"

echo "Building user-pod image..."
docker build \
  -t deerflow-user-pod:latest \
  -f "$REPO_ROOT/multi-user-k8s-local/user-pod/Dockerfile" \
  "$REPO_ROOT/backend/"

echo ""
echo "Done. Both images are available in Minikube's Docker daemon."
echo "  deerflow-hub:latest"
echo "  deerflow-user-pod:latest"