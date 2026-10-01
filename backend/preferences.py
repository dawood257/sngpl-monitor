"""
User Preferences Module
Phase 6 — Language + Theme + Layout preferences per user
Follows users.py pattern: global DB_PATH, init() on startup, sqlite3.
"""
import sqlite3
import time
from typing import Optional


DB_PATH = None


# ═══════════════════════════════════════════════════════
#  Validation whitelists
# ═══════════════════════════════════════════════════════
VALID_LANGUAGES = ["en-US", "ur-PK", "es-ES"]
VALID_THEMES    = ["default", "clean", "compact", "dark", "high-contrast"]
VALID_LAYOUTS   = ["comfortable", "compact", "wide"]

DEFAULT_PREFS = {
    "language": "en-US",
    "theme":    "default",
    "layout":   "comfortable",
}


# ═══════════════════════════════════════════════════════
#  Init (called on app startup, like users.init)
# ═══════════════════════════════════════════════════════
def init(db_path):
    """Create tables and backfill preferences for existing users."""
    global DB_PATH
    DB_PATH = db_path
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()

    # Preferences per user
    c.execute("""CREATE TABLE IF NOT EXISTS user_preferences (
        user_id     INTEGER PRIMARY KEY,
        language    TEXT NOT NULL DEFAULT 'en-US',
        theme       TEXT NOT NULL DEFAULT 'default',
        layout      TEXT NOT NULL DEFAULT 'comfortable',
        updated_at  INTEGER NOT NULL DEFAULT 0
    )""")

    # Audit trail
    c.execute("""CREATE TABLE IF NOT EXISTS preferences_audit (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL,
        changed_key TEXT NOT NULL,
        old_value   TEXT,
        new_value   TEXT,
        changed_at  INTEGER NOT NULL,
        source      TEXT
    )""")

    # Backfill for existing users (idempotent)
    now = int(time.time())
    c.execute("""
        INSERT OR IGNORE INTO user_preferences (user_id, updated_at)
        SELECT id, ? FROM users
    """, (now,))

    con.commit()
    con.close()
    print(f"[preferences.init] Tables ready, users backfilled")


# ═══════════════════════════════════════════════════════
#  Read
# ═══════════════════════════════════════════════════════
def get_preferences(user_id: int) -> dict:
    """Get preferences for a user. Creates defaults if missing."""
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    c = con.cursor()
    row = c.execute(
        "SELECT language, theme, layout, updated_at FROM user_preferences WHERE user_id=?",
        (user_id,)
    ).fetchone()

    if not row:
        # Auto-create on first access
        now = int(time.time())
        c.execute(
            "INSERT INTO user_preferences (user_id, updated_at) VALUES (?, ?)",
            (user_id, now)
        )
        con.commit()
        con.close()
        return {**DEFAULT_PREFS, "updated_at": now}

    result = dict(row)
    con.close()
    return result


# ═══════════════════════════════════════════════════════
#  Update (with audit)
# ═══════════════════════════════════════════════════════
def update_preferences(user_id: int,
                       language: Optional[str] = None,
                       theme: Optional[str] = None,
                       layout: Optional[str] = None,
                       source: str = "api") -> dict:
    """
    Update partial preferences.
    Returns updated preferences dict.
    Raises ValueError on invalid values.
    """
    # Validate
    if language is not None and language not in VALID_LANGUAGES:
        raise ValueError(f"Invalid language: {language}")
    if theme is not None and theme not in VALID_THEMES:
        raise ValueError(f"Invalid theme: {theme}")
    if layout is not None and layout not in VALID_LAYOUTS:
        raise ValueError(f"Invalid layout: {layout}")

    # Build patch dict (ignore None)
    patch = {}
    if language is not None: patch["language"] = language
    if theme    is not None: patch["theme"]    = theme
    if layout   is not None: patch["layout"]   = layout

    if not patch:
        raise ValueError("No fields to update")

    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    c = con.cursor()

    # Ensure row exists
    c.execute(
        "INSERT OR IGNORE INTO user_preferences (user_id, updated_at) VALUES (?, ?)",
        (user_id, int(time.time()))
    )

    # Current values (for audit)
    old = c.execute(
        "SELECT language, theme, layout FROM user_preferences WHERE user_id=?",
        (user_id,)
    ).fetchone()

    # Audit for changed fields
    now = int(time.time())
    for k, v in patch.items():
        old_v = old[k] if old else None
        if old_v != v:
            c.execute("""INSERT INTO preferences_audit
                (user_id, changed_key, old_value, new_value, changed_at, source)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (user_id, k, old_v, v, now, source))

    # Apply update
    set_clause = ", ".join(f"{k}=?" for k in patch.keys())
    values = list(patch.values()) + [now, user_id]
    c.execute(
        f"UPDATE user_preferences SET {set_clause}, updated_at=? WHERE user_id=?",
        values
    )

    con.commit()

    # Return fresh state
    row = c.execute(
        "SELECT language, theme, layout, updated_at FROM user_preferences WHERE user_id=?",
        (user_id,)
    ).fetchone()
    result = dict(row)
    con.close()
    return result


# ═══════════════════════════════════════════════════════
#  Options (for UI dropdowns)
# ═══════════════════════════════════════════════════════
def get_options() -> dict:
    """Available languages/themes/layouts for UI."""
    return {
        "languages": [
            {"code": "en-US", "label": "English", "rtl": False},
            {"code": "ur-PK", "label": "اردو",     "rtl": True},
            {"code": "es-ES", "label": "Español", "rtl": False},
        ],
        "themes": [
            {"id": "default",       "label": "Default",       "desc": "Dark blue (current)"},
            {"id": "clean",         "label": "Clean",         "desc": "Light minimal"},
            {"id": "compact",       "label": "Compact",       "desc": "Denser spacing"},
            {"id": "dark",          "label": "Dark",          "desc": "Pure dark"},
            {"id": "high-contrast", "label": "High Contrast", "desc": "Maximum readability"},
        ],
        "layouts": [
            {"id": "comfortable", "label": "Comfortable"},
            {"id": "compact",     "label": "Compact"},
            {"id": "wide",        "label": "Wide"},
        ],
    }


# ═══════════════════════════════════════════════════════
#  Audit query (for admin)
# ═══════════════════════════════════════════════════════
def get_audit(user_id: int, limit: int = 50) -> list:
    """Recent preference changes for a user."""
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    rows = con.execute("""
        SELECT changed_key, old_value, new_value, changed_at, source
        FROM preferences_audit
        WHERE user_id=?
        ORDER BY changed_at DESC
        LIMIT ?
    """, (user_id, limit)).fetchall()
    con.close()
    return [dict(r) for r in rows]
