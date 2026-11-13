"""Send one email, with optional attachments, over SMTP. Credentials come from the environment only.

Usage: python generate.py --to a@b.com --subject S --body-file body.txt [--attach deck.pptx] [--dry-run]
Environment: SMTP_HOST, SMTP_USER, SMTP_PASSWORD (required to send); SMTP_PORT, SMTP_SECURITY (ssl|starttls, default ssl
on 465 and starttls otherwise), SMTP_FROM (default SMTP_USER). --dry-run needs none of them.
Exits non-zero with the reason on stderr; prints one result line on stdout. The password is never printed.
"""
import argparse
import mimetypes
import os
import re
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

MAX_RECIPIENTS = 10
MAX_ATTACH_BYTES = 20 * 1024 * 1024
ADDRESS = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$")
TIMEOUT = 30


class SendError(Exception):
    pass


def parse_recipients(values):
    """Accept repeated --to and comma or semicolon separated lists; return unique valid addresses in order."""
    found = []
    for value in values:
        for part in re.split(r"[;,]", value):
            part = part.strip()
            if not part:
                continue
            if not ADDRESS.match(part):
                raise SendError(f"not an email address: {part!r}")
            if part.lower() not in [f.lower() for f in found]:
                found.append(part)
    if not found:
        raise SendError("at least one recipient is required")
    if len(found) > MAX_RECIPIENTS:
        raise SendError(f"{len(found)} recipients; the limit is {MAX_RECIPIENTS}")
    return found


def build_message(sender, recipients, subject, body, attachments):
    if not subject.strip() or "\r" in subject or "\n" in subject:
        raise SendError("the subject must be one non-empty line")
    if not body.strip():
        raise SendError("the body is empty")
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject.strip()
    msg.set_content(body)
    total = 0
    for raw in attachments:
        path = Path(raw)
        if not path.is_file():
            raise SendError(f"attachment is not a file: {raw}")
        data = path.read_bytes()
        total += len(data)
        if total > MAX_ATTACH_BYTES:
            raise SendError(f"attachments exceed {MAX_ATTACH_BYTES // (1024 * 1024)} MB")
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        main, sub = ctype.split("/", 1)
        msg.add_attachment(data, maintype=main, subtype=sub, filename=path.name)
    return msg


def smtp_settings(env):
    missing = [k for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD") if not env.get(k)]
    if missing:
        raise SendError(f"set {', '.join(missing)} in the environment to send")
    try:
        port = int(env.get("SMTP_PORT") or 465)
    except ValueError:
        raise SendError("SMTP_PORT must be a number") from None
    security = (env.get("SMTP_SECURITY") or ("ssl" if port == 465 else "starttls")).lower()
    if security not in ("ssl", "starttls"):
        raise SendError("SMTP_SECURITY must be ssl or starttls")
    return env["SMTP_HOST"], port, security, env["SMTP_USER"], env["SMTP_PASSWORD"], env.get("SMTP_FROM") or env["SMTP_USER"]


def send(msg, host, port, security, user, password):
    context = ssl.create_default_context()
    try:
        if security == "ssl":
            with smtplib.SMTP_SSL(host, port, timeout=TIMEOUT, context=context) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=TIMEOUT) as smtp:
                smtp.starttls(context=context)
                smtp.login(user, password)
                smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        raise SendError(f"SMTP failed: {type(exc).__name__}: {exc}") from None


def main(argv=None, env=None):
    env = os.environ if env is None else env
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--to", action="append", required=True, help="recipient; repeat or separate with commas")
    ap.add_argument("--subject", required=True)
    body = ap.add_mutually_exclusive_group(required=True)
    body.add_argument("--body")
    body.add_argument("--body-file")
    ap.add_argument("--attach", action="append", default=[])
    ap.add_argument("--dry-run", action="store_true", help="build and check the message, send nothing")
    args = ap.parse_args(argv)
    try:
        text = Path(args.body_file).read_text(encoding="utf-8-sig") if args.body_file else args.body
        recipients = parse_recipients(args.to)
        sender = env.get("SMTP_FROM") or env.get("SMTP_USER") or "sender@example.invalid"
        msg = build_message(sender, recipients, args.subject, text, args.attach)
        names = ", ".join(Path(a).name for a in args.attach) or "none"
        if args.dry_run:
            print(f"dry run: would send {args.subject.strip()!r} to {', '.join(recipients)}; attachments: {names}")
            return 0
        host, port, security, user, password, sender = smtp_settings(env)
        del msg["From"]
        msg["From"] = sender
        send(msg, host, port, security, user, password)
    except (OSError, SendError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"sent {args.subject.strip()!r} to {', '.join(recipients)}; attachments: {names}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
