"""
SNGLP Monitor - Central Backend (FastAPI)
RHEL 9 + Python 3.9+
"""
import os, json, time, sqlite3, asyncio, hashlib, secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

import yaml
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Header, status, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel

# ---------- Config ----------
CFG_PATH = os.environ.get("SNGLP_CONFIG", "/ords/sngpl-monitor/config.yaml")
with open(CFG_PATH) as f:
    CFG = yaml.safe_load(f)

DB_PATH = CFG["database"]["path"]
JWT_SECRET = CFG["auth"]["jwt_secret"]
JWT_ALGO = "HS256"
JWT_EXPIRE_MIN = CFG["auth"]["jwt_expire_minutes"]
ADMIN_USER = CFG["auth"]["admin_user"]
ADMIN_PASS_HASH = CFG["auth"]["admin_password_hash"]

# ══════ File Permission Check (Phase 5) ══════
def _check_file_permissions():
    """Warn if sensitive files have loose permissions."""
    import stat as _stat
    warnings = []
    sensitive_files = [
        CFG_PATH,
        DB_PATH,
        "/ords/sngpl-monitor/certs/server.key",
        "/ords/sngpl-monitor/certs/ca.key",
    ]
    for path in sensitive_files:
        if not os.path.exists(path):
            continue
        try:
            mode = os.stat(path).st_mode
            # Check if group or other has read/write
            if mode & (_stat.S_IRGRP | _stat.S_IWGRP | _stat.S_IROTH | _stat.S_IWOTH):
                warnings.append(f"  ⚠ {path} has loose permissions: {oct(mode & 0o777)}")
        except Exception as e:
            warnings.append(f"  ⚠ Could not check {path}: {e}")
    return warnings


_permission_warnings = _check_file_permissions()
if _permission_warnings:
    print("=" * 60)
    print("⚠ SECURITY WARNING — Loose file permissions detected:")
    for w in _permission_warnings:
        print(w)
    print("  Fix: chmod 600 <file>")
    print("=" * 60)

RETENTION_DAYS = CFG["database"]["retention_days"]
AGENT_TOKENS = {s["name"]: s["token"] for s in CFG["servers"]}

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import incidents as _inc
import ai_insights as _ai
import ratelimit as _rl
import audit as _audit
import users as _users
import preferences as _prefs

# ---------- DB ----------
def init_db():
    con = sqlite3.connect(DB_PATH)
    c = con.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server TEXT, ts INTEGER, data TEXT )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_metrics_server_ts ON metrics(server, ts)")
    c.execute("""CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server TEXT, ts INTEGER, kind TEXT, message TEXT )""")
    con.commit(); con.close()

def save_metric(server: str, data: dict):
    con = sqlite3.connect(DB_PATH, timeout=30); c = con.cursor()
    c.execute("PRAGMA synchronous=NORMAL")
    c.execute("INSERT INTO metrics(server, ts, data) VALUES (?,?,?)",
              (server, int(time.time()), json.dumps(data)))
    con.commit(); con.close()

def prune_old():
    cutoff = int(time.time()) - RETENTION_DAYS*86400
    con = sqlite3.connect(DB_PATH); c = con.cursor()
    c.execute("DELETE FROM metrics WHERE ts < ?", (cutoff,))
    c.execute("DELETE FROM alerts WHERE ts < ?", (cutoff,))
    con.commit(); con.close()

# ══════ Latest metrics cache (Phase 5 — speed) ══════
_LATEST_CACHE = {"ts": 0, "data": None}
_LATEST_CACHE_TTL = 2.5   # seconds — WebSocket live push handles freshness


