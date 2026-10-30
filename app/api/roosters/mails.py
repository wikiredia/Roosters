"""Every e-mail the server writes, in Dutch and English: one shared look (`_layout`) and one function per mail.

Each function returns a `Mail`: a plain-text version (what spam filters, screen readers and Mailpit's 'Text' tab
show) and an HTML version in the Roosters+ look. Sending is `mailer.py`. The app's own screen texts are in
`mobile/src/i18n/`; the error messages are in `i18n.py`."""
import datetime as dt
from dataclasses import dataclass
from html import escape

from . import config

LOGO_CID = "roosters-logo"

# The brand (mobile/src/global.css): navy, you = blue, friends = pink, together = yellow
NAVY, BLUE, PINK, YELLOW = "#161F2A", "#2E5BFF", "#F0487A", "#FFC21A"
SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


@dataclass
class Mail:
    subject: str
    text: str
    html: str


def _t(lang: str, nl: str, en: str) -> str:
    return nl if lang == "nl" else en


def _p(text: str) -> str:
    return (f'<p class="ink2" style="margin:0 0 16px;font:400 16px/1.6 {SANS};color:#5A574F;">{text}</p>')


def _code_box(code: str) -> str:
    """The 6 digits as big tiles in two groups of three: easy to read out loud and to type."""
    cells = []
    for i, digit in enumerate(code):
        accent = f"border-bottom:3px solid {YELLOW};" if i == 2 else ""
        cells.append(f'<td class="tile" align="center" style="width:46px;height:58px;background:#F4F3EF;'
                     f'border-radius:12px;font:700 32px/58px {SANS};color:{NAVY};{accent}">{digit}</td>')
        if i < len(code) - 1:
            cells.append(f'<td style="width:{14 if i == 2 else 6}px"></td>')
    return (f'<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:8px auto 24px;"><tr>{"".join(cells)}</tr></table>')


def _facts(rows: list[tuple[str, str]]) -> str:
    """A small label/value table (the details of a sign-in)."""
    body = "".join(
        f'<tr><td class="ink3 rule" style="padding:10px 16px 10px 0;font:400 14px/1.4 {SANS};color:#6E6A62;'
        f'border-top:1px solid #E0DCD3;">{escape(k)}</td>'
        f'<td class="ink rule" style="padding:10px 0;font:700 14px/1.4 {SANS};color:{NAVY};border-top:1px solid #E0DCD3;">'
        f'{escape(v)}</td></tr>' for k, v in rows)
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:0 0 20px;">{body}</table>')


def _steps(items: list[tuple[str, str]]) -> str:
    colours = (BLUE, PINK, YELLOW)
    rows = "".join(
        f'<tr><td valign="top" style="padding:0 14px 14px 0;width:30px;">'
        f'<div style="width:30px;height:30px;border-radius:9px;background:{colours[i % 3]};text-align:center;'
        f'font:700 15px/30px {SANS};color:{"#161F2A" if i % 3 else "#FFFFFF"};">{i + 1}</div></td>'
        f'<td class="ink2" valign="top" style="padding:0 0 14px;font:400 16px/1.5 {SANS};color:#5A574F;">'
        f'<strong class="ink" style="color:{NAVY};">{escape(title)}</strong><br>{escape(text)}</td></tr>'
        for i, (title, text) in enumerate(items))
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{rows}</table>'


def _notice(text: str, colour: str = YELLOW) -> str:
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">'
            f'<tr><td class="soft ink2" style="background:#F4F3EF;border-left:4px solid {colour};border-radius:8px;'
            f'padding:14px 16px;font:400 14px/1.55 {SANS};color:#5A574F;">{text}</td></tr></table>')


