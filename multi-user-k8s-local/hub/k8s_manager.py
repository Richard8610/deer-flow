"""
Kubernetes manager for DeerFlow hub.

Manages per-user DeerFlow pods, PersistentVolumeClaims, and Services using
the official Kubernetes Python SDK. Tries in-cluster config first, falls back
to local kubeconfig for development.
"""

import logging
import re

from kubernetes import client, config as k8s_config
from kubernetes.client.rest import ApiException

from config import settings

logger = logging.getLogger(__name__)


def _load_kube_config() -> None:
    """Load Kubernetes config: in-cluster first, then local kubeconfig."""
    try:
        k8s_config.load_incluster_config()
        # SDK v36 bug: load_incluster_config stores token under 'authorization' key
        # (as "bearer <jwt>") but auth_settings() only checks for 'BearerToken'.
        # Fix: move the raw JWT to 'BearerToken' with 'Bearer' prefix.
        cfg = client.Configuration.get_default_copy()
        if "authorization" in cfg.api_key and "BearerToken" not in cfg.api_key:
            raw = cfg.api_key.pop("authorization")
            # Strip any existing "bearer " prefix from the stored value
            jwt = raw.split(" ", 1)[-1] if " " in raw else raw
            cfg.api_key["BearerToken"] = jwt
            cfg.api_key_prefix["BearerToken"] = "Bearer"
            client.Configuration.set_default(cfg)
        logger.info("Loaded in-cluster Kubernetes config.")
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()
        logger.info("Loaded local kubeconfig.")


# Load once at import time
_load_kube_config()


def _sanitize_user_id(user_id: str) -> str:
    """
    Produce a Kubernetes-safe name component from a user_id:
    lowercase, replace all non-alphanumeric chars with '-', strip leading/trailing dashes.
    """
    sanitized = re.sub(r"[^a-z0-9]+", "-", user_id.lower()).strip("-")
    # Kubernetes name max length is 63 for labels; truncate to be safe
    return sanitized[:50]


def _pod_name(user_id: str) -> str:
    return f"deerflow-{_sanitize_user_id(user_id)}"


def _pvc_name(user_id: str) -> str:
    return f"deerflow-data-{_sanitize_user_id(user_id)}"


def _svc_name(user_id: str) -> str:
    return f"deerflow-{_sanitize_user_id(user_id)}"


def _svc_dns(user_id: str) -> str:
    return (
        f"http://{_svc_name(user_id)}.{settings.namespace}.svc.cluster.local"
        f":{settings.deerflow_port}"
    )


# ---------------------------------------------------------------------------
# PVC
# ---------------------------------------------------------------------------


def _ensure_pvc(core_v1: client.CoreV1Api, user_id: str) -> None:
    pvc_name = _pvc_name(user_id)
    try:
        core_v1.read_namespaced_persistent_volume_claim(pvc_name, settings.namespace)
        logger.debug("PVC %s already exists.", pvc_name)
        return
    except ApiException as exc:
        if exc.status != 404:
            raise

    pvc = client.V1PersistentVolumeClaim(
        metadata=client.V1ObjectMeta(
            name=pvc_name,
            namespace=settings.namespace,
            labels={"app": "deerflow-user", "user-id": _sanitize_user_id(user_id)},
        ),
        spec=client.V1PersistentVolumeClaimSpec(
            access_modes=["ReadWriteOnce"],
            resources=client.V1ResourceRequirements(requests={"storage": "1Gi"}),
            storage_class_name="standard",
        ),
    )
    core_v1.create_namespaced_persistent_volume_claim(settings.namespace, pvc)
    logger.info("Created PVC %s.", pvc_name)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


def _ensure_service(core_v1: client.CoreV1Api, user_id: str) -> None:
    svc_name = _svc_name(user_id)
    safe_id = _sanitize_user_id(user_id)
    try:
        core_v1.read_namespaced_service(svc_name, settings.namespace)
        logger.debug("Service %s already exists.", svc_name)
        return
    except ApiException as exc:
        if exc.status != 404:
            raise

    svc = client.V1Service(
        metadata=client.V1ObjectMeta(
            name=svc_name,
            namespace=settings.namespace,
            labels={"app": "deerflow-user", "user-id": safe_id},
        ),
        spec=client.V1ServiceSpec(
            selector={"app": "deerflow-user", "user-id": safe_id},
            ports=[
                client.V1ServicePort(
                    port=settings.deerflow_port,
                    target_port=settings.deerflow_port,
                    name="http",
                )
            ],
            type="ClusterIP",
        ),
    )
    core_v1.create_namespaced_service(settings.namespace, svc)
    logger.info("Created Service %s.", svc_name)