def latest_metrics() -> Dict[str, dict]:
    """Latest metric per server. Cached + indexed per-server lookups."""
    global _LATEST_CACHE
    now = time.time()
    # Return cached copy if fresh
    if _LATEST_CACHE["data"] is not None and (now - _LATEST_CACHE["ts"]) < _LATEST_CACHE_TTL:
        return _LATEST_CACHE["data"]

    con = sqlite3.connect(DB_PATH, timeout=10)
    c = con.cursor()
    c.execute("PRAGMA cache_size=-64000")
    c.execute("PRAGMA mmap_size=268435456")
    c.execute("PRAGMA temp_store=MEMORY")
    c.execute("PRAGMA busy_timeout=10000")

    # Fast per-server indexed lookup using existing idx_metrics_server_ts
    out = {}
    try:
        # Get distinct servers first (fast — uses index)
        c.execute("SELECT DISTINCT server FROM metrics")
        servers = [row[0] for row in c.fetchall()]
        for srv in servers:
            c.execute(
                "SELECT ts, data FROM metrics WHERE server = ? ORDER BY ts DESC LIMIT 1",
                (srv,)
            )
            row = c.fetchone()
            if row:
                ts, data = row
                try:
                    out[srv] = {"ts": ts, "data": json.loads(data)}
                except Exception:
                    pass
    finally:
        con.close()

    _LATEST_CACHE["ts"] = now
    _LATEST_CACHE["data"] = out
    return out

def history(server: str, minutes: int = 60) -> list:
    cutoff = int(time.time()) - minutes*60
    con = sqlite3.connect(DB_PATH, timeout=30); c = con.cursor()
    c.execute("PRAGMA cache_size=-64000")
    c.execute("PRAGMA mmap_size=268435456")
    c.execute("SELECT ts, data FROM metrics WHERE server=? AND ts>? ORDER BY ts", (server, cutoff))
    rows = [{"ts": t, **json.loads(d)} for t, d in c.fetchall()]
    con.close(); return rows

# ---------- Lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _inc.init_incidents_db(DB_PATH)
    _audit.init(DB_PATH)
    _users.init(DB_PATH)
    _prefs.init(DB_PATH)
    # Migrate admin from config if no users exist
    if _users.count_users() == 0:
        _users.create_user(ADMIN_USER, "ChangeMe@2026", role="admin",
                           display_name="Administrator", created_by="system")
        print(f"[init] Created initial admin user: {ADMIN_USER} (password: ChangeMe@2026)")
        print(f"[init] Change password immediately: login and use /api/v1/users/{ADMIN_USER}/change-password")
    asyncio.create_task(prune_loop())
    yield

async def prune_loop():
    while True:
        await asyncio.sleep(3600)
        try: prune_old()
        except Exception as e: print("prune error:", e)

app = FastAPI(title="SNGLP Monitor", version="1.0", lifespan=lifespan)

# CORS (mobile app / PWA future)
app.add_middleware(CORSMiddleware,
    allow_origins=CFG.get("cors", {}).get("allow_origins", ["*"]),
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ---------- Security Headers (Phase 5) ----------
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self' ws: wss:; "
        "font-src 'self' data:; "
        "frame-ancestors 'none'; "
        "base-uri 'self';"
    )
    return response


# ---------- Auth ----------
class LoginReq(BaseModel):
    username: str
    password: str