def _layout(lang: str, preheader: str, eyebrow: str, title: str, body_html: str, footer: str) -> str:
    """The shared frame: navy header with the logo, a colour stripe, a white card, a quiet footer.
    Inline styles and tables because mail apps (Outlook especially) ignore most modern CSS; the few `class`es are
    only for dark mode, where supported. The logo is attached to the mail itself (`cid:`), not loaded from a server."""
    return f"""<!DOCTYPE html>
<html lang="{lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{escape(title)}</title>
<style>
  @media (max-width: 620px) {{
    .card {{ padding: 28px 20px !important; }} .head {{ padding: 20px !important; }} .wrap {{ padding: 12px !important; }}
  }}
  @media (prefers-color-scheme: dark) {{
    body, .page {{ background: #0F161E !important; }}
    .card {{ background: #1E2935 !important; }}
    .ink {{ color: #FFFFFF !important; }}
    .ink2 {{ color: #C9C4B8 !important; }}
    .ink3 {{ color: #A9A599 !important; }}
    .tile, .soft {{ background: #161F2A !important; }}
    .tile {{ color: #FFFFFF !important; }}
    .muted {{ color: #8A857B !important; }}
    .rule {{ border-color: #33414F !important; }}
    .brand {{ color: #7B9BFF !important; }}
  }}
</style>
</head>
<body class="page" style="margin:0;padding:0;background:#F4F3EF;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:#F4F3EF;">{escape(preheader)}
&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F3EF;">
<tr><td class="wrap" align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td class="head" style="background:{NAVY};border-radius:20px 20px 0 0;padding:24px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle"><img src="cid:{LOGO_CID}" width="48" height="48" alt="Roosters+"
            style="display:block;border:0;border-radius:12px;"></td>
        <td valign="middle" style="padding-left:12px;font:800 22px/1 {SANS};letter-spacing:-0.3px;color:#FFFFFF;">
            Roosters<span style="color:{YELLOW};">+</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="font-size:0;line-height:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="50%" height="5" style="background:{BLUE};height:5px;line-height:5px;font-size:5px;">&nbsp;</td>
        <td width="25%" height="5" style="background:{PINK};height:5px;line-height:5px;font-size:5px;">&nbsp;</td>
        <td width="25%" height="5" style="background:{YELLOW};height:5px;line-height:5px;font-size:5px;">&nbsp;</td>
      </tr></table>
    </td></tr>
    <tr><td class="card" style="background:#FFFFFF;border-radius:0 0 20px 20px;padding:36px 40px 32px;">
      <p style="margin:0 0 8px;font:700 12px/1 {SANS};letter-spacing:1.4px;text-transform:uppercase;color:{PINK};">{escape(eyebrow)}</p>
      <h1 class="ink" style="margin:0 0 16px;font:800 26px/1.2 {SANS};letter-spacing:-0.4px;color:{NAVY};">{escape(title)}</h1>
      {body_html}
    </td></tr>
    <tr><td align="center" class="muted" style="padding:24px 16px 0;font:400 13px/1.6 {SANS};color:#6E6A62;">
      {footer}<br>
      <span class="brand" style="color:{BLUE};font-weight:700;">Roosters+</span> &middot; {_t(lang, "Je rooster, en wanneer je vrienden vrij zijn.", "Your timetable, and when your friends are free.")}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
"""


def _text(lang: str, *parts: str) -> str:
    sign = _t(lang, "Groetjes,\nRoosters+", "Cheers,\nRoosters+")
    return "\n\n".join(parts) + f"\n\n{sign}\n"


def login_code(code: str, lang: str) -> Mail:
    """The 6-digit sign-in code, spaced as `123 456` in the subject and the text (easier to read and type).
    The tests and the dev tools read the code from the text version."""
    spaced = f"{code[:3]} {code[3:]}"
    minutes = config.LOGIN_CODE_TTL // 60
    ignore = _t(lang, "Heb je dit niet aangevraagd? Dan hoef je niets te doen: zonder deze code kan niemand inloggen.",
                "Didn't ask for this? You don't have to do anything: nobody can sign in without this code.")
    valid = _t(lang, f"De code is {minutes} minuten geldig en werkt maar één keer.",
               f"The code is valid for {minutes} minutes and works only once.")
    html = _layout(
        lang, _t(lang, f"Je code is {spaced}. Hij is {minutes} minuten geldig.", f"Your code is {spaced}. It's valid for {minutes} minutes."),
        _t(lang, "Aanmelden", "Sign in"), _t(lang, "Je aanmeldcode", "Your sign-in code"),
        _p(_t(lang, "Vul deze code in de app in om aan te melden bij Roosters+:", "Enter this code in the app to sign in to Roosters+:"))
        + _code_box(code) + _p(valid) + _notice(ignore),
        _t(lang, "Deze mail is verstuurd omdat iemand dit e-mailadres wilde gebruiken om aan te melden.",
           "You got this e-mail because someone tried to sign in with this address."))
    return Mail(
        _t(lang, f"Je code voor Roosters+: {spaced}", f"Your Roosters+ code: {spaced}"),
        _text(lang, _t(lang, "Hallo!", "Hi!"),
              _t(lang, "Je code om aan te melden bij Roosters+ is:", "Your code to sign in to Roosters+ is:") + f"\n\n    {spaced}",
              f"{valid} {ignore}"),
        html)


