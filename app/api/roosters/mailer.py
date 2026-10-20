"""Sending e-mail (only login codes for now). Always from a job, never inside a request:
a slow mail server must not make the app wait."""
import email.message
import logging
import smtplib

from . import config, i18n, jobs

log = logging.getLogger("roosters.mail")


def send(to: str, subject: str, body: str):
    if config.MAIL_MODE != "smtp":
        log.info("mail to %s: %s\n%s", to, subject, body)
        return
    msg = email.message.EmailMessage()
    msg["From"] = config.MAIL_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as s:
        if config.SMTP_STARTTLS:
            s.starttls()
        if config.SMTP_USER:
            s.login(config.SMTP_USER, config.SMTP_PASSWORD)
        s.send_message(msg)


@jobs.handler("send_login_code")
def _job_send_code(p: dict):
    subject, text = i18n.login_mail(p["code"], p.get("lang") or "nl")
    send(p["email"], subject, text)