def create_token(user: str, role: str = "viewer") -> str:
    exp = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MIN)
    return jwt.encode({"sub": user, "role": role, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGO)

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return {"user": payload["sub"], "role": payload.get("role", "viewer")}
    except JWTError:
        raise HTTPException(401, "Invalid token")

def require_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    return verify_token(authorization.split(" ", 1)[1])


def require_permission(permission: str):
    """Dependency factory — checks role permission."""
    def checker(auth: dict = Depends(require_user)) -> dict:
        role = auth.get("role", "viewer")
        if not _users.has_permission(role, permission):
            raise HTTPException(403, f"Permission denied: {permission} required")
        return auth
    return checker

@app.post("/api/v1/auth/login")
def login(req: LoginReq, request: Request):
    _rl.limit_login(request)
    user = _users.verify_password(req.username, req.password)
    if not user:
        _audit.log("login.fail", user=req.username, ip=_rl.get_client_ip(request),
                   user_agent=request.headers.get("user-agent"), success=False)
        raise HTTPException(401, "Bad credentials")
    _audit.log("login.success", user=req.username, ip=_rl.get_client_ip(request),
               user_agent=request.headers.get("user-agent"), success=True)
    return {
        "status": "ok",
        "access_token": create_token(user["username"], user["role"]),
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"],
        "display_name": user.get("display_name") or user["username"]
    }

@app.get("/api/v1/auth/me")
def me(auth: dict = Depends(require_user)):
    user_data = _users.get_user_by_name(auth["user"])
    return {"status": "ok", "data": {
        "username": auth["user"],
        "role": auth.get("role", "viewer"),
        "display_name": (user_data or {}).get("display_name") or auth["user"]
    }}

# ---------- Agent ingest ----------
@app.post("/api/v1/metrics")
async def ingest(payload: dict, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1]
    srv = payload.get("server_name")
    if not srv or AGENT_TOKENS.get(srv) != token:
        raise HTTPException(401, "Bad agent token")
    save_metric(srv, payload)
    try:
        _inc.process_service_checks(DB_PATH, srv, payload.get("services", []) or [])
    except Exception as _e:
        print("incident engine error:", _e)
    check_alerts(srv, payload)
    await broadcast({"type": "metric", "server": srv, "ts": int(time.time()), "data": payload})
    return {"status": "ok"}

def check_alerts(srv: str, p: dict):
    alerts = []
    r = p.get("ram", {})
    if r.get("total_mb", 0) > 0:
        pct = 100.0 * r.get("used_mb", 0) / r["total_mb"]
        if pct >= CFG["thresholds"]["ram_pct"]:
            alerts.append(("RAM", f"RAM usage {pct:.1f}%"))
    if p.get("cpu", {}).get("usage_pct", 0) >= CFG["thresholds"]["cpu_pct"]:
        alerts.append(("CPU", f"CPU {p['cpu']['usage_pct']:.1f}%"))
    for m in p.get("mounts", []):
        if m.get("use_pct", 0) >= CFG["thresholds"]["disk_pct"]:
            alerts.append(("DISK", f"{m['mount']} {m['use_pct']}% full"))
    if alerts:
        con = sqlite3.connect(DB_PATH); c = con.cursor()
        for k, msg in alerts:
            c.execute("INSERT INTO alerts(server,ts,kind,message) VALUES (?,?,?,?)",
                      (srv, int(time.time()), k, msg))
        con.commit(); con.close()

# ---------- Read APIs ----------
@app.get("/api/v1/servers")
def servers(user: str = Depends(require_user)):
    m = latest_metrics()
    out = []
    now = int(time.time())
    for s in CFG["servers"]:
        d = m.get(s["name"])
        if d:
            age = now - d["ts"]
            out.append({"name": s["name"], "group": s.get("group", "default"),
                        "status": "offline" if age > 15 else "online",
                        "age_sec": age, **d["data"]})
        else:
            out.append({"name": s["name"], "group": s.get("group", "default"),
                        "status": "offline", "age_sec": None})
    return {"status": "ok", "data": out}

@app.get("/api/v1/servers/{name}")
def server_detail(name: str, user: str = Depends(require_user)):
    m = latest_metrics()
    if name not in m: raise HTTPException(404, "No data")
    return {"status": "ok", "data": m[name]}

@app.get("/api/v1/servers/{name}/history")
def server_history(name: str, minutes: int = 60, user: str = Depends(require_user)):
    return {"status": "ok", "data": history(name, minutes)}

@app.get("/api/v1/alerts")
def alerts(limit: int = 100, user: str = Depends(require_user)):
    con = sqlite3.connect(DB_PATH); c = con.cursor()
    c.execute("SELECT server,ts,kind,message FROM alerts ORDER BY ts DESC LIMIT ?", (limit,))
    rows = [{"server": s, "ts": t, "kind": k, "message": m} for s, t, k, m in c.fetchall()]
    con.close()
    return {"status": "ok", "data": rows}

# ---------- WebSocket ----------
WS_CLIENTS = {}  # {username: set(WebSocket)} per-user buckets


def _user_ws_bucket(username: str) -> set:
    """Get or create user's WebSocket bucket."""
    if username not in WS_CLIENTS:
        WS_CLIENTS[username] = set()
    return WS_CLIENTS[username]

async def broadcast(msg: dict):
    """Global broadcast — sends to ALL connected users."""
    dead = []
    for username, bucket in list(WS_CLIENTS.items()):
        for ws in list(bucket):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append((username, ws))
    for username, d in dead:
        WS_CLIENTS.get(username, set()).discard(d)


async def broadcast_to_user(username: str, msg: dict):
    """Targeted broadcast — only to a specific user's connections."""
    bucket = WS_CLIENTS.get(username)
    if not bucket:
        return
    dead = []
    for ws in list(bucket):
        try:
            await ws.send_json(msg)
        except Exception:
            dead.append(ws)
    for d in dead:
        bucket.discard(d)

@app.websocket("/api/v1/ws/live")
async def ws_live(ws: WebSocket):
    """Secure WebSocket — auth via first message, not URL."""
    await ws.accept()
    
    # Rate limit by IP
    ip = ws.client.host if ws.client else "unknown"
    try:
        _rl.limit_websocket(ip)
    except HTTPException:
        try:
            await ws.send_json({"type": "error", "message": "Rate limit exceeded"})
        except Exception:
            pass
        await ws.close(code=4429)
        return
    
    # Wait for auth message (5 sec timeout)
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=5.0)
    except asyncio.TimeoutError:
        await ws.close(code=4408)  # auth timeout
        return
    except Exception:
        await ws.close(code=4400)
        return
    
    # Parse auth message
    try:
        auth_msg = json.loads(raw)
    except Exception:
        await ws.close(code=4400)
        return
    
    if not isinstance(auth_msg, dict) or auth_msg.get("type") != "auth":
        await ws.close(code=4400)
        return
    
    token = auth_msg.get("token", "")
    try:
        auth = verify_token(token)
    except HTTPException:
        _audit.log("ws.auth_fail", ip=ip,
                   user_agent=ws.headers.get("user-agent"), success=False)
        await ws.close(code=4401)
        return
    
    # Register client
    bucket = _user_ws_bucket(auth["user"])
    bucket.add(ws)
    _audit.log("ws.connect", user=auth["user"], ip=ip, success=True)
    
    # Send ack
    try:
        await ws.send_json({"type": "auth_ok", "user": auth["user"], "role": auth.get("role", "viewer")})
    except Exception:
        pass
    
    # Keepalive loop
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # Remove from per-user bucket
        _bucket = WS_CLIENTS.get(auth["user"])
        if _bucket:
            _bucket.discard(ws)
            if not _bucket:
                WS_CLIENTS.pop(auth["user"], None)
        _audit.log("ws.disconnect", user=auth["user"], ip=ip, success=True)