# ---------------------------------------------------------------------------
# Pod
# ---------------------------------------------------------------------------


def _ensure_pod(core_v1: client.CoreV1Api, user_id: str) -> None:
    pod_name = _pod_name(user_id)
    safe_id = _sanitize_user_id(user_id)
    try:
        core_v1.read_namespaced_pod(pod_name, settings.namespace)
        logger.debug("Pod %s already exists.", pod_name)
        return
    except ApiException as exc:
        if exc.status != 404:
            raise

    pod = client.V1Pod(
        metadata=client.V1ObjectMeta(
            name=pod_name,
            namespace=settings.namespace,
            labels={"app": "deerflow-user", "user-id": safe_id},
        ),
        spec=client.V1PodSpec(
            service_account_name="hub",
            restart_policy="Always",
            containers=[
                client.V1Container(
                    name="deerflow",
                    image=settings.deerflow_image,
                    image_pull_policy="Never",
                    ports=[
                        client.V1ContainerPort(container_port=settings.deerflow_port)
                    ],
                    env=[
                        client.V1EnvVar(name="DEERFLOW_USER_ID", value=user_id),
                        client.V1EnvVar(
                            name="DEER_FLOW_CONFIG_PATH",
                            value="/app/config.yaml",
                        ),
                    ],
                    resources=client.V1ResourceRequirements(
                        requests={"cpu": "250m", "memory": "512Mi"},
                        limits={"cpu": "1", "memory": "1Gi"},
                    ),
                    volume_mounts=[
                        client.V1VolumeMount(
                            name="user-data",
                            mount_path="/app/.deer-flow",
                        ),
                        client.V1VolumeMount(
                            name="deerflow-config",
                            mount_path="/app/config.yaml",
                            sub_path="config.yaml",
                            read_only=True,
                        ),
                    ],
                )
            ],
            volumes=[
                client.V1Volume(
                    name="user-data",
                    persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                        claim_name=_pvc_name(user_id)
                    ),
                ),
                client.V1Volume(
                    name="deerflow-config",
                    config_map=client.V1ConfigMapVolumeSource(
                        name="deerflow-user-config",
                    ),
                ),
            ],
        ),
    )
    core_v1.create_namespaced_pod(settings.namespace, pod)
    logger.info("Created Pod %s.", pod_name)


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------


async def ensure_user_pod(user_id: str) -> str:
    """
    Ensure a DeerFlow Pod, PVC, and Service exist for the given user_id.
    Returns the cluster-internal service DNS URL.
    """
    core_v1 = client.CoreV1Api()
    _ensure_pvc(core_v1, user_id)
    _ensure_service(core_v1, user_id)
    _ensure_pod(core_v1, user_id)
    return _svc_dns(user_id)


async def get_user_pod_url(user_id: str) -> str | None:
    """
    Return the cluster-internal HTTP URL for the user's pod if it is Running,
    or None otherwise.
    """
    core_v1 = client.CoreV1Api()
    pod_name = _pod_name(user_id)
    try:
        pod = core_v1.read_namespaced_pod(pod_name, settings.namespace)
    except ApiException as exc:
        if exc.status == 404:
            return None
        raise

    phase = pod.status.phase if pod.status else None
    if phase == "Running":
        return _svc_dns(user_id)
    return None


async def delete_user_pod(user_id: str) -> None:
    """
    Delete the user's Pod and Service but keep the PVC so user data is preserved.
    Silently ignores 404 errors (already deleted).
    """
    core_v1 = client.CoreV1Api()

    # Delete pod
    try:
        core_v1.delete_namespaced_pod(
            _pod_name(user_id),
            settings.namespace,
            body=client.V1DeleteOptions(grace_period_seconds=0),
        )
        logger.info("Deleted Pod %s.", _pod_name(user_id))
    except ApiException as exc:
        if exc.status != 404:
            raise

    # Delete service
    try:
        core_v1.delete_namespaced_service(_svc_name(user_id), settings.namespace)
        logger.info("Deleted Service %s.", _svc_name(user_id))
    except ApiException as exc:
        if exc.status != 404:
            raise