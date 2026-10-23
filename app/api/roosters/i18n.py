"""Dutch and English texts the server itself has to write: error messages and e-mails.

Everything else (screens, push texts per kind) the app translates from codes."""

LANGS = ("nl", "en")

ERRORS = {
    "auth_required": ("Log opnieuw in.", "Please sign in again."),
    "auth_expired": ("Je sessie is verlopen. Log opnieuw in.", "Your session expired. Please sign in again."),
    "code_invalid": ("Die code klopt niet of is verlopen.", "That code is wrong or has expired."),
    "code_attempts": ("Te veel pogingen. Vraag een nieuwe code aan.", "Too many attempts. Request a new code."),
    "email_invalid": ("Dat lijkt geen geldig e-mailadres.", "That doesn't look like a valid e-mail address."),
    "provider_invalid": ("Aanmelden is niet gelukt. Probeer het opnieuw.", "Signing in didn't work. Please try again."),
    "provider_unavailable": ("Deze manier van aanmelden is nog niet beschikbaar.", "This sign-in method isn't available yet."),
    "rate": ("Even rustig aan, probeer het zo opnieuw.", "Slow down a little and try again in a moment."),
    "invalid": ("Ongeldige invoer.", "Invalid input."),
    "not_found": ("Niet gevonden.", "Not found."),
    "forbidden": ("Dat mag je niet zien.", "You're not allowed to see that."),
    "server": ("Er ging iets mis op de server.", "Something went wrong on the server."),
    "idempotency_busy": ("Dit verzoek wordt nog verwerkt.", "This request is still being processed."),
    "idempotency_mismatch": ("Deze sleutel hoort bij een ander verzoek.", "This key belongs to a different request."),
    "school_unknown": ("Die school bestaat niet (meer).", "That school doesn't exist (anymore)."),
    "campus_unknown": ("Die campus hoort niet bij je school.", "That campus doesn't belong to your school."),
    "class_unknown": ("Die klas bestaat niet bij je school.", "That class doesn't exist at your school."),
    "school_required": ("Kies eerst je school.", "Choose your school first."),
    "source_exists": ("Die klas heb je al toegevoegd.", "You've already added that class."),
    "source_limit": ("Je hebt het maximum aantal roosterbronnen bereikt.", "You've reached the maximum number of timetable sources."),
    "link_invalid": ("Dat lijkt geen geldige agendalink.", "That doesn't look like a valid calendar link."),
    "refresh_cooldown": ("Je rooster werd net vernieuwd. Probeer het zo opnieuw.",
                         "Your timetable was just refreshed. Try again in a moment."),
    "invite_invalid": ("Deze uitnodiging is niet (meer) geldig.", "This invite isn't valid (anymore)."),
    "invite_self": ("Dat is je eigen uitnodiging.", "That's your own invite."),
    "friend_limit": ("Je hebt het maximum aantal vrienden bereikt.", "You've reached the maximum number of friends."),
    "not_friends": ("Jullie zijn (nog) geen vrienden.", "You're not friends (yet)."),
    "blocked": ("Dat gaat niet.", "That's not possible."),
    "request_exists": ("Er staat al een vriendschapsverzoek open.", "There's already an open friend request."),
    "compare_limit": ("Met Premium kan je meer mensen tegelijk vergelijken.", "With Premium you can compare more people at once."),
    "day_invalid": ("Ongeldige dag.", "Invalid day."),
    "verify_required": ("Bevestig eerst je e-mailadres om vrienden toe te voegen.",
                        "Confirm your e-mail address first to add friends."),
    "account_disabled": ("Dit account is uitgeschakeld.", "This account has been turned off."),
}


def lang_of(accept_language: str | None) -> str:
    """Dutch for Dutch speakers and when we don't know, English for everyone else."""
    if not accept_language:
        return "nl"
    first = accept_language.split(",")[0].strip().lower()
    return "nl" if first.startswith("nl") or not first or first == "*" else "en"


def error(code: str, lang: str) -> str:
    pair = ERRORS.get(code) or ERRORS["server"]
    return pair[0] if lang == "nl" else pair[1]


def login_mail(code: str, lang: str) -> tuple[str, str]:
    """(subject, body) of the e-mail with the 6-digit code."""
    spaced = f"{code[:3]} {code[3:]}"
    if lang == "nl":
        return (
            f"Je code voor Roosters+: {spaced}",
            f"Hallo!\n\nJe code om aan te melden bij Roosters+ is:\n\n    {spaced}\n\n"
            "Hij is 10 minuten geldig. Heb je niets aangevraagd? Dan mag je deze mail negeren.\n\n"
            "Groetjes,\nRoosters+\n",
        )
    return (
        f"Your Roosters+ code: {spaced}",
        f"Hi!\n\nYour code to sign in to Roosters+ is:\n\n    {spaced}\n\n"
        "It's valid for 10 minutes. Didn't ask for it? Then you can ignore this e-mail.\n\n"
        "Cheers,\nRoosters+\n",
    )