def welcome(name: str | None, lang: str) -> Mail:
    """Sent once, when an account gets a verified e-mail address (a new account, or a guest who signed in)."""
    hi = _t(lang, f"Welkom, {name}!", f"Welcome, {name}!") if name else _t(lang, "Welkom!", "Welcome!")
    steps = [
        (_t(lang, "Kies je school en klas", "Pick your school and class"),
         _t(lang, "Je rooster komt rechtstreeks van school, en blijft vanzelf up-to-date.",
            "Your timetable comes straight from school and stays up to date by itself.")),
        (_t(lang, "Voeg vrienden toe", "Add your friends"),
         _t(lang, "Deel je uitnodigingslink of zoek klasgenoten. Zij zien alleen wat jij toelaat.",
            "Share your invite link or find classmates. They only see what you allow.")),
        (_t(lang, "Plan samen een pauze", "Plan a break together"),
         _t(lang, "Zie wanneer jullie allebei vrij zijn en stuur met één tik een pauzeverzoek.",
            "See when you're both free and send a break request with one tap.")),
    ]
    intro = _t(lang, "Leuk dat je erbij bent. Roosters+ toont je rooster en wanneer je vrienden vrij zijn, zodat jullie samen een pauze kunnen nemen.",
               "Great to have you. Roosters+ shows your timetable and when your friends are free, so you can take a break together.")
    privacy = _t(lang, "Jouw gegevens blijven van jou: vrienden zien alleen wat jij toelaat, en je kan je account elk moment volledig verwijderen in de app.",
                 "Your data stays yours: friends only see what you allow, and you can delete your account completely in the app at any time.")
    html = _layout(
        lang, intro, _t(lang, "Welkom", "Welcome"), hi, _p(intro) + _steps(steps) + _notice(privacy, BLUE),
        _t(lang, "Je krijgt deze mail eenmalig, omdat je een account op Roosters+ hebt gemaakt.",
           "You get this e-mail once, because you created a Roosters+ account."))
    text = _text(lang, hi, intro,
                 "\n".join(f"{i + 1}. {t}: {d}" for i, (t, d) in enumerate(steps)), privacy)
    return Mail(_t(lang, "Welkom bij Roosters+", "Welcome to Roosters+"), text, html)


def new_device(device: str | None, platform: str | None, when: dt.datetime, lang: str) -> Mail:
    """Security notice: someone signed in to this account on a phone it hasn't been used on before.
    `when` is naive UTC (as the database stores it). The device name is typed by the phone: always escaped."""
    local = when.replace(tzinfo=dt.timezone.utc).astimezone(config.TZ)
    stamp = local.strftime("%d/%m/%Y %H:%M") + f" ({local.tzname()})"
    shown = device or _t(lang, "Onbekend toestel", "Unknown device")
    platforms = {"ios": "iPhone / iPad", "android": "Android", "web": "Web"}
    plat = platforms.get(platform or "", _t(lang, "Onbekend", "Unknown"))
    intro = _t(lang, "Er is net aangemeld bij je Roosters+-account op een toestel dat we nog niet kenden.",
               "Someone just signed in to your Roosters+ account on a device we hadn't seen before.")
    action = _t(lang, "Was jij dit niet? Open Roosters+ → Instellingen → Overal uitloggen. Daarmee eindigen alle sessies meteen.",
                "Wasn't you? Open Roosters+ → Settings → Log out everywhere. That ends every session right away.")
    rows = [(_t(lang, "Toestel", "Device"), shown), (_t(lang, "Platform", "Platform"), plat),
            (_t(lang, "Wanneer", "When"), stamp)]
    html = _layout(
        lang, intro, _t(lang, "Beveiliging", "Security"), _t(lang, "Nieuwe aanmelding", "New sign-in"),
        _p(intro) + _facts(rows) + _notice(escape(action), PINK),
        _t(lang, "We sturen dit bericht als er op een nieuw toestel wordt aangemeld.",
           "We send this message when a new device signs in."))
    text = _text(lang, intro, "\n".join(f"{k}: {v}" for k, v in rows), action)
    return Mail(_t(lang, "Nieuwe aanmelding bij Roosters+", "New sign-in to Roosters+"), text, html)


def account_deleted(lang: str) -> Mail:
    """Confirmation after the account was deleted (it's gone for real: this mail is all that's left)."""
    intro = _t(lang, "Je Roosters+-account is verwijderd, samen met je rooster, vrienden, berichten en aangemelde toestellen.",
               "Your Roosters+ account has been deleted, together with your timetable, friends, messages and signed-in devices.")
    after = _t(lang, "We bewaren niets meer van je. Wil je later terugkomen? Maak dan gewoon een nieuw account.",
               "We don't keep anything about you. Want to come back later? Just make a new account.")
    notyou = _t(lang, "Heb jij dit niet gedaan? Dan had iemand anders toegang tot je account. Het kan niet worden hersteld; controleer de beveiliging van je e-mailaccount.",
                "Wasn't you? Then someone else had access to your account. It can't be restored; check the security of your e-mail account.")
    html = _layout(
        lang, intro, _t(lang, "Tot ziens", "Goodbye"), _t(lang, "Je account is verwijderd", "Your account is deleted"),
        _p(intro) + _p(after) + _notice(escape(notyou), PINK),
        _t(lang, "Dit is de laatste mail die we je sturen.", "This is the last e-mail we'll send you."))
    return Mail(_t(lang, "Je Roosters+-account is verwijderd", "Your Roosters+ account is deleted"),
                _text(lang, intro, after, notyou), html)


def mail_check(lang: str = "en") -> Mail:
    """For `cli test-mail` and the debug endpoint: also shows how the look comes out in the reader's mail app."""
    msg = _t(lang, "Als je dit leest, werkt de mailinstelling.", "If you read this, the mail setup works.")
    html = _layout(lang, msg, "Test", _t(lang, "Testmail", "Test mail"), _p(msg), "Roosters+ test")
    return Mail("Roosters+ test mail", _text(lang, msg), html)
