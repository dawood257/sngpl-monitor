"""
Phase 4 — AI Insights (Read-only, local Ollama)
Uses llama3.2:1b for fast explanations. Zero external API.
"""
import json, time, urllib.request, urllib.error, threading

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL = "qwen2.5:3b"
CACHE_TTL = 300   # 5 min
CACHE = {}        # key -> (ts, response)
_AI_LOCK = threading.Lock()  # serialize Ollama calls


def _cache_get(key):
    if key in CACHE:
        ts, val = CACHE[key]
        if time.time() - ts < CACHE_TTL:
            return val
    return None


def _cache_set(key, val):
    CACHE[key] = (time.time(), val)


def _call_ollama(prompt, max_tokens=150):
    """Call local Ollama. Returns text or error string."""
    body = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.3}
    }).encode("utf-8")
    try:
        req = urllib.request.Request(
            OLLAMA_URL, data=body,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.loads(r.read().decode("utf-8"))
            return (d.get("response") or "").strip()
    except urllib.error.URLError as e:
        return f"[AI unavailable: {e}]"
    except Exception as e:
        return f"[AI error: {e}]"


def analyze_server(server_name, metrics):
    """Explain server health with action plan. Warnings pre-computed."""
    key = f"srv:{server_name}"
    cached = _cache_get(key)
    if cached: return cached

    # ─── Extract raw values ───
    cpu = metrics.get("cpu", {})
    ram = metrics.get("ram", {})
    mounts = metrics.get("mounts", [])
    services = metrics.get("services", [])
    cpu_pct = round(cpu.get("usage_pct", 0), 1)
    ram_total = ram.get("total_mb", 0)
    ram_used = ram.get("used_mb", 0)
    ram_pct = round(100.0 * ram_used / ram_total, 1) if ram_total else 0
    load1 = cpu.get("load_1", 0)
    uptime_days = metrics.get("uptime_sec", 0) // 86400

    is_aix = metrics.get("os_type") == "AIX"
    cpu_cores = 16 if is_aix else 4

    # Filter real mounts, sort by usage
    real_mounts = [m for m in mounts
                   if not m['mount'].startswith(('/sys','/proc','/dev'))
                   and m['mount'] != '/']
    real_mounts.sort(key=lambda m: -m.get("use_pct", 0))

    # Generate explicit warnings
    warnings = []
    if ram_pct >= 95:
        warnings.append(f"RAM at {ram_pct}% — CRITICAL (near exhaustion)")
    elif ram_pct >= 85:
        warnings.append(f"RAM at {ram_pct}% — WARNING")

    load_per_core = round(load1 / cpu_cores, 2)
    if load_per_core >= 1.5:
        warnings.append(f"CPU load {load1} on {cpu_cores} cores ({load_per_core}/core) — CRITICAL overload")
    elif load_per_core >= 1.0:
        warnings.append(f"CPU load {load1} on {cpu_cores} cores ({load_per_core}/core) — WARNING")

    for m in real_mounts[:4]:
        if m.get("use_pct", 0) >= 90:
            warnings.append(f"Disk {m['mount']} at {m['use_pct']}% — CRITICAL")
        elif m.get("use_pct", 0) >= 85:
            warnings.append(f"Disk {m['mount']} at {m['use_pct']}% — WARNING")

    services_down = [s['name'] for s in services if s.get("status") == "down"]
    if services_down:
        warnings.append(f"Services DOWN: {', '.join(services_down)}")

    # Top memory hogs
    top_mem = metrics.get("top_mem", [])[:5]
    top_mem_str = "\n".join([f"  - {p.get('cmd','?')[:60]} (PID {p.get('pid','?')}, {p.get('mem',0):.1f}% MEM)"
                              for p in top_mem]) if top_mem else "  (no data)"

    # Top CPU hogs
    top_cpu = metrics.get("top_cpu", [])[:5]
    top_cpu_str = "\n".join([f"  - {p.get('cmd','?')[:60]} (PID {p.get('pid','?')}, {p.get('cpu',0):.1f}% CPU)"
                              for p in top_cpu]) if top_cpu else "  (no data)"

    # Disk string
    disk_str = "\n".join([f"  - {m['mount']}: {m['use_pct']}% ({m.get('used_gb',0):.0f}/{m.get('total_gb',0):.0f} GB)"
                          for m in real_mounts[:5]]) or "  (no data)"

    # Warning string
    warn_str = "\n".join([f"  ⚠ {w}" for w in warnings]) if warnings else "  ✓ No warnings — all metrics within normal range"

    # If healthy, keep it brief
    if not warnings:
        prompt = f"""You are a senior infrastructure analyst. The server below has NO warnings — all metrics are healthy.

SERVER: {server_name}
OS: {metrics.get('os_version','unknown')}
Uptime: {uptime_days} days
CPU: {cpu_pct}% (load {load1} on {cpu_cores} cores)
RAM: {ram_pct}% ({ram_used}/{ram_total} MB)
Top 3 disks: {', '.join([f'{m["mount"]}={m["use_pct"]}%' for m in real_mounts[:3]]) or 'n/a'}

TASK: Write ONE sentence (max 30 words) confirming the server is healthy. 
Do NOT invent problems. Do NOT give warnings. Just confirm status.

Answer:"""
    else:
        prompt = f"""You are a senior Linux/AIX infrastructure analyst. The server below has ACTIVE warnings that need an ACTION PLAN.

SERVER: {server_name}
OS: {metrics.get('os_version','unknown')}
Uptime: {uptime_days} days

MONITORING SYSTEM FINDINGS (trust these, do not reinterpret):
{warn_str}

RAW METRICS (for reference):
- CPU: {cpu_pct}% (load {load1} on {cpu_cores} cores)
- RAM: {ram_pct}% ({ram_used}/{ram_total} MB)
- Disks:
{disk_str}

TOP MEMORY PROCESSES:
{top_mem_str}

TOP CPU PROCESSES:
{top_cpu_str}

Provide EXACTLY this structure (no markdown, no extra sections):

LIKELY CAUSE: <one sentence — most probable reason for the warnings>

TOP RESOURCE CONSUMERS:
- <process name from above with biggest impact> — <what it is>
- <second process>

HOW TO FIX (run these in order):
1. <specific command to diagnose — copy-pasteable>
2. <specific command to free resources or fix>
3. <verification command>

IMMEDIATE ACTION: <one sentence — what operator should do NOW>

Rules:
- Use EXACT mount names from above (like /d02, /archivelog)
- Use EXACT process names from the list above
- If AIX: use AIX commands (svmon, lssrc, lsnrctl)
- If Linux: use Linux commands (systemctl, journalctl, ss, ps)
- Keep total under 180 words
- Reference REAL processes, not generic advice
- If CPU is high: name the top CPU process
- If RAM is high: name the top memory process
- If disk is high: give cleanup commands for that mount

Answer:"""

    result = _call_ollama(prompt, max_tokens=280)
    _cache_set(key, result)
    return result



def analyze_incident(incident, recent_metrics=None):
    """Deep incident analysis with actionable steps."""
    key = f"inc:{incident.get('id')}"
    cached = _cache_get(key)
    if cached: return cached

    dur = int(time.time()) - incident.get("first_detected", int(time.time()))
    dur_str = f"{dur//3600}h {(dur%3600)//60}m" if dur > 3600 else f"{dur//60}m {dur%60}s"

    svc = incident.get('service', 'unknown')
    server = incident.get('server', 'unknown')

    # Build context from recent metrics
    context_lines = []
    if recent_metrics:
        ram = recent_metrics.get("ram", {})
        ram_pct = round(100.0 * ram.get("used_mb", 0) / ram.get("total_mb", 1), 1) if ram.get("total_mb") else 0
        cpu_pct = round(recent_metrics.get("cpu", {}).get("usage_pct", 0), 1)
        uptime_days = recent_metrics.get("uptime_sec", 0) // 86400

        context_lines.append(f"Server CPU: {cpu_pct}%")
        context_lines.append(f"Server RAM: {ram_pct}% ({ram.get('used_mb',0)}/{ram.get('total_mb',0)} MB)")

        mounts = recent_metrics.get("mounts", [])
        real_mounts = [m for m in mounts if not m['mount'].startswith(('/sys','/proc','/dev'))]
        real_mounts.sort(key=lambda m: -m.get('use_pct', 0))
        if real_mounts:
            top_mount = real_mounts[0]
            context_lines.append(f"Top disk: {top_mount['mount']} at {top_mount['use_pct']}%")

        context_lines.append(f"Server uptime: {uptime_days} days")

        # Related services on same server
        svcs = recent_metrics.get("services", [])
        if svcs:
            statuses = ", ".join([f"{s['name']}={s.get('status','?')}" for s in svcs[:6]])
            context_lines.append(f"Other services on this server: {statuses}")

    context = "\n".join(context_lines)

    # Service-specific hints
    svc_hints = ""
    svc_lower = svc.lower()
    if "listener" in svc_lower or "tnslsnr" in svc_lower:
        svc_hints = "This is an Oracle Listener. Common causes: DB not running, listener config issue, port conflict, TNS_ADMIN misconfiguration."
    elif "pmon" in svc_lower or "oracle database" in svc_lower or svc_lower == "pmon":
        svc_hints = "This is Oracle Database. Common causes: ORA-errors in alert log, memory pressure, storage failure, instance crash."
    elif "ebs" in svc_lower or "fndlibr" in svc_lower:
        svc_hints = "This is Oracle EBS Concurrent Manager. Common causes: CM admin down, table space full, invalid request stuck, DB issue."
    elif "ords" in svc_lower:
        svc_hints = "This is Oracle REST Data Services. Common causes: JDBC pool exhausted, DB connection issue, Tomcat crash, config missing."
    elif "mongod" in svc_lower or "mongodb" in svc_lower:
        svc_hints = "This is MongoDB. Common causes: disk full, memory pressure, config issue, replica set failure."
    elif "weblogic" in svc_lower:
        svc_hints = "This is WebLogic. Common causes: admin server down, managed server crash, JDBC pool, deploy issue."
    elif "httpd" in svc_lower:
        svc_hints = "This is Apache HTTPD. Common causes: port conflict, config error, log full, SELinux."
    elif "ssh" in svc_lower:
        svc_hints = "This is SSH daemon. Common causes: config error, port conflict, SELinux, host key issue."
    elif "firewalld" in svc_lower:
        svc_hints = "This is FirewallD. Common causes: config error, iptables conflict, service crash."
    elif "cron" in svc_lower:
        svc_hints = "This is Cron. Common causes: PAM error, log full, syntax error in crontab."

    prompt = f"""You are a senior Linux/AIX infrastructure analyst. A service has gone DOWN and you must give ACTIONABLE guidance.

INCIDENT:
Service: {svc}
Server: {server}
Severity: {incident.get('severity', 'unknown')}
Duration: {dur_str}
Consecutive failures: {incident.get('failure_count', 0)}

SERVER CONTEXT:
{context or 'No recent metrics available'}

{('SPECIFIC HINT: ' + svc_hints) if svc_hints else ''}

Provide EXACTLY this structure (do NOT use markdown, do NOT add extra sections):

LIKELY CAUSE: <one sentence explaining the most probable root cause>

IMMEDIATE CHECKS (run these on the server):
1. <specific command or log file to check>
2. <specific command or log file to check>
3. <specific command or log file to check>

RESOLUTION STEPS:
- <step 1 to fix>
- <step 2 to fix>
- <step 3 to fix>

SERVER-WIDE IMPACT: <whether this is isolated to the service or broader — 1 sentence>

Rules:
- Be SPECIFIC to {svc} on {server}
- Give REAL commands an operator can paste
- If Oracle/AIX-specific, use AIX commands (svmon, lssrc, lsnrctl)
- If Linux, use systemctl, journalctl, ss, netstat
- Keep total under 200 words
- No greetings, no apologies, no disclaimers

Answer:"""

    result = _call_ollama(prompt, max_tokens=300)
    _cache_set(key, result)
    return result



def analyze_trend(server_name, points, range_str):
    """Analyze historical trend from aggregated points."""
    key = f"trend:{server_name}:{range_str}"
    cached = _cache_get(key)
    if cached: return cached

    if not points or len(points) < 3:
        return "Not enough historical data for trend analysis yet. Please wait for more samples."

    cpu_vals = [p.get("cpu", 0) for p in points]
    ram_vals = [p.get("ram", 0) for p in points]
    disk_vals = [p.get("disk", 0) for p in points]

    def stat(vals):
        return f"min={min(vals):.0f}% avg={sum(vals)/len(vals):.0f}% max={max(vals):.0f}%"

    prompt = f"""You are an infrastructure trend analyst. Explain the trend in 3 sentences. Be direct, no markdown.

Server: {server_name}
Range: {range_str} ({len(points)} samples)

CPU:  {stat(cpu_vals)}
RAM:  {stat(ram_vals)}
Disk: {stat(disk_vals)}

First vs last values — CPU: {cpu_vals[0]:.0f}% → {cpu_vals[-1]:.0f}%, RAM: {ram_vals[0]:.0f}% → {ram_vals[-1]:.0f}%, Disk: {disk_vals[0]:.0f}% → {disk_vals[-1]:.0f}%

Explain: direction (rising/stable/declining), any concerning pattern, capacity outlook."""

    result = _call_ollama(prompt, max_tokens=150)
    _cache_set(key, result)
    return result
