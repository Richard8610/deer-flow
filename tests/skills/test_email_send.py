import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skill_loader import load  # noqa: E402

mail = load("email-send")

ENV = {"SMTP_HOST": "smtp.example.com", "SMTP_USER": "me@example.com", "SMTP_PASSWORD": "s3cret"}


class FakeSMTP:
    instances = []

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.calls, self.sent = host, port, [], []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append(("login", user))

    def send_message(self, msg):
        self.sent.append(msg)


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", FakeSMTP)
    monkeypatch.setattr(mail.smtplib, "SMTP", FakeSMTP)


@pytest.fixture
def deck(tmp_path):
    p = tmp_path / "deck.pptx"
    p.write_bytes(b"PK\x03\x04 not a real deck")
    return p


def run(argv, env=ENV):
    return mail.main(argv, env=env)


def test_recipients_are_split_deduplicated_and_checked():
    assert mail.parse_recipients(["a@b.com, c@d.org;A@B.com", "e@f.cn"]) == ["a@b.com", "c@d.org", "e@f.cn"]
    for bad in ("nope", "a@b", "a@b.com\nbcc:x@y.com", "a b@c.com"):
        with pytest.raises(mail.SendError):
            mail.parse_recipients([bad])
    with pytest.raises(mail.SendError):
        mail.parse_recipients([",".join(f"u{i}@x.com" for i in range(11))])


def test_dry_run_sends_nothing_and_needs_no_credentials(deck, capsys):
    assert run(["--to", "a@b.com", "--subject", "S", "--body", "hi", "--attach", str(deck), "--dry-run"], env={}) == 0
    assert "dry run" in capsys.readouterr().out and FakeSMTP.instances == []


def test_sends_over_ssl_with_the_attachment(deck, capsys):
    assert run(["--to", "a@b.com", "--subject", "S", "--body", "你好", "--attach", str(deck)]) == 0
    smtp = FakeSMTP.instances[0]
    assert (smtp.host, smtp.port) == ("smtp.example.com", 465) and smtp.calls == [("login", "me@example.com")]
    msg = smtp.sent[0]
    assert msg["To"] == "a@b.com" and msg["From"] == "me@example.com"
    parts = list(msg.iter_attachments())
    assert [p.get_filename() for p in parts] == ["deck.pptx"] and parts[0].get_content() == deck.read_bytes()
    assert "s3cret" not in capsys.readouterr().out


def test_uses_starttls_on_another_port(deck):
    assert run(["--to", "a@b.com", "--subject", "S", "--body", "x"], env={**ENV, "SMTP_PORT": "587"}) == 0
    assert FakeSMTP.instances[0].calls == ["starttls", ("login", "me@example.com")]


def test_missing_credentials_are_named_without_values(capsys):
    assert run(["--to", "a@b.com", "--subject", "S", "--body", "x"], env={"SMTP_HOST": "h"}) == 1
    err = capsys.readouterr().err
    assert "SMTP_USER" in err and "SMTP_PASSWORD" in err and FakeSMTP.instances == []


@pytest.mark.parametrize("argv,fragment", [
    (["--subject", "a\nBcc: x@y.com", "--body", "x"], "subject"),
    (["--subject", "S", "--body", "   "], "body is empty"),
    (["--subject", "S", "--body", "x", "--attach", "/nonexistent/file"], "not a file"),
])
def test_refuses_a_bad_message(argv, fragment, capsys):
    assert run(["--to", "a@b.com", *argv]) == 1
    assert fragment in capsys.readouterr().err and FakeSMTP.instances == []


def test_oversize_attachments_are_refused(tmp_path, monkeypatch, capsys):
    big = tmp_path / "big.bin"
    big.write_bytes(b"0" * 100)
    monkeypatch.setattr(mail, "MAX_ATTACH_BYTES", 50)
    assert run(["--to", "a@b.com", "--subject", "S", "--body", "x", "--attach", str(big)]) == 1
    assert "exceed" in capsys.readouterr().err


def test_smtp_failure_exits_non_zero_without_the_password(monkeypatch, capsys):
    def boom(self, *a):
        raise mail.smtplib.SMTPAuthenticationError(535, b"bad login")
    monkeypatch.setattr(FakeSMTP, "login", boom)
    assert run(["--to", "a@b.com", "--subject", "S", "--body", "x"]) == 1
    cap = capsys.readouterr()
    assert "SMTP failed" in cap.err and "s3cret" not in cap.err + cap.out
