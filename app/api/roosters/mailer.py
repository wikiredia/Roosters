"""Sending e-mail: login codes, the welcome, new-device notices and the goodbye. The texts and the HTML look are in
`mails.py`. Always from a job, never inside a request: a slow mail server must not make the app wait."""
import datetime as dt
import email.message
import functools
import logging
import smtplib
from pathlib import Path

from . import config, jobs, mails

log = logging.getLogger("roosters.mail")

LOGO = Path(__file__).with_name("mail_assets") / "logo.png"


@functools.cache
def _logo() -> bytes:
    return LOGO.read_bytes()


def send(to: str, subject: str, body: str, html: str | None = None):
    """`body` is the plain-text version; with `html` the mail has both, and the logo travels inside it."""
    if config.MAIL_MODE != "smtp":
        log.info("mail to %s: %s\n%s", to, subject, body)
        return
    msg = email.message.EmailMessage()
    msg["From"] = config.MAIL_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")
        msg.get_payload()[1].add_related(_logo(), "image", "png", cid=f"<{mails.LOGO_CID}>", filename="roosters.png")
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as s:
        if config.SMTP_STARTTLS:
            s.starttls()
        if config.SMTP_USER:
            s.login(config.SMTP_USER, config.SMTP_PASSWORD)
        s.send_message(msg)
    log.info("mail '%s' to %s handed to %s:%s", subject, mask_address(to), config.SMTP_HOST, config.SMTP_PORT)


def send_mail(to: str, mail: mails.Mail):
    send(to, mail.subject, mail.text, mail.html)


def mask_address(address: str) -> str:
    """j***@school.be: enough to recognise in a log, without storing addresses there."""
    name, _, domain = address.partition("@")
    return f"{name[:1]}***@{domain}"


@jobs.handler("send_login_code")
def _job_send_code(p: dict):
    mail = mails.login_code(p["code"], p.get("lang") or "nl")
    if config.DEV:
        # Laptop/test server only: sign in even when the mail setup is broken
        log.info("DEV login code for %s: %s", p["email"], p["code"])
    send_mail(p["email"], mail)


@jobs.handler("send_welcome")
def _job_send_welcome(p: dict):
    send_mail(p["email"], mails.welcome(p.get("name"), p.get("lang") or "nl"))


@jobs.handler("send_new_device")
def _job_send_new_device(p: dict):
    when = dt.datetime.fromisoformat(p["at"])
    send_mail(p["email"], mails.new_device(p.get("device"), p.get("platform"), when, p.get("lang") or "nl"))


@jobs.handler("send_account_deleted")
def _job_send_account_deleted(p: dict):
    send_mail(p["email"], mails.account_deleted(p.get("lang") or "nl"))
