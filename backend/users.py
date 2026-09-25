"""
Phase 5 — User Management (RBAC)
SQLite-based. Roles: admin, operator, viewer.
"""
import sqlite3
import time
from passlib.context import CryptContext

DB_PATH = None
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

ROLES = ["admin", "operator", "viewer"]

PERMISSIONS = {
    "admin":    {"view", "ai", "ack", "audit", "users"},
    "operator": {"view", "ai", "ack"},
    "viewer":   {"view"},
}


def init(db_path):
    """Create users table. Migrate admin from config if needed."""
    global DB_PATH
    DB_PATH = db_path
    con = sqlite3.connect(DB_PATH)
    c = con.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        display_name TEXT,
        email TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_login INTEGER,
        created_by TEXT
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
    con.commit()
    con.close()


def create_user(username, password, role="viewer", display_name=None, email=None, created_by=None):
    """Create user. Returns id or raises."""
    if role not in ROLES:
        raise ValueError(f"Invalid role: {role}")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    try:
        c.execute("""INSERT INTO users
            (username, password_hash, role, display_name, email, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (username, _pwd.hash(password), role, display_name, email, int(time.time()), created_by))
        con.commit()
        return c.lastrowid
    except sqlite3.IntegrityError:
        raise ValueError(f"Username '{username}' already exists")
    finally:
        con.close()


def get_user_by_name(username):
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    c.execute("""SELECT id, username, password_hash, role, display_name, email,
                        enabled, created_at, last_login
                 FROM users WHERE username = ?""", (username,))
    row = c.fetchone()
    con.close()
    if not row:
        return None
    return {
        "id": row[0], "username": row[1], "password_hash": row[2],
        "role": row[3], "display_name": row[4], "email": row[5],
        "enabled": bool(row[6]), "created_at": row[7], "last_login": row[8]
    }


def get_user_by_id(user_id):
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    c.execute("""SELECT id, username, role, display_name, email,
                        enabled, created_at, last_login
                 FROM users WHERE id = ?""", (user_id,))
    row = c.fetchone()
    con.close()
    if not row:
        return None
    return {
        "id": row[0], "username": row[1], "role": row[2],
        "display_name": row[3], "email": row[4],
        "enabled": bool(row[5]), "created_at": row[6], "last_login": row[7]
    }


def list_users():
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    c.execute("""SELECT id, username, role, display_name, email,
                        enabled, created_at, last_login
                 FROM users ORDER BY id""")
    rows = c.fetchall()
    con.close()
    return [{
        "id": r[0], "username": r[1], "role": r[2],
        "display_name": r[3], "email": r[4],
        "enabled": bool(r[5]), "created_at": r[6], "last_login": r[7]
    } for r in rows]


def verify_password(username, password):
    user = get_user_by_name(username)
    if not user:
        return None
    if not user["enabled"]:
        return None
    if not _pwd.verify(password, user["password_hash"]):
        return None
    # Update last_login
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    c.execute("UPDATE users SET last_login = ? WHERE id = ?", (int(time.time()), user["id"]))
    con.commit()
    con.close()
    return user


def update_password(user_id, new_password):
    if len(new_password) < 8:
        raise ValueError("Password must be at least 8 characters")
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    c.execute("UPDATE users SET password_hash = ? WHERE id = ?",
              (_pwd.hash(new_password), user_id))
    con.commit()
    con.close()


def update_user(user_id, role=None, display_name=None, email=None, enabled=None):
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    updates = []
    params = []
    if role is not None:
        if role not in ROLES:
            raise ValueError(f"Invalid role: {role}")
        updates.append("role = ?")
        params.append(role)
    if display_name is not None:
        updates.append("display_name = ?")
        params.append(display_name)
    if email is not None:
        updates.append("email = ?")
        params.append(email)
    if enabled is not None:
        updates.append("enabled = ?")
        params.append(1 if enabled else 0)
    if not updates:
        return
    params.append(user_id)
    c.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
    con.commit()
    con.close()


def delete_user(user_id):
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    c.execute("DELETE FROM users WHERE id = ?", (user_id,))
    con.commit()
    con.close()


def has_permission(role, permission):
    return permission in PERMISSIONS.get(role, set())


def count_users():
    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    c.execute("SELECT COUNT(*) FROM users")
    n = c.fetchone()[0]
    con.close()
    return n
