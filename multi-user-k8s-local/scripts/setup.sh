#!/bin/bash
set -e

echo "Starting minikube..."
minikube start --driver=docker --cpus=4 --memory=6g

echo "Enabling ingress addon..."
minikube addons enable ingress

echo "Enabling storage-provisioner addon..."
minikube addons enable storage-provisioner

MINIKUBE_IP=$(minikube ip)
echo ""
echo "--------------------------------------------------------------"
echo "Setup complete!"
echo ""
echo "Add the following line to /etc/hosts (requires sudo):"
echo "  ${MINIKUBE_IP} deerflow.local"
echo ""
echo "Run 'minikube tunnel' in a SEPARATE terminal for Ingress access."
echo "--------------------------------------------------------------"