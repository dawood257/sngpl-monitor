#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SNGPL Monitoring — Add New Server Helper
#  Usage: ./add-server.sh
#     or: ./add-server.sh --name rdr-ebs-02 --ip 172.21.110.140 \
#                        --user oracle --port 1010 --os rhel
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Config ───
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CENTRAL_URL="https://127.0.0.1:3000"
CENTRAL_IP="172.21.110.135"
TOKEN_FILE="data/agent_tokens.json"

# ─── Colors ───
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[0;34m'; N='\033[0m'

log()   { echo -e "${B}[*]${N} $*"; }
ok()    { echo -e "${G}[✓]${N} $*"; }
warn()  { echo -e "${Y}[!]${N} $*"; }
err()   { echo -e "${R}[✗]${N} $*"; }
die()   { err "$*"; exit 1; }

# ─── Args ───
NAME=""; IP=""; USER=""; PORT=""; OS=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name) NAME="$2"; shift 2;;
        --ip)   IP="$2"; shift 2;;
        --user) USER="$2"; shift 2;;
        --port) PORT="$2"; shift 2;;
        --os)   OS="$2"; shift 2;;
        -h|--help)
            echo "Usage: $0 [--name NAME] [--ip IP] [--user USER] [--port PORT] [--os rhel|aix]"
            exit 0;;
        *) die "Unknown arg: $1";;
    esac
done

# ─── Interactive prompts (jo missing hai) ───
clear
echo "═══════════════════════════════════════════════════════════════"
echo "  SNGPL Monitoring — Add New Server"
echo "═══════════════════════════════════════════════════════════════"
echo ""

[ -z "$OS" ] && {
    echo "Server type:"
    echo "  1) RHEL / Oracle Linux"
    echo "  2) AIX"
    read -rp "Select [1/2]: " _os
    case "$_os" in
        1) OS="rhel";;
        2) OS="aix";;
        *) die "Invalid selection";;
    esac
}

[ -z "$NAME" ] && { read -rp "Server name (hostname -s) [e.g. rdr-ebs-02]: " NAME; }
[ -z "$IP" ]   && { read -rp "Server IP: " IP; }
[ -z "$USER" ] && { read -rp "SSH user [oracle]: " USER; USER="${USER:-oracle}"; }
[ -z "$PORT" ] && {
    if [ "$OS" = "aix" ]; then DEF_PORT=1001; else DEF_PORT=1010; fi
    read -rp "SSH port [$DEF_PORT]: " PORT
    PORT="${PORT:-$DEF_PORT}"
}

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "  Name: $NAME"
echo "  IP:   $IP"
echo "  User: $USER"
echo "  Port: $PORT"
echo "  OS:   $OS"
echo "───────────────────────────────────────────────────────────────"
read -rp "Proceed? [y/N]: " _go
[[ "$_go" =~ ^[Yy]$ ]] || die "Cancelled"

# ═══════════════════════════════════════════════════════════════
#  STEP 1 — Token Generate
# ═══════════════════════════════════════════════════════════════
echo ""
log "STEP 1 — Generating token..."

mkdir -p data
[ -f "$TOKEN_FILE" ] || echo '{}' > "$TOKEN_FILE"

TOKEN=$(python3 <<EOFPY
import json, secrets
f = "$TOKEN_FILE"
name = "$NAME"
try:
    t = json.load(open(f))
except:
    t = {}
if name in t and t[name]:
    print(t[name])
else:
    tok = secrets.token_urlsafe(32)
    t[name] = tok
    json.dump(t, open(f, "w"), indent=2)
    print(tok)
EOFPY
)

[ -z "$TOKEN" ] && die "Token generation failed"
ok "Token: ${TOKEN:0:20}...${TOKEN: -6}"

# ═══════════════════════════════════════════════════════════════
#  STEP 2 — Pick agent file
# ═══════════════════════════════════════════════════════════════
if [ "$OS" = "aix" ]; then
    AGENT_FILE="dist-files/agent-aix.sh"
    AGENT_DEST_NAME="agent-aix.sh"
else
    AGENT_FILE="dist-files/agent.sh"
    AGENT_DEST_NAME="agent.sh"
fi

[ -f "$AGENT_FILE" ] || die "Agent file not found: $AGENT_FILE"
ok "Using agent: $AGENT_FILE"

# ═══════════════════════════════════════════════════════════════
#  STEP 3 — Send agent file
# ═══════════════════════════════════════════════════════════════
echo ""
log "STEP 3 — Sending agent to $IP (port $PORT)..."

# Try SCP first
SCP_OK=0
scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
    -P "$PORT" "$AGENT_FILE" "$USER@$IP:/tmp/$AGENT_DEST_NAME" \
    && SCP_OK=1

if [ $SCP_OK -eq 0 ]; then
    warn "SCP failed, trying cat-pipe fallback..."
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p "$PORT" \
        "$USER@$IP" "cat > /tmp/$AGENT_DEST_NAME" < "$AGENT_FILE" \
        && SCP_OK=1
fi

