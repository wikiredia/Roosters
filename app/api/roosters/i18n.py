"""Dutch and English texts the server itself has to write: error messages (the e-mails are in `mails.py`).

Everything else (screens) the app translates from codes. Push texts are in push.py: they're written when the app
isn't running."""

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
    "photo_invalid": ("Die foto kunnen we niet gebruiken. Probeer een andere.", "We can't use that photo. Try another one."),
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
    "skip_day": ("Een les overslaan kan voor vandaag en later.", "You can skip a class today or later."),
    "skip_unknown": ("Die les staat niet (meer) in je rooster.", "That class isn't on your timetable (anymore)."),
    "break_day": ("Pauze vragen kan voor vandaag en de komende twee weken.", "You can ask for today and the next two weeks."),
    "break_time": ("Kies een moment dat nog niet voorbij is (minstens 5 minuten).",
                   "Pick a time that isn't over yet (at least 5 minutes)."),
    "break_people": ("Kies met wie je pauze wil nemen.", "Choose who you want to take a break with."),
    "break_busy_me": ("Je kan dan zelf niet.", "You can't make it yourself then."),
    "break_busy": ("Niet iedereen kan dan.", "Not everyone can make it then."),
    "break_dup": ("Daarover loopt al een vraag.", "There's already a request for that."),
    "break_gone": ("Dit verzoek bestaat niet meer.", "This request doesn't exist anymore."),
    "break_over": ("Deze pauze is al voorbij.", "This break is already over."),
    "access_has": ("Die vriend toont je dat al.", "That friend already shows you that."),
    "access_dup": ("Je vraag staat al open.", "Your request is still open."),
    "chat_gone": ("Dit gesprek bestaat niet (meer) voor jou.", "This chat doesn't exist (anymore) for you."),
    "chat_name": ("Geef je groep een naam.", "Give your group a name."),
    "chat_people": ("Kies wie er in de groep komt.", "Choose who's in the group."),
    "chat_full": ("Er kunnen maximaal 30 mensen in een groep.", "A group can have 30 people at most."),
    "chat_direct": ("Dat kan alleen in een groep.", "That only works in a group."),
    "chat_empty": ("Je bericht is leeg.", "Your message is empty."),
    "chat_long": ("Je bericht is te lang (maximaal 1000 tekens).", "Your message is too long (1000 characters at most)."),
    "chat_message_gone": ("Dit bericht bestaat niet meer.", "This message doesn't exist anymore."),
    "chat_report_own": ("Dit bericht kan je niet melden.", "You can't report this message."),
    "verify_required": ("Bevestig eerst je e-mailadres om vrienden toe te voegen.",
                        "Confirm your e-mail address first to add friends."),
    "push_token": ("Dit toestel kan geen meldingen krijgen.", "This device can't get notifications."),
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
