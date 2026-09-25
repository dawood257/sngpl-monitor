#!/bin/sh
SELF_DIR=$(cd "$(dirname "$0")" && pwd)
CONF="$SELF_DIR/agent.conf"
LOG="$SELF_DIR/agent.log"
[ -f "$CONF" ] || { echo "Missing $CONF"; exit 1; }
. "$CONF"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

cpu_pct() {
  set -- $(awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8}' /proc/stat)
  idle1=$4; total1=0; for v in "$@"; do total1=$((total1+v)); done
  sleep 1
  set -- $(awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8}' /proc/stat)
  idle2=$4; total2=0; for v in "$@"; do total2=$((total2+v)); done
  dt=$((total2-total1)); di=$((idle2-idle1))
  [ "$dt" -le 0 ] && { echo "0"; return; }
  awk "BEGIN{printf \"%.1f\", (1 - $di/$dt)*100}"
}

ram_json() {
  awk '
    /^MemTotal:/     {t=$2}
    /^MemFree:/      {f=$2}
    /^MemAvailable:/ {a=$2}
    /^Buffers:/      {b=$2}
    /^Cached:/       {c=$2}
    /^SwapTotal:/    {st=$2}
    /^SwapFree:/     {sf=$2}
    END{
      used=t-a;
      printf "{\"total_mb\":%d,\"used_mb\":%d,\"free_mb\":%d,\"cached_mb\":%d,\"swap_total_mb\":%d,\"swap_used_mb\":%d}",
        t/1024, used/1024, a/1024, (b+c)/1024, st/1024, (st-sf)/1024
    }' /proc/meminfo
}

mounts_json() {
  df -kP 2>/dev/null | awk 'NR>1 && $2>0 && $1!="tmpfs" && $1!="devtmpfs" && $1!="overlay" {
    total=$2/1024/1024; used=$3/1024/1024; avail=$4/1024/1024; pct=$5; gsub(/%/,"",pct);
    printf "%s{\"mount\":\"%s\",\"total_gb\":%.1f,\"used_gb\":%.1f,\"avail_gb\":%.1f,\"use_pct\":%d}",
      (n++?",":""), $6, total, used, avail, pct
  }' | sed 's/^/[/;s/$/]/'
}

top_json() {
  ps -eo pid,user,pcpu,pmem,args --sort=-pcpu 2>/dev/null | head -16 | awk '
    NR>1 {
      cmd="";
      for(i=5;i<=NF;i++) cmd=cmd (i>5?" ":"") $i;
      if(length(cmd)>80) cmd=substr(cmd,1,80);
      gsub(/"/,"",cmd);
      printf "%s{\"pid\":%d,\"user\":\"%s\",\"cpu\":%.1f,\"mem\":%.1f,\"cmd\":\"%s\"}",
        (n++?",":""), $1, $2, $3, $4, cmd
    }
    END{print ""}' | sed 's/^/[/;s/$/]/'
}

network_json() {
  awk 'NR>2 {
    split($1,a,":"); iface=a[1];
    if (iface=="lo") next;
    printf "%s{\"iface\":\"%s\",\"rx_kb\":%d,\"tx_kb\":%d}", (n++?",":""), iface, $2/1024, $10/1024
  } END{print ""}' /proc/net/dev | sed 's/^/[/;s/$/]/'
}

uptime_sec() { cut -d. -f1 /proc/uptime; }

# ────── SERVICE CHECKS (read-only) ──────
check_one_service() {
  local name="$1"
  local type="$2"
  local chk="$3"
  local status="unknown"
  local t_start=$(date +%s%N 2>/dev/null || date +%s)
  local t_end
  local resp_ms=0

  case "$type" in
    systemd)
      if command -v systemctl >/dev/null 2>&1; then
        if systemctl is-active --quiet "$chk" 2>/dev/null; then
          status="running"
        else
          if systemctl list-unit-files "$chk.service" 2>/dev/null | grep -q "$chk"; then
            status="down"
          else
            status="unknown"
          fi
        fi
      fi
      ;;
    process)
      if pgrep -f "$chk" >/dev/null 2>&1; then
        status="running"
      else
        status="down"
      fi
      ;;
    port)
      if command -v ss >/dev/null 2>&1; then
        if ss -tlnp 2>/dev/null | grep -q ":$chk "; then
          status="running"
        else
          status="down"
        fi
      fi
      ;;
    *)
      status="unknown"
      ;;
  esac

  t_end=$(date +%s%N 2>/dev/null || date +%s)
  if [ "$t_start" != "$t_end" ]; then
    resp_ms=$(( (t_end - t_start) / 1000000 ))
  fi

  printf '{"name":"%s","type":"%s","check":"%s","status":"%s","response_ms":%d}' \
    "$name" "$type" "$chk" "$status" "$resp_ms"
}

services_json() {
  [ -z "$SERVICES" ] && { echo "[]"; return; }
  local first=1
  local result="["
  local IFS=';'
  for entry in $SERVICES; do
    local name=$(echo "$entry" | cut -d'|' -f1)
    local type=$(echo "$entry" | cut -d'|' -f2)
    local chk=$(echo "$entry" | cut -d'|' -f3)
    [ -z "$name" ] && continue
    [ $first -eq 0 ] && result="$result,"
    result="$result$(check_one_service "$name" "$type" "$chk")"
    first=0
  done
  result="$result]"
  echo "$result"
}

