"""
Password rules — the server-side authority.

Mirrors the BLOCK rules in `src/lib/passwordStrength.ts` (the client also
scores strength for the meter; that part is presentation and lives only there).
A client can always be bypassed, so signup re-checks here.

Returns a readable sentence rather than raising, because the caller must turn
it into an HTTP 400 with a *string* detail: the app's error funnel
(`src/api/auth.ts`) only surfaces `detail` when it's a string, and FastAPI's
own 422 nests an array — which the client would show as a useless
"Something went wrong."
"""

MIN_PASSWORD_LENGTH = 8

# Keep in step with COMMON in src/lib/passwordStrength.ts.
COMMON = {
    "password", "password1", "password123", "passw0rd", "p@ssword", "p@ssw0rd",
    "12345678", "123456789", "1234567890", "123123123", "11111111", "00000000",
    "qwerty", "qwerty123", "qwertyuiop", "asdfghjkl", "1q2w3e4r", "zaq12wsx",
    "iloveyou", "princess", "sunshine", "welcome", "welcome1", "letmein",
    "monkey", "dragon", "football", "baseball", "basketball", "superman",
    "batman", "trustno1", "whatever", "starwars", "computer", "internet",
    "abc12345", "admin123", "administrator", "freedom", "shadow", "master",
    "michael", "jennifer", "jordan23", "hello123", "test1234", "changeme",
    "gymsync", "gymsync123", "workout", "workout123", "fitness", "fitness123",
    "deadlift", "benchpress", "squat123", "training", "strength",
}

_TRAILING = "0123456789!@#$%^&*_.-"


def _normalize(password: str) -> str:
    """Trailing digits are the classic disguise: 'password2024' is 'password'."""
    return password.lower().rstrip(_TRAILING)


def _contains_personal(password: str, email: str | None, display_name: str | None) -> bool:
    lower = password.lower()
    parts: list[str] = []
    if email:
        parts.append(email.split("@")[0].strip().lower())
    if display_name:
        parts.extend(display_name.lower().split())
    return any(len(p) >= 4 and p in lower for p in parts)


def validate_password(
    password: str,
    email: str | None = None,
    display_name: str | None = None,
) -> str | None:
    """None when the password is acceptable, else the reason to show the user."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    if password.lower() in COMMON or _normalize(password) in COMMON:
        return "That password is too common — pick something less guessable."
    if _contains_personal(password, email, display_name):
        return "Avoid your name or email in your password — they're easy to guess."
    return None
