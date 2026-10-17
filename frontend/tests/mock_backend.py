"""Mock of the SNGPL backend (same routes/shapes as backend/main.py) incl. WebSocket, for UI tests."""
import asyncio, json, math, os, random, sys, time
from aiohttp import web, WSMsgType
ROOT, PORT = sys.argv[1], int(sys.argv[2]); NOW = int(time.time()); random.seed(7)
def srv(name, os_, cpu, ram_pct, mounts, model, cpum, cores, ramgb, ip, up, svcs, users=None, status="online"):
    tot = ramgb * 1024
    return {"name": name, "server_name": name, "os_type": os_, "os_version": "7200-05-02-2114" if os_ == "AIX" else "Red Hat Enterprise Linux 9.4", "kernel": "7.2" if os_ == "AIX" else "5.14.0-427",
        "status": status, "age_sec": 3, "uptime_sec": up * 86400, "group": "AIX" if os_ == "AIX" else "RHEL",
        "cpu": {"usage_pct": cpu, "load_1": round(cpu / 8, 2), "load_5": round(cpu / 10, 2), "load_15": round(cpu / 12, 2)},
        "ram": {"total_mb": tot, "used_mb": int(tot * ram_pct / 100), "free_mb": int(tot * (100 - ram_pct) / 100), "cached_mb": 1200, "swap_total_mb": 8192 if os_ != "AIX" else 0, "swap_used_mb": 640 if os_ != "AIX" else 0},
        "mounts": [{"mount": m, "total_gb": t, "used_gb": round(t * p / 100, 2), "avail_gb": round(t * (100 - p) / 100, 2), "use_pct": p} for m, t, p in mounts],
        "machine": {"hostname": name + ".sngpl.com", "machine_model": model, "cpu_model": cpum, "cpu_cores": cores, "ram_total": ramgb, "serial": "SN-" + name[-4:].upper() + "8A1", "ip": ip, "uptime_days": up},
        "services": [{"name": n, "status": s, "type": "process", "check": "pgrep", "response_ms": r} for n, s, r in svcs],
        "active_users": users or [{"name": "oracle", "active": True, "source_ip": "172.17.105.44", "tty": "pts/1"}, {"name": "cissys", "active": False, "shell": True}], "ssh_sessions": [],
        "top_cpu": [{"pid": 1000 + i * 37, "user": u, "cpu": round(max(cpu, 3) / (i + 1.5), 1), "mem": round(ram_pct / (i + 6), 1), "cmd": c} for i, (u, c) in enumerate([("oracle", "ora_dbw0_DEVEBS"), ("oracle", "oracleDEVEBS (LOCAL=NO)"), ("root", "/usr/sbin/syslogd"), ("applmgr", "FNDLIBR"), ("root", "sshd: monitor")])],
        "network": [{"iface": "en0", "rx_kb": 8123456, "tx_kb": 3123456}, {"iface": "en1", "rx_kb": 123456, "tx_kb": 93456}]}
