"""Notification delivery for the AI News Daily workflow.

Supports Telegram bot messages, generic webhook POST, and local file output.

Public API
----------
send(message, method, config) -> bool
    Deliver *message* via the given *method* using credentials from *config*.
    Returns True on success, False on failure.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime

logger = logging.getLogger(__name__)

_SUPPORTED_METHODS = ("telegram", "webhook", "file")


class Notifier:
    """Send a digest message via Telegram, webhook, or local file."""

    # ── Internal delivery methods ─────────────────────────────────────────

    def _send_telegram(self, message: str, config: dict) -> bool:
        """POST *message* to a Telegram bot chat."""
        bot_token = config.get("bot_token") or os.environ.get("TELEGRAM_BOT_TOKEN", "")
        chat_id = config.get("chat_id") or os.environ.get("TELEGRAM_CHAT_ID", "")

        if not bot_token or not chat_id:
            logger.error(
                "Telegram credentials missing.  Set bot_token/chat_id in the config dict "
                "or TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars."
            )
            return False

        import requests  # type: ignore[import]

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown",
        }
        try:
            response = requests.post(url, data=payload, timeout=30)
            if response.status_code == 200:
                logger.info("Telegram message delivered successfully")
                return True
            logger.error("Telegram API returned %d: %s", response.status_code, response.text[:200])
            return False
        except Exception:
            logger.exception("Telegram send error")
            return False

    def _send_webhook(self, message: str, config: dict) -> bool:
        """POST *message* as JSON to a custom webhook URL."""
        webhook_url = config.get("webhook_url") or os.environ.get("WEBHOOK_URL", "")

        if not webhook_url:
            logger.error(
                "Webhook URL missing.  Set webhook_url in the config dict "
                "or the WEBHOOK_URL env var."
            )
            return False

        import requests  # type: ignore[import]

        payload = {
            "text": message,
            "timestamp": datetime.now().isoformat(),
        }
        try:
            response = requests.post(webhook_url, json=payload, timeout=30)
            if 200 <= response.status_code < 300:
                logger.info("Webhook delivered (HTTP %d)", response.status_code)
                return True
            logger.error("Webhook returned %d: %s", response.status_code, response.text[:200])
            return False
        except Exception:
            logger.exception("Webhook send error")
            return False

    def _send_file(self, message: str, config: dict) -> bool:
        """Write *message* to a local file (stdout fallback when no path given)."""
        from pathlib import Path

        output_path: str | None = config.get("output_path")
        if output_path:
            try:
                path = Path(output_path)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(message, encoding="utf-8")
                logger.info("Digest written to %s", path)
                return True
            except Exception:
                logger.exception("Failed to write digest to file")
                return False
        else:
            # No path configured — print to stdout so the caller can see it.
            print(message)
            return True

    # ── Public API ────────────────────────────────────────────────────────

    def send(self, message: str, method: str = "file", config: dict | None = None) -> bool:
        """Deliver *message* via *method*.

        Parameters
        ----------
        message:
            The digest text to deliver.
        method:
            One of ``"telegram"``, ``"webhook"``, or ``"file"``.
        config:
            Credential / endpoint dict.  Keys used per method:

            - **telegram**: ``bot_token``, ``chat_id``
              (fallback env vars: ``TELEGRAM_BOT_TOKEN``, ``TELEGRAM_CHAT_ID``)
            - **webhook**: ``webhook_url``
              (fallback env var: ``WEBHOOK_URL``)
            - **file**: ``output_path`` (optional; prints to stdout when absent)

        Returns
        -------
        True on success, False on any failure.
        """
        cfg = config or {}

        if method == "telegram":
            return self._send_telegram(message, cfg)
        elif method == "webhook":
            return self._send_webhook(message, cfg)
        elif method == "file":
            return self._send_file(message, cfg)
        else:
            logger.error("Unknown notification method %r.  Choose from: %s", method, _SUPPORTED_METHODS)
            return False