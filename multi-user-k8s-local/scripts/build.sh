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

# Snapshot skills/ into the Docker build context (only SKILL.md files needed)
echo "Snapshotting skills/..."
rm -rf "$REPO_ROOT/multi-user-k8s-local/skills_snapshot"
for sub in public custom; do
  src="$REPO_ROOT/skills/$sub"
  [ -d "$sub" ] || [ -d "$src" ] || continue
  find "$src" -name "SKILL.md" | while read -r md; do
    skill_dir=$(dirname "$md")
    rel="${skill_dir#$REPO_ROOT/skills/}"
    dest="$REPO_ROOT/multi-user-k8s-local/skills_snapshot/$rel"
    mkdir -p "$dest"
    cp "$md" "$dest/SKILL.md"
  done
done

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