M = lambda: [("/", 2.5, 23), ("/var", 9.5, 35), ("/tmp", 4, 12), ("/home", 20, 31), ("/opt", 16, 62), ("/u01", 500, 78)]
SERVERS = [
 srv("aix-devebs", "AIX", 41.2, 99, M(), "IBM,9080-HEX", "PowerPC_POWER10", 6, 64, "172.22.4.103", 630, [("Oracle Listener", "RUNNING", 12), ("Oracle Database", "DOWN", 0)]),
 srv("aix-prodebs", "AIX", 34, 58, M(), "IBM,9080-HEX", "PowerPC_POWER10", 12, 128, "172.22.4.101", 402, [("Oracle Listener", "RUNNING", 9), ("Oracle Database", "RUNNING", 14), ("WebLogic Admin", "RUNNING", 31)]),
 srv("aix-testebs", "AIX", 72, 91, M(), "IBM,9009-22A", "PowerPC_POWER9", 8, 32, "172.22.4.107", 211, [("Oracle Listener", "RUNNING", 11), ("Oracle Database", "DEGRADED", 420)]),
 srv("aix-batch01", "AIX", 28, 44, M(), "IBM,9009-22A", "PowerPC_POWER9", 4, 32, "172.22.4.110", 305, [("Batch Scheduler", "RUNNING", 7)]),
 srv("rhel-app01", "Linux", 22, 47, [("/", 50, 33), ("/var", 100, 44), ("/boot", 1, 24)], "Dell PowerEdge R750", "Intel Xeon Gold 6338", 16, 64, "172.22.4.21", 98, [("WebLogic", "RUNNING", 22), ("ORDS", "RUNNING", 15)]),
 srv("rhel-app02", "Linux", 31, 52, [("/", 50, 36), ("/var", 100, 47)], "Dell PowerEdge R750", "Intel Xeon Gold 6338", 16, 64, "172.22.4.22", 98, [("WebLogic", "RUNNING", 25)]),
 srv("rhel-web01", "Linux", 18, 41, [("/", 50, 30), ("/var", 100, 28)], "Dell PowerEdge R650", "Intel Xeon Silver 4314", 8, 32, "172.22.4.40", 60, [("nginx", "RUNNING", 4), ("APEX", "RUNNING", 18)]),
 srv("rhel-db01", "Linux", 63, 74, [("/", 50, 34), ("/var", 100, 62), ("/data", 1000, 96)], "Dell PowerEdge R750", "Intel Xeon Gold 6338", 16, 128, "172.22.4.25", 140, [("PostgreSQL", "RUNNING", 6), ("Backup Agent", "RUNNING", 41)]),
 srv("rhel-mw01", "Linux", 0, 0, [("/", 50, 20)], "Dell PowerEdge R650", "Intel Xeon Silver 4314", 8, 32, "172.22.4.31", 0, [("Message Queue", "DOWN", 0)], status="offline"),
]
def inc(i, server, service, cat, sev, status, msg, ago, ack=False, res=None, fc=3):
    return {"id": i, "server": server, "service": service, "category": cat, "severity": sev, "status": status, "message": msg, "first_detected": NOW - ago, "last_seen": NOW - 60, "resolved_at": (NOW - res) if res else None, "failure_count": fc, "acknowledged": 1 if ack else 0, "acknowledged_by": "operator1" if ack else None, "acknowledged_at": NOW - 600 if ack else None}
INCS = [inc(23, "aix-devebs", "Oracle Database", "SERVICE", "CRITICAL", "ACTIVE", "Oracle Database is DOWN", 760, fc=14), inc(22, "rhel-db01", None, "DISK", "WARNING", "ACTIVE", "Disk /data above 95% (96%)", 3200, ack=True, fc=6),
        inc(21, "aix-testebs", "Oracle Database", "SERVICE", "WARNING", "ACTIVE", "Oracle Database is DEGRADED (420 ms)", 5400, fc=9), inc(20, "rhel-mw01", "Message Queue", "SERVICE", "CRITICAL", "ACTIVE", "Server rhel-mw01 not responding", 9000, fc=30),
        inc(19, "aix-prodebs", "WebLogic Admin", "SERVICE", "WARNING", "RESOLVED", "WebLogic Admin was slow", 86400, res=82000), inc(18, "rhel-app01", "ORDS", "SERVICE", "CRITICAL", "RESOLVED", "ORDS was DOWN", 172800, res=170000)]
def hist(rng):
    n, step = {"1h": (60, 60), "6h": (72, 300), "24h": (96, 900), "7d": (84, 7200)}.get(rng, (60, 60)); pts = []
    for i in range(n):
        pts.append({"ts": NOW - (n - i) * step, "cpu": round(40 + 15 * math.sin(i / 6) + random.random() * 6, 1), "ram": round(88 + 6 * math.sin(i / 9) + random.random() * 2, 1), "load1": round(3 + 2 * math.sin(i / 5) + random.random(), 2), "disk": 78})
    st = lambda k: {"current": pts[-1][k], "avg": round(sum(p[k] for p in pts) / n, 1), "min": min(p[k] for p in pts), "max": max(p[k] for p in pts)}
    return {"points": pts, "stats": {"cpu": st("cpu"), "ram": st("ram")}}