machine_json() {
  local cpu_model=$(grep "model name" /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | sed 's/^ *//' | sed 's/"/\\"/g')
  local cpu_cores=$(nproc 2>/dev/null || grep -c "^processor" /proc/cpuinfo)
  local arch=$(uname -m)
  local mmodel=""
  local mserial=""
  local mmanufacturer=""
  
  # Try DMI (non-root works via /sys, root via dmidecode)
  if [ -r /sys/devices/virtual/dmi/id/product_name ]; then
    mmodel=$(cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null | tr -d '"')
  fi
  if [ -r /sys/devices/virtual/dmi/id/product_serial ]; then
    mserial=$(cat /sys/devices/virtual/dmi/id/product_serial 2>/dev/null | tr -d '"')
  fi
  if [ -r /sys/devices/virtual/dmi/id/sys_vendor ]; then
    mmanufacturer=$(cat /sys/devices/virtual/dmi/id/sys_vendor 2>/dev/null | tr -d '"')
  fi
  
  # Fallback to dmidecode if /sys not readable
  if [ -z "$mserial" ] || [ "$mserial" = "None" ] || [ "$mserial" = "Not Specified" ]; then
    if command -v dmidecode >/dev/null 2>&1; then
      mserial=$(dmidecode -s system-serial-number 2>/dev/null | head -1)
      [ -z "$mmodel" ] && mmodel=$(dmidecode -s system-product-name 2>/dev/null | head -1)
      [ -z "$mmanufacturer" ] && mmanufacturer=$(dmidecode -s system-manufacturer 2>/dev/null | head -1)
    fi
  fi
  
  # Cleanup
  [ -z "$mmodel" ] && mmodel="unknown"
  [ -z "$mserial" ] && mserial="unknown"
  [ -z "$mmanufacturer" ] && mmanufacturer="unknown"
  
  # Primary IP (route based, not 127.0.0.1)
  local ip=""
  ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
  [ -z "$ip" ] && ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -z "$ip" ] && ip="unknown"
  
  printf '{"cpu_model":"%s","cpu_cores":%d,"arch":"%s","machine_model":"%s","serial":"%s","manufacturer":"%s","ip":"%s"}' \
    "$cpu_model" "${cpu_cores:-0}" "$arch" "$mmodel" "$mserial" "$mmanufacturer" "$ip"
}

users_json() {
  local active_list=$(who 2>/dev/null | awk '{print $1}' | sort -u)
  local first=1

  # Use getent so LDAP/AD/SSSD users included
  printf "["
  getent passwd 2>/dev/null | awk -F: '
    $3 >= 1000 && $7 !~ /nologin|false|sync|shutdown|halt/ {
      print $1
    }
  ' | sort -u | while IFS= read -r user; do
    [ -z "$user" ] && continue
    local is_active=0
    echo "$active_list" | grep -qxF "$user" && is_active=1
    [ $first -eq 0 ] && printf ","
    printf '{"name":"%s","active":%s}' "$user" "$([ $is_active -eq 1 ] && echo true || echo false)"
    first=0
  done
  printf "]"
}

ssh_sessions_json() {
  who 2>/dev/null | awk '
    BEGIN { printf "["; first=1 }
    {
      user = $1; tty = $2
      login_time = $0
      sub(/^[ \t]*[^ \t]+[ \t]+[^ \t]+[ \t]+/, "", login_time)
      sub(/[ \t]*\(.*$/, "", login_time)
      gsub(/[ \t]+$/, "", login_time)

      # Normalize domain prefix: SNGPL\\user -> user@SNGPL (or keep as-is)
      if (user ~ /\\/) {
        # Windows-style DOMAIN\user -> user (display without backslash for JSON safety)
        sub(/^.*\\/, "", user)
      }

      src_ip = ""
      if (match($0, /\([^)]+\)/)) src_ip = substr($0, RSTART+1, RLENGTH-2)

      if (src_ip == "" || src_ip !~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) next

      if (!first) printf ","
      printf "{\"user\":\"%s\",\"tty\":\"%s\",\"source_ip\":\"%s\",\"login_time\":\"%s\",\"type\":\"SSH\"}", user, tty, src_ip, login_time
      first = 0
    }
    END { printf "]" }
  '
}


build_payload() {
  CPU=$(cpu_pct)
  L=$(awk '{print $1" "$2" "$3}' /proc/loadavg)
  L1=$(echo "$L" | awk '{print $1}')
  L5=$(echo "$L" | awk '{print $2}')
  L15=$(echo "$L" | awk '{print $3}')
  RAM=$(ram_json); [ -z "$RAM" ] && RAM='{}'
  MOUNTS=$(mounts_json); [ -z "$MOUNTS" ] && MOUNTS='[]'
  TOP=$(top_json); [ -z "$TOP" ] && TOP='[]'
  NET=$(network_json); [ -z "$NET" ] && NET='[]'
  UP=$(uptime_sec)
  OV=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"')
  KV=$(uname -r)
  SVC=$(services_json); [ -z "$SVC" ] && SVC='[]'
  cat <<EOJSON
{"server_name":"$SERVER_NAME","os_type":"Linux","os_version":"$OV","kernel":"$KV","uptime_sec":${UP:-0},"cpu":{"usage_pct":$CPU,"load_1":${L1:-0},"load_5":${L5:-0},"load_15":${L15:-0}},"ram":$RAM,"mounts":$MOUNTS,"top_cpu":$TOP,"top_mem":$TOP,"network":$NET,"services":$SVC,"machine":$(machine_json),"active_users":$(users_json),"ssh_sessions":$(ssh_sessions_json)}
EOJSON
}

send() {
  PAYLOAD=$(build_payload)
  curl -k -sS -m 5 -X POST "$CENTRAL_URL/api/v1/metrics" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" >/dev/null 2>>"$LOG"
}

log "SNGLP agent started on $(hostname) as $SERVER_NAME"
while true; do
  send
  sleep "${INTERVAL:-3}"
done

# ══════ MACHINE + USERS (appended — Phase 6) ══════


# ══════ SSH SESSIONS (Phase 1) ══════
