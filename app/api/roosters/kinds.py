"""What kind of lesson something is: theory, lab, exercises, ... (the colour in the app).

Untis has no field for it. Schools write it in the period's free text (`lessonText`, at AP: "Theorie",
"Labo", "Labo - Minor Robotics", "oefeningen", "workshop: ...", "stage", "WPL extern", "Groepsleren",
"Infosessie ..."), in the subject ("Lab algemene chemie 1 (PR)", "IO-..._PR", "Monitoraat 1CH",
"Werkplekleren 3") or in the period's flags (`is.exam`, `is.event`). We look at all of them, in that
order, and keep only the result: the free text itself is never stored (data minimisation).
Researched on real AP timetables (Oct 2026); tested in tests/test_kinds.py."""
import re
import unicodedata

KINDS = ("theory", "lab", "exercises", "project", "support", "internship", "info", "exam", "other")

# Order matters: the first match wins ("Labo - Minor Start-Up" is a lab, "Theorie - Minor Maker" theory)
_RULES: list[tuple[str, re.Pattern]] = [(k, re.compile(p, re.I)) for k, p in (
    ("exam", r"\b(examen|exam|toets|test(moment)?|tussentijdse? (test|toets)|evaluatie)\b"),
    ("lab", r"\b(labo'?s?|lab|labs|practic(um|a)|wpo|skillslab|simulatie)\b|_pr\b|\(pr\)"),
    ("theory", r"\b(theorie|theory|hoorcollege|hc|lecture|les theorie)\b"),
    ("exercises", r"\b(oefen\w*|werkcollege|wc|exercises?|tutorial|seminarie)\b"),
    ("internship", r"\b(\w*stage|wpl|werkplek\w*|internship|praktijk\w*)\b"),
    ("project", r"\b(workshop\w*|project\w*|casus|groepsleren|teamwork|hackathon|bootcamp|atelier|studio|xl)\b"),
    ("support", r"\b(monitoraat|coach\w*|begeleiding|feedback|peter-?meter\w*|tutoraat|remediering|vragenuur)\b"),
    ("info", r"\b(info(sessies?|moment(en)?|avond|dag|markt)?|lezing|gastcollege|gastles|uitstap|excursie)\b"),
)]


def _plain(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def classify(*texts: str | None, exam: bool = False, event: bool = False) -> str:
    """The kind of a lesson from its texts, most telling first (free text, subject long and short name)."""
    if exam:
        return "exam"
    for text in texts:
        if not text:
            continue
        t = _plain(text)
        for kind, rx in _RULES:
            if rx.search(t):
                return kind
    return "info" if event else "other"
