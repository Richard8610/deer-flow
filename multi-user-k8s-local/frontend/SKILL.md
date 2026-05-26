# Skill: Architectural Design for Multi-Tenant Environments in Kubernetes

## Overview
Designing and implementing a scalable, multi-user login and execution system using a Hub-and-Spoke architecture on Kubernetes (K8s). This approach decouples user authentication from compute infrastructure, leveraging Python backends and modern frontends to dynamically provision isolated environments and persistent filesystems for end-users.

---

## Core Competencies & Architecture

### 1. Hub-and-Spoke Architecture
* **The Hub (Control Plane):** A Python-based web application (e.g., FastAPI, Flask, or JupyterHub) responsible for user authentication, session tracking, and lifecycle management.
* **The Spokes (Data Plane):** Dynamic, single-user Pods spun up on-demand via the Kubernetes API when a user logs in.

### 2. Dynamic Storage & Filesystem Isolation
* Utilizes **Kubernetes StorageClasses** to automatically provision unique **PersistentVolumeClaims (PVCs)** for individual users upon login.
* Ensures strict data isolation by mounting unique volumes to designated user pods (e.g., mapping a private PVC to `/home/user/data`), preventing cross-tenant data access.

### 3. Full-Stack Orchestration & Workflow
The end-to-end user lifecycle bridges user intent with raw infrastructure:
1. **Authentication:** Secure user registration and login handled via the Python application, returning a JSON Web Token (JWT) to the frontend for secure state preservation.
2. **Asynchronous Spawning:** The frontend triggers an environment generation workflow. The Python backend reads the user identity from the JWT and calls the **Kubernetes SDK** to apply Pod and PVC manifests.
3. **State Polling:** The frontend continuously tracks the cluster container state via status endpoints (`v1.read_namespaced_pod_status`).
4. **Dynamic Ingress Routing:** Upon transitioning to a `Running` state, the frontend redirects the user directly to their isolated container via a custom Ingress gateway rule (e.g., `http://localhost/user/username`).

---

## Technical Implementation Example

### Frontend Integration Loop (`JavaScript`)
```javascript
// Triggering and polling the Kubernetes cluster state from the UI
async function provisionKubernetesEnvironment() {
    const token = localStorage.getItem('token');
    
    // 1. Request backend to build infrastructure
    await fetch('/api/spawn', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
    
    // 2. Poll cluster status until the pod is ready
    const pollInterval = setInterval(async () => {
        const res = await fetch('/api/status', { headers: { 'Authorization': `Bearer ${token}` }});
        const data = await res.json();

        if (data.status === 'Running') {
            clearInterval(pollInterval);
            window.location.href = `http://localhost/user/${username}`; // Redirect to isolated environment
        }
    }, 3000);
}