if [ $SCP_OK -eq 0 ]; then
    warn "SSH blocked. Use HTTP pull method on server console:"
    echo ""
    echo "  1) Central pe copy:"
    cp "$AGENT_FILE" "frontend/agent-new-$NAME.sh"
    chmod 644 "frontend/agent-new-$NAME.sh"
    echo "     curl -k -s -o /dev/null -w 'HTTP %{http_code}\\n' $CENTRAL_URL/agent-new-$NAME.sh"
    echo ""
    echo "  2) Server console me:"
    echo "     cd \$HOME/sngpl-agent"
    if [ "$OS" = "aix" ]; then
        echo "     /usr/bin/perl -e 'use IO::Socket::SSL; my \$s=IO::Socket::SSL->new(PeerHost=>\"$CENTRAL_IP\",PeerPort=>3000,SSL_verify_mode=>0x00,Timeout=>15) or die; print \$s \"GET /agent-new-$NAME.sh HTTP/1.0\\r\\nHost: $CENTRAL_IP\\r\\n\\r\\n\"; local \$/; my \$r=<\$s>; close \$s; \$r =~ s/^.*?\\r?\\n\\r?\\n//s; open(my \$fh, \">\", \"agent.sh\"); print \$fh \$r; close \$fh;'"
    else
        echo "     curl -k -o agent.sh $CENTRAL_URL/agent-new-$NAME.sh"
    fi
    echo ""
    echo "  3) Config banao:"
    echo "     cat > agent.conf <<EOF"
    echo "CENTRAL_URL=$CENTRAL_URL"
    echo "SERVER_NAME=$NAME"
    echo "TOKEN=$TOKEN"
    echo "EOF"
    echo "     chmod 600 agent.conf"
    echo ""
    echo "  4) Start:"
    if [ "$OS" = "aix" ]; then
        echo "     nohup ksh agent.sh > /dev/null 2>&1 &"
    else
        echo "     setsid nohup sh agent.sh > /dev/null 2>&1 < /dev/null &"
    fi
    exit 0
fi

ok "Agent sent to /tmp/$AGENT_DEST_NAME"

# ═══════════════════════════════════════════════════════════════
#  STEP 4 — Remote install
# ═══════════════════════════════════════════════════════════════
echo ""
log "STEP 4 — Installing on remote server (may ask password again)..."

if [ "$OS" = "aix" ]; then
    # AIX install
    ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$IP" bash <<EOA
set -e
mkdir -p \$HOME/sngpl-agent
cd \$HOME/sngpl-agent

# Kill old
for r in 1 2 3; do
  for PID in \$(ps -ef | grep "ksh agent.sh" | grep -v grep | awk '{print \$2}'); do
    kill -9 \$PID 2>/dev/null || true
  done
  sleep 1
done

# Install
cp /tmp/$AGENT_DEST_NAME agent.sh
chmod 755 agent.sh

# Config
cat > agent.conf <<EOCONF
CENTRAL_URL=$CENTRAL_URL
SERVER_NAME=$NAME
TOKEN=$TOKEN
EOCONF
chmod 600 agent.conf

# Syntax
/usr/bin/ksh -n agent.sh || { echo "SYNTAX FAIL"; exit 1; }

# Start
> agent.log
nohup ksh agent.sh > /dev/null 2>&1 &
echo \$! > agent.pid
sleep 8
echo "--- Log ---"
tail -3 agent.log
echo "--- Process ---"
ps -ef | grep "agent.sh" | grep -v grep | head -2
EOA
else
    # RHEL install
    ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$IP" bash <<EOR
set -e
mkdir -p \$HOME/sngpl-agent
cd \$HOME/sngpl-agent

# Kill old
for r in 1 2 3; do
  for PID in \$(ps -ef | grep "sh agent.sh" | grep -v grep | awk '{print \$2}'); do
    kill -9 \$PID 2>/dev/null || true
  done
  sleep 1
done

# Install
cp /tmp/$AGENT_DEST_NAME agent.sh
chmod 755 agent.sh

# Config
cat > agent.conf <<EOCONF
CENTRAL_URL=$CENTRAL_URL
SERVER_NAME=$NAME
TOKEN=$TOKEN
EOCONF
chmod 600 agent.conf

# Syntax
bash -n agent.sh || { echo "SYNTAX FAIL"; exit 1; }

# Start
> agent.log
setsid nohup sh agent.sh > /dev/null 2>&1 < /dev/null &
sleep 6
echo "--- Log ---"
tail -3 agent.log
echo "--- Process ---"
ps -ef | grep "sh agent.sh" | grep -v grep | head -2
EOR
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 5 — Verify from central
# ═══════════════════════════════════════════════════════════════
echo ""
log "STEP 5 — Waiting 30s for first metrics..."
sleep 30

TOKEN_API=$(curl -k -s -X POST $CENTRAL_URL/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"Admin@2026"}' | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

if [ -z "$TOKEN_API" ]; then
    warn "API login failed — verify manually"
    exit 0
fi

curl -k -s "$CENTRAL_URL/api/v1/servers" -H "Authorization: Bearer $TOKEN_API" | \
python3 -c "
import sys, json
d = json.load(sys.stdin)
name = '$NAME'
found = False
for s in d.get('data', []):
    if s.get('name') == name:
        found = True
        st = s.get('status','?')
        mark = '🟢' if st=='online' else '🔴'
        m = s.get('machine', {})
        print(f'  {mark} {name} | {st} | age: {s.get(\"age_sec\",\"?\")}s')
        print(f'     CPU: {m.get(\"cpu_model\",\"?\")}')
        print(f'     IP:  {m.get(\"ip\",\"?\")}')
        print(f'     Serial: {m.get(\"serial\",\"?\")}')
        break
if not found:
    print(f'  ⚠ {name} not yet in server list — may need a few more seconds')
    print(f'     Try: curl -k $CENTRAL_URL/api/v1/servers')
"

echo ""
ok "═══════════════════════════════════════════════════════════════"
ok "  Done! Server '$NAME' added."
ok "  Open dashboard → refresh → check it appears."
ok "═══════════════════════════════════════════════════════════════"