SESS = [{"user": "oracle", "tty": "pts/1", "source_ip": "172.17.105.44", "login_time": "2026-10-12 10:30", "type": "SSH", "server": "aix-devebs", "os_type": "AIX"}, {"user": "cissys", "tty": "pts/3", "source_ip": "172.17.105.12", "login_time": "2026-10-12 08:05", "type": "SSH", "server": "aix-devebs", "os_type": "AIX"},
        {"user": "applmgr", "tty": "pts/0", "source_ip": "172.17.105.44", "login_time": "2026-10-12 09:48", "type": "SSH", "server": "aix-prodebs", "os_type": "AIX"}, {"user": "deploy", "tty": "pts/2", "source_ip": "10.10.3.18", "login_time": "2026-10-12 07:20", "type": "SSH", "server": "rhel-app01", "os_type": "Linux"}]
USERS = [{"id": 1, "username": "admin", "role": "admin", "display_name": "Administrator", "email": "dawood.khawar@sngpl.com.pk", "enabled": True, "created_at": NOW - 86400 * 30, "last_login": NOW - 3600},
         {"id": 2, "username": "operator1", "role": "operator", "display_name": "Night Operator", "email": "", "enabled": True, "created_at": NOW - 86400 * 20, "last_login": NOW - 90000},
         {"id": 3, "username": "viewer1", "role": "viewer", "display_name": "NOC Display", "email": "", "enabled": False, "created_at": NOW - 86400 * 10, "last_login": None}]
AUDIT = [{"id": 1400 + i, "ts": NOW - i * 700, "user": u, "action": a, "target": t, "ip": "172.17.105.44", "success": ok} for i, (u, a, t, ok) in enumerate([("admin", "login.success", None, True), ("operator1", "incident.acknowledge", "#22", True), ("admin", "user.delete", "olduser", True), ("unknown", "login.fail", None, False), ("admin", "preferences.update", "theme", True)])]
OPTS = {"languages": [{"code": "en-US", "label": "English", "rtl": False}, {"code": "ur-PK", "label": "اردو", "rtl": True}, {"code": "es-ES", "label": "Español", "rtl": False}],
        "themes": [{"id": "default", "label": "Default"}, {"id": "clean", "label": "Clean"}, {"id": "compact", "label": "Compact"}, {"id": "dark", "label": "Dark"}, {"id": "high-contrast", "label": "High Contrast"}],
        "layouts": [{"id": "comfortable", "label": "Comfortable"}, {"id": "compact", "label": "Compact"}, {"id": "wide", "label": "Wide"}]}
PREFS = {"language": os.environ.get("MOCK_LANG", "en-US"), "theme": os.environ.get("MOCK_THEME", "default"), "layout": os.environ.get("MOCK_LAYOUT", "comfortable")}
ROLE = os.environ.get("MOCK_ROLE", "admin"); LOG = []   # records mutating calls for assertions
ok = lambda d: web.json_response({"status": "ok", "data": d})
def authed(r): return r.headers.get("Authorization", "").startswith("Bearer ")
@web.middleware
async def mw(request, handler):
    req, h = request, handler
    p = req.path
    if p.startswith("/api/v1/") and p not in ("/api/v1/auth/login", "/api/v1/preferences/options") and not p.endswith("/ws/live") and not authed(req): return web.json_response({"detail": "Not authenticated"}, status=401)
    if req.method != "GET" and p.startswith("/api/v1/"): LOG.append(f"{req.method} {p}")
    return await h(req)
async def login(r):
    b = await r.json()
    if b.get("password") != "secret123": return web.json_response({"detail": "Invalid credentials"}, status=401)
    return web.json_response({"access_token": "mock-token", "user": {"username": b["username"], "role": ROLE}})
async def routes_ws(request):
    ws = web.WebSocketResponse(); await ws.prepare(request)
    try:
        m = await asyncio.wait_for(ws.receive(), 5); d = json.loads(m.data)
        if d.get("type") != "auth" or d.get("token") != "mock-token": await ws.close(code=4401); return ws
        await ws.send_json({"type": "auth_ok"})
        async def push():
            while not ws.closed:
                await asyncio.sleep(2)
                s = random.choice([x for x in SERVERS if x["status"] == "online"]); s["cpu"]["usage_pct"] = round(max(3, min(98, s["cpu"]["usage_pct"] + random.uniform(-5, 5))), 1)
                await ws.send_json({"type": "metric", "server": s["name"], "data": s})
        t = asyncio.create_task(push())
        async for _ in ws: pass
        t.cancel()
    except Exception: pass
    return ws
