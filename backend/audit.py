"""
Phase 5 — Audit Logging
Simple SQLite-based audit trail.
"""
import sqlite3
import time
import json
from threading import Lock, Thread
from queue import Queue, Empty

_QUEUE = Queue(maxsize=2000)
_WORKER = None
_STOP = False

_LOCK = Lock()
DB_PATH = None


def init(db_path):
    """Initialize audit_log table. Call once at startup."""
    global DB_PATH
    DB_PATH = db_path
    con = sqlite3.connect(DB_PATH)
    c = con.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        user TEXT,
        action TEXT NOT NULL,
        target TEXT,
        ip TEXT,
        user_agent TEXT,
        success INTEGER DEFAULT 1,
        details TEXT
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)")
    con.commit()
    con.close()


def _worker():
    """Background thread — drains queue to DB."""
    while not _STOP:
        try:
            item = _QUEUE.get(timeout=1)
            if item is None:
                continue
            _write_to_db(item)
        except Empty:
            continue
        except Exception as e:
            print(f"audit worker error: {e}")


def _write_to_db(item):
    global DB_PATH
    if not DB_PATH:
        return
    try:
        con = sqlite3.connect(DB_PATH, timeout=5)
        c = con.cursor()
        c.execute("""INSERT INTO audit_log
            (ts, user, action, target, ip, user_agent, success, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", item)
        con.commit()
        con.close()
    except Exception as e:
        print(f"audit write error: {e}")


def log(action, user=None, target=None, ip=None, user_agent=None, success=True, details=None):
    """Non-blocking audit log. Writes in background thread."""
    global _WORKER
    if not DB_PATH:
        return
    if _WORKER is None or not _WORKER.is_alive():
        _WORKER = Thread(target=_worker, daemon=True)
        _WORKER.start()
    try:
        _QUEUE.put_nowait((
            int(time.time()), user, action, target, ip,
            (user_agent or "")[:200],
            1 if success else 0,
            json.dumps(details) if details else None
        ))
    except Exception:
        pass


def prune_old(days=90):
    """Delete audit entries older than N days."""
    global DB_PATH
    if not DB_PATH:
        return
    try:
        cutoff = int(time.time()) - days * 86400
        con = sqlite3.connect(DB_PATH)
        c = con.cursor()
        c.execute("DELETE FROM audit_log WHERE ts < ?", (cutoff,))
        deleted = c.rowcount
        con.commit()
        con.close()
        return deleted
    except Exception as e:
        print(f"audit prune error: {e}")
        return 0


def query(limit=100, user=None, action=None):
    """Fetch audit entries (for admin endpoint)."""
    global DB_PATH
    if not DB_PATH:
        return []
    con = sqlite3.connect(DB_PATH)
    c = con.cursor()
    q = "SELECT id, ts, user, action, target, ip, success FROM audit_log WHERE 1=1"
    p = []
    if user:
        q += " AND user = ?"
        p.append(user)
    if action:
        q += " AND action = ?"
        p.append(action)
    q += " ORDER BY ts DESC LIMIT ?"
    p.append(limit)
    c.execute(q, p)
    rows = [{"id": r[0], "ts": r[1], "user": r[2], "action": r[3],
             "target": r[4], "ip": r[5], "success": bool(r[6])} for r in c.fetchall()]
    con.close()
    return rows
