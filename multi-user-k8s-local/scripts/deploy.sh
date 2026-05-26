#!/bin/bash
set -e

MANIFEST_DIR="$(dirname "$0")/../k8s"

echo "Applying namespace..."
kubectl apply -f "$MANIFEST_DIR/namespace.yaml"

echo "Applying RBAC..."
kubectl apply -f "$MANIFEST_DIR/rbac.yaml"

echo "Applying Hub deployment (includes Secret + PVC)..."
kubectl apply -f "$MANIFEST_DIR/hub-deployment.yaml"

echo "Applying Hub services..."
kubectl apply -f "$MANIFEST_DIR/hub-service.yaml"

echo "Applying Ingress..."
kubectl apply -f "$MANIFEST_DIR/ingress.yaml"

echo ""
echo "Deployed successfully!"
echo "Check status: kubectl get pods -n deerflow"
echo "Check ingress: kubectl get ingress -n deerflow"