async def api_get(req):
    p = req.match_info["p"]; q = req.query
    if p == "auth/me": return ok({"username": "admin", "role": ROLE, "display_name": "Administrator"})
    if p == "servers": return ok(SERVERS)
    if p.startswith("servers/") and p.endswith("history_agg"): return ok(hist(q.get("range", "1h")))
    if p == "incidents/summary": return ok({"active": sum(i["status"] == "ACTIVE" for i in INCS), "resolved": sum(i["status"] == "RESOLVED" for i in INCS), "total": len(INCS)})
    if p == "incidents": return ok(INCS)
    if p.startswith("incidents/"):
        i = next((x for x in INCS if str(x["id"]) == p.split("/")[1]), None)
        if not i: return web.json_response({"detail": "Not found"}, status=404)
        return ok(dict(i, events=[{"ts": i["first_detected"], "type": "CREATED", "detail": "Detected by check"}, {"ts": NOW - 300, "type": "UPDATED", "detail": "Still failing (%d)" % i["failure_count"]}]))
    if p == "sessions": return ok(SESS)
    if p == "users": return ok(USERS)
    if p.startswith("users/"): return ok(next(u for u in USERS if str(u["id"]) == p.split("/")[1]))
    if p == "audit": return ok(AUDIT)
    if p == "preferences/options": return ok(OPTS)
    if p == "preferences/me": return ok(PREFS)
    if p == "_log": return web.json_response(LOG)
    return ok([])
async def api_post(req):
    p = req.match_info["p"]
    try: body = await req.json()
    except Exception: body = {}
    if p.endswith("/acknowledge"):
        i = next(x for x in INCS if str(x["id"]) == p.split("/")[1]); i.update(acknowledged=1, acknowledged_by="admin"); return ok({"acknowledged": True})
    if p.startswith("ai/"): return ok({"analysis": "**Probable cause**\nThe Oracle Database service is stopped while RAM stays near full, which points to a stuck shared memory segment.\n\n**Next steps**\n1. Check shared memory: `ipcs -m | grep oracle`\n2. Restart the listener, then the database.\n\n```\nlsnrctl status\n```\n\n**Impact**\nApplications that use this database will fail until it is restarted.", "model": "llama3"})
    if p == "users":
        if len(body.get("password", "")) < 8: return web.json_response({"detail": "Password too short"}, status=422)
        u = {"id": 10 + len(USERS), "username": body["username"], "role": body.get("role", "viewer"), "display_name": body.get("display_name"), "email": body.get("email"), "enabled": True, "created_at": NOW, "last_login": None}; USERS.append(u); return ok(u)
    if p.endswith("reset-password") or p == "auth/change-password": return ok({"ok": True}) if body.get("old_password", "x") != "wrong" else web.json_response({"detail": "Current password is incorrect"}, status=400)
    return ok({})
async def api_put(req):
    uid = int(req.match_info["p"].split("/")[1]); u = next(x for x in USERS if x["id"] == uid); b = await req.json(); u.update({k: v for k, v in b.items() if k in u}); return ok(u)
async def api_delete(req):
    uid = int(req.match_info["p"].split("/")[1]); USERS[:] = [u for u in USERS if u["id"] != uid]; return ok({})
async def api_patch(req):
    b = await req.json(); PREFS.update({k: v for k, v in b.items() if k in PREFS}); return ok(PREFS)
app = web.Application(middlewares=[mw])
app.router.add_post("/api/v1/auth/login", login); app.router.add_get("/api/v1/ws/live", routes_ws)
app.router.add_get("/api/v1/{p:.*}", api_get); app.router.add_post("/api/v1/{p:.*}", api_post); app.router.add_put("/api/v1/{p:.*}", api_put); app.router.add_delete("/api/v1/{p:.*}", api_delete); app.router.add_patch("/api/v1/{p:.*}", api_patch)
async def index(req):
    return web.FileResponse(os.path.join(ROOT, "index.html"))
app.router.add_get("/", index); app.router.add_static("/", ROOT, show_index=False)
web.run_app(app, host="127.0.0.1", port=PORT, print=None)