# ---------- History Aggregation (Phase 2) ----------
def history_aggregated(server: str, range_str: str) -> dict:
    """Downsample metrics for chart display. Range: 1h, 6h, 24h, 7d."""
    import time as _t
    ranges = {"1h": 60, "6h": 360, "24h": 1440, "7d": 10080}
    minutes = ranges.get(range_str, 60)
    bucket_sec = {"1h": 30, "6h": 60, "24h": 300, "7d": 1800}.get(range_str, 30)
    cutoff = int(_t.time()) - minutes * 60
    con = sqlite3.connect(DB_PATH); c = con.cursor()
    c.execute("SELECT ts, data FROM metrics WHERE server=? AND ts>? ORDER BY ts", (server, cutoff))
    rows = c.fetchall()
    con.close()
    buckets = {}
    for ts, data_json in rows:
        try:
            d = json.loads(data_json)
        except Exception:
            continue
        bk = (ts // bucket_sec) * bucket_sec
        if bk not in buckets:
            buckets[bk] = {"ts": bk, "cpu": [], "ram": [], "load1": [], "load5": [], "load15": [], "net_rx": [], "net_tx": [], "disk": []}
        b = buckets[bk]
        cpu = d.get("cpu", {})
        if cpu:
            b["cpu"].append(cpu.get("usage_pct", 0))
            b["load1"].append(cpu.get("load_1", 0))
            b["load5"].append(cpu.get("load_5", 0))
            b["load15"].append(cpu.get("load_15", 0))
        ram = d.get("ram", {})
        if ram and ram.get("total_mb"):
            b["ram"].append(100.0 * ram.get("used_mb", 0) / ram["total_mb"])
        net = d.get("network", [])
        rx = sum(n.get("rx_kb", 0) for n in net)
        tx = sum(n.get("tx_kb", 0) for n in net)
        b["net_rx"].append(rx)
        b["net_tx"].append(tx)
        mounts = d.get("mounts", [])
        disk_pct = max((m.get("use_pct", 0) for m in mounts), default=0)
        b["disk"].append(disk_pct)
    def avg(lst):
        return sum(lst) / len(lst) if lst else 0
    points = []
    for bk in sorted(buckets.keys()):
        b = buckets[bk]
        points.append({
            "ts": bk,
            "cpu": round(avg(b["cpu"]), 2),
            "ram": round(avg(b["ram"]), 2),
            "load1": round(avg(b["load1"]), 2),
            "load5": round(avg(b["load5"]), 2),
            "load15": round(avg(b["load15"]), 2),
            "net_rx": round(avg(b["net_rx"]), 2),
            "net_tx": round(avg(b["net_tx"]), 2),
            "disk": round(avg(b["disk"]), 2)
        })
    def stats(key):
        vals = [p[key] for p in points if p[key] is not None]
        if not vals:
            return {"current": 0, "avg": 0, "min": 0, "max": 0}
        return {
            "current": points[-1][key] if points else 0,
            "avg": round(sum(vals) / len(vals), 2),
            "min": round(min(vals), 2),
            "max": round(max(vals), 2)
        }
    return {
        "server": server,
        "range": range_str,
        "point_count": len(points),
        "points": points,
        "stats": {
            "cpu": stats("cpu"), "ram": stats("ram"),
            "load1": stats("load1"), "load5": stats("load5"), "load15": stats("load15"),
            "net_rx": stats("net_rx"), "net_tx": stats("net_tx"),
            "disk": stats("disk")
        }
    }


@app.get("/api/v1/servers/{name}/history_agg")
def server_history_agg(name: str, range: str = "1h", user: str = Depends(require_user)):
    return {"status": "ok", "data": history_aggregated(name, range)}


# ---------- Incident Center API (Phase 3B) ----------
@app.get("/api/v1/incidents")
def get_incidents(status: str = None, severity: str = None,
                  server: str = None, service: str = None,
                  limit: int = 100, user: str = Depends(require_user)):
    return {"status": "ok", "data": _inc.list_incidents(DB_PATH, status, severity, server, service, limit)}


@app.get("/api/v1/incidents/summary")
def get_incidents_summary(user: str = Depends(require_user)):
    return {"status": "ok", "data": _inc.incidents_summary(DB_PATH)}


@app.get("/api/v1/incidents/{incident_id}")
def get_incident_detail(incident_id: int, user: str = Depends(require_user)):
    inc = _inc.get_incident(DB_PATH, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    return {"status": "ok", "data": inc}


@app.post("/api/v1/incidents/{incident_id}/acknowledge")
def ack_incident(incident_id: int, request: Request, user: str = Depends(require_user)):
    _inc.acknowledge_incident(DB_PATH, incident_id, user)
    _audit.log("incident.ack", user=user, target=f"incident:{incident_id}",
               ip=_rl.get_client_ip(request), success=True)
    return {"status": "ok", "message": "Acknowledged"}


# ---------- AI Insights API (Phase 4) ----------
@app.post("/api/v1/ai/analyze_server/{name}")
def ai_analyze_server(name: str, request: Request, user: str = Depends(require_user)):
    _rl.limit_ai(request, user)
    m = latest_metrics()
    if name not in m:
        raise HTTPException(404, "Server has no metrics yet")
    data = m[name]["data"]
    text = _ai.analyze_server(name, data)
    _audit.log("ai.call", user=user, target=f"server:{name}",
               ip=_rl.get_client_ip(request), success=True)
    return {"status": "ok", "data": {"server": name, "analysis": text, "model": _ai.MODEL}}


@app.post("/api/v1/ai/analyze_incident/{incident_id}")
def ai_analyze_incident(incident_id: int, request: Request, user: str = Depends(require_user)):
    _rl.limit_ai(request, user)
    inc = _inc.get_incident(DB_PATH, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    recent = None
    m = latest_metrics()
    if inc.get("server") in m:
        recent = m[inc["server"]]["data"]
    text = _ai.analyze_incident(inc, recent)
    _audit.log("ai.call", user=user, target=f"incident:{incident_id}",
               ip=_rl.get_client_ip(request), success=True)
    return {"status": "ok", "data": {"incident_id": incident_id, "analysis": text, "model": _ai.MODEL}}


@app.post("/api/v1/ai/analyze_trend/{name}")
def ai_analyze_trend(name: str, request: Request, range: str = "24h", user: str = Depends(require_user)):
    _rl.limit_ai(request, user)
    agg = history_aggregated(name, range)
    text = _ai.analyze_trend(name, agg.get("points", []), range)
    _audit.log("ai.call", user=user, target=f"trend:{name}:{range}",
               ip=_rl.get_client_ip(request), success=True)
    return {"status": "ok", "data": {"server": name, "range": range, "analysis": text, "model": _ai.MODEL}}


# ---------- User Management API (Phase 5 — RBAC) ----------
class CreateUserReq(BaseModel):
    username: str
    password: str
    role: str = "viewer"
    display_name: Optional[str] = None
    email: Optional[str] = None


class UpdateUserReq(BaseModel):
    role: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    enabled: Optional[bool] = None


class ChangePasswordReq(BaseModel):
    old_password: str
    new_password: str


class AdminResetPasswordReq(BaseModel):
    new_password: str


@app.get("/api/v1/users")
def list_users_endpoint(auth: dict = Depends(require_permission("users"))):
    return {"status": "ok", "data": _users.list_users()}


@app.post("/api/v1/users")
def create_user_endpoint(req: CreateUserReq, request: Request, auth: dict = Depends(require_permission("users"))):
    try:
        uid = _users.create_user(req.username, req.password, req.role,
                                 req.display_name, req.email, created_by=auth["user"])
        _audit.log("user.create", user=auth["user"], target=req.username,
                   ip=_rl.get_client_ip(request), success=True, details={"role": req.role})
        return {"status": "ok", "data": {"id": uid, "username": req.username}}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/v1/users/{user_id}")
def get_user_endpoint(user_id: int, auth: dict = Depends(require_permission("users"))):
    u = _users.get_user_by_id(user_id)
    if not u:
        raise HTTPException(404, "User not found")
    return {"status": "ok", "data": u}


@app.put("/api/v1/users/{user_id}")
def update_user_endpoint(user_id: int, req: UpdateUserReq, request: Request, auth: dict = Depends(require_permission("users"))):
    target = _users.get_user_by_id(user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target["username"] == auth["user"]:
        if req.role and req.role != "admin":
            raise HTTPException(400, "You cannot change your own role")
        if req.enabled is False:
            raise HTTPException(400, "You cannot disable yourself")
    try:
        _users.update_user(user_id, req.role, req.display_name, req.email, req.enabled)
        _audit.log("user.update", user=auth["user"], target=target["username"],
                   ip=_rl.get_client_ip(request), success=True)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/v1/users/{user_id}")
def delete_user_endpoint(user_id: int, request: Request, auth: dict = Depends(require_permission("users"))):
    target = _users.get_user_by_id(user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target["username"] == auth["user"]:
        raise HTTPException(400, "You cannot delete yourself")
    _users.delete_user(user_id)
    _audit.log("user.delete", user=auth["user"], target=target["username"],
               ip=_rl.get_client_ip(request), success=True)
    return {"status": "ok"}


@app.post("/api/v1/users/{user_id}/reset-password")
def reset_password_endpoint(user_id: int, req: AdminResetPasswordReq, request: Request, auth: dict = Depends(require_permission("users"))):
    target = _users.get_user_by_id(user_id)
    if not target:
        raise HTTPException(404, "User not found")
    try:
        _users.update_password(user_id, req.new_password)
        _audit.log("user.password_reset", user=auth["user"], target=target["username"],
                   ip=_rl.get_client_ip(request), success=True)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/v1/auth/change-password")
def change_own_password(req: ChangePasswordReq, request: Request, auth: dict = Depends(require_user)):
    user = _users.verify_password(auth["user"], req.old_password)
    if not user:
        raise HTTPException(401, "Old password incorrect")
    try:
        _users.update_password(user["id"], req.new_password)
        _audit.log("user.password_change", user=auth["user"],
                   ip=_rl.get_client_ip(request), success=True)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ---------- Audit Log API (Phase 5) ----------
@app.get("/api/v1/audit")
def get_audit_log(limit: int = 100, action: str = None, user: str = Depends(require_user)):
    return {"status": "ok", "data": _audit.query(limit=limit, action=action)}


# ---------- Unified Sessions API (Phase 1) ----------
@app.get("/api/v1/sessions")
def get_all_sessions(user: str = Depends(require_user)):
    """All active SSH sessions across all servers."""
    m = latest_metrics()
    all_sessions = []
    for srv_name, srv_data in m.items():
        metrics = srv_data.get("data", {})
        sessions = metrics.get("ssh_sessions", [])
        for sess in sessions:
            sess_copy = dict(sess)
            sess_copy["server"] = srv_name
            sess_copy["os_type"] = metrics.get("os_type", "?")
            all_sessions.append(sess_copy)
    return {"status": "ok", "data": all_sessions}


@app.get("/api/v1/sessions/{server_name}")
def get_server_sessions(server_name: str, user: str = Depends(require_user)):
    """Sessions for a specific server."""
    m = latest_metrics()
    if server_name not in m:
        raise HTTPException(404, "Server not found")
    metrics = m[server_name].get("data", {})
    sessions = metrics.get("ssh_sessions", [])
    return {"status": "ok", "data": {
        "server": server_name,
        "os_type": metrics.get("os_type", "?"),
        "sessions": sessions
    }}


# ---------- User Preferences API ----------
class PrefUpdateReq(BaseModel):
    language: Optional[str] = None
    theme:    Optional[str] = None
    layout:   Optional[str] = None

@app.get("/api/v1/preferences/me")
def get_my_preferences(auth: dict = Depends(require_user)):
    """Get current user's preferences."""
    user_id = auth.get("user_id")
    if not user_id:
        # Fallback: lookup by username
        u = _users.get_user_by_name(auth["user"])
        if not u:
            raise HTTPException(404, "User not found")
        user_id = u["id"]
    return {"status": "ok", "data": _prefs.get_preferences(user_id)}


@app.patch("/api/v1/preferences/me")
async def update_my_preferences(
    body: PrefUpdateReq,
    request: Request,
    auth: dict = Depends(require_user)
):
    """Update current user's preferences (partial)."""
    user_id = auth.get("user_id")
    if not user_id:
        u = _users.get_user_by_name(auth["user"])
        if not u:
            raise HTTPException(404, "User not found")
        user_id = u["id"]

    try:
        result = _prefs.update_preferences(
            user_id,
            language=body.language,
            theme=body.theme,
            layout=body.layout,
            source=_rl.get_client_ip(request) if hasattr(_rl, "get_client_ip") else "api"
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Broadcast to user's other sessions (best-effort)
    try:
        await _broadcast_pref_update(auth["user"], result)
    except Exception as e:
        print("[prefs] broadcast failed:", e)

    return {"status": "ok", "data": result}


@app.get("/api/v1/preferences/options")
def get_preference_options():
    """Available languages/themes/layouts. Public — no auth needed."""
    return {"status": "ok", "data": _prefs.get_options()}


@app.get("/api/v1/preferences/audit")
def get_my_preferences_audit(
    limit: int = 50,
    auth: dict = Depends(require_user)
):
    """Recent preference changes for current user."""
    user_id = auth.get("user_id")
    if not user_id:
        u = _users.get_user_by_name(auth["user"])
        if not u:
            raise HTTPException(404, "User not found")
        user_id = u["id"]
    return {"status": "ok", "data": _prefs.get_audit(user_id, limit)}


async def _broadcast_pref_update(username: str, prefs: dict):
    """Send preference update to ONLY this user's WS connections."""
    await broadcast_to_user(username, {
        "type": "preferences.updated",
        "username": username,
        "data": prefs
    })


# ---------- Static frontend ----------
FRONTEND_DIR = CFG["frontend"]["dir"]
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="ui")
