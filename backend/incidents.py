"""
Phase 3B — Incident Engine (Read-Only)
Detects service failures, creates/resolves incidents.
NO auto-remediation. NO service restart. NO kill.
"""
import sqlite3, time

FAILURE_COUNTERS = {}
MAX_FAILURES = 3


def init_incidents_db(db_path):
    con = sqlite3.connect(db_path); c = con.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server TEXT NOT NULL, service TEXT,
        category TEXT NOT NULL, severity TEXT NOT NULL,
        status TEXT NOT NULL, message TEXT,
        first_detected INTEGER NOT NULL, last_seen INTEGER NOT NULL,
        resolved_at INTEGER, failure_count INTEGER DEFAULT 0,
        acknowledged INTEGER DEFAULT 0,
        acknowledged_by TEXT, acknowledged_at INTEGER)""")
    c.execute("""CREATE TABLE IF NOT EXISTS incident_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL, ts INTEGER NOT NULL,
        event_type TEXT NOT NULL, detail TEXT)""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_inc_status ON incidents(status)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_inc_server ON incidents(server)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_inc_first ON incidents(first_detected DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_ev_inc ON incident_events(incident_id, ts)")
    con.commit(); con.close()


def _log_event(db_path, iid, etype, detail=""):
    con = sqlite3.connect(db_path); c = con.cursor()
    c.execute("INSERT INTO incident_events(incident_id, ts, event_type, detail) VALUES (?,?,?,?)",
              (iid, int(time.time()), etype, detail))
    con.commit(); con.close()


def _create_incident(db_path, server, service, category, severity, message):
    con = sqlite3.connect(db_path); c = con.cursor()
    now = int(time.time())
    c.execute("""INSERT INTO incidents(server, service, category, severity, status, message,
                  first_detected, last_seen, failure_count)
                 VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)""",
              (server, service, category, severity, message, now, now, MAX_FAILURES))
    iid = c.lastrowid; con.commit(); con.close()
    _log_event(db_path, iid, "CREATED", f"{service or category}: {message}")
    return iid


def _resolve_incident(db_path, iid):
    con = sqlite3.connect(db_path); c = con.cursor()
    now = int(time.time())
    c.execute("UPDATE incidents SET status='RESOLVED', resolved_at=?, last_seen=? WHERE id=?",
              (now, now, iid))
    con.commit(); con.close()
    _log_event(db_path, iid, "RESOLVED", "Service recovered")


def _has_active(db_path, server, service):
    con = sqlite3.connect(db_path); c = con.cursor()
    c.execute("SELECT id FROM incidents WHERE server=? AND service=? AND status='ACTIVE'",
              (server, service))
    row = c.fetchone(); con.close()
    return row[0] if row else None


def _bump(db_path, iid):
    con = sqlite3.connect(db_path); c = con.cursor()
    c.execute("UPDATE incidents SET last_seen=?, failure_count=failure_count+1 WHERE id=?",
              (int(time.time()), iid))
    con.commit(); con.close()


def process_service_checks(db_path, server, services):
    """3-fail rule. Called after every metric save."""
    for svc in services:
        name = svc.get("name", "unknown")
        status = (svc.get("status") or "unknown").lower()
        key = f"{server}:svc:{name}"
        active = _has_active(db_path, server, name)

        if status == "running":
            FAILURE_COUNTERS[key] = 0
            if active:
                _resolve_incident(db_path, active)
        elif status == "down":
            FAILURE_COUNTERS[key] = FAILURE_COUNTERS.get(key, 0) + 1
            if active:
                _bump(db_path, active)
            elif FAILURE_COUNTERS[key] >= MAX_FAILURES:
                _create_incident(db_path, server, name, "SERVICE", "CRITICAL", f"{name} is DOWN")
                FAILURE_COUNTERS[key] = 0


def list_incidents(db_path, status=None, severity=None, server=None, service=None, limit=100):
    con = sqlite3.connect(db_path); c = con.cursor()
    q = "SELECT * FROM incidents WHERE 1=1"; p = []
    if status: q += " AND status=?"; p.append(status)
    if severity: q += " AND severity=?"; p.append(severity)
    if server: q += " AND server=?"; p.append(server)
    if service: q += " AND service=?"; p.append(service)
    q += " ORDER BY first_detected DESC LIMIT ?"; p.append(limit)
    c.execute(q, p)
    cols = [d[0] for d in c.description]
    rows = [dict(zip(cols, r)) for r in c.fetchall()]
    con.close(); return rows


def get_incident(db_path, iid):
    con = sqlite3.connect(db_path); c = con.cursor()
    c.execute("SELECT * FROM incidents WHERE id=?", (iid,))
    cols = [d[0] for d in c.description]
    row = c.fetchone()
    if not row: con.close(); return None
    inc = dict(zip(cols, row))
    c.execute("SELECT ts, event_type, detail FROM incident_events WHERE incident_id=? ORDER BY ts", (iid,))
    inc["events"] = [{"ts": t, "type": e, "detail": d} for t, e, d in c.fetchall()]
    con.close(); return inc


def acknowledge_incident(db_path, iid, user):
    con = sqlite3.connect(db_path); c = con.cursor()
    now = int(time.time())
    c.execute("UPDATE incidents SET acknowledged=1, acknowledged_by=?, acknowledged_at=? WHERE id=?",
              (user, now, iid))
    con.commit(); con.close()
    _log_event(db_path, iid, "ACKNOWLEDGED", f"by {user}")


def incidents_summary(db_path):
    con = sqlite3.connect(db_path); c = con.cursor()
    c.execute("SELECT status, COUNT(*) FROM incidents GROUP BY status")
    sc = dict(c.fetchall())
    c.execute("SELECT severity, COUNT(*) FROM incidents WHERE status='ACTIVE' GROUP BY severity")
    sev = dict(c.fetchall())
    c.execute("SELECT COUNT(*) FROM incidents WHERE status='ACTIVE' AND acknowledged=1")
    ack = c.fetchone()[0]
    con.close()
    return {
        "active": sc.get("ACTIVE", 0), "resolved": sc.get("RESOLVED", 0),
        "total": sum(sc.values()),
        "active_critical": sev.get("CRITICAL", 0),
        "active_warning": sev.get("WARNING", 0),
        "active_info": sev.get("INFO", 0),
        "acknowledged_active": ack
    }
