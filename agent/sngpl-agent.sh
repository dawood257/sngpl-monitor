#!/bin/sh
# SNGLP Agent - POSIX shell (RHEL + AIX)
# Installs on: /opt/sngpl-agent/sngpl-agent.sh

CONF="/etc/sngpl-agent.conf"
LOG="/var/log/sngpl-agent.log"
[ -f "$CONF" ] || { echo "Missing $CONF"; exit 1; }
. "$CONF"

OS=$(uname -s)

# ---------- helpers ----------
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
      -e 's/\t/ /g' | tr -d '\r\n'
}

# ---------- CPU ----------
cpu_pct() {
    if [ "$OS" = "Linux" ]; then
        set -- $(awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8}' /proc/stat)
        idle1=$4; total1=0; for v in "$@"; do total1=$((total1+v)); done
        sleep 1
        set -- $(awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8}' /proc/stat)
        idle2=$4; total2=0; for v in "$@"; do total2=$((total2+v)); done
        dt=$((total2-total1)); di=$((idle2-idle1))
        [ "$dt" -le 0 ] && { echo "0"; return; }
        awk "BEGIN{printf \"%.1f\", (1 - $di/$dt)*100}"
    else  # AIX
        vmstat 1 2 | tail -1 | awk '{print 100-$16}'
    fi
}

load_avg() {
    uptime | awk -F'load average[s]*: ' '{print $2}' | awk -F, '{gsub(/ /,""); print $1,$2,$3}'
}

# ---------- RAM ----------
ram_json() {
    if [ "$OS" = "Linux" ]; then
        awk '
          /^MemTotal:/     {t=$2}
          /^MemFree:/      {f=$2}
          /^MemAvailable:/ {a=$2}
          /^Buffers:/      {b=$2}
          /^Cached:/        {c=$2}
          /^SwapTotal:/    {st=$2}
          /^SwapFree:/     {sf=$2}
          END{
            used=t-a;
            printf "{\"total_mb\":%d,\"used_mb\":%d,\"free_mb\":%d,\"cached_mb\":%d,\"swap_total_mb\":%d,\"swap_used_mb\":%d}",
              t/1024, used/1024, a/1024, (b+c)/1024, st/1024, (st-sf)/1024
          }' /proc/meminfo
    else  # AIX - svmon -G (pages of 4096)
        svmon -G -O unit=MB 2>/dev/null | awk '
          /^memory/ {total=$2; used=$3; free=$4}
          END{printf "{\"total_mb\":%d,\"used_mb\":%d,\"free_mb\":%d,\"cached_mb\":0,\"swap_total_mb\":0,\"swap_used_mb\":0}",
               total, used, free}'
    fi
}

# ---------- Disks ----------
mounts_json() {
    if [ "$OS" = "Linux" ]; then
        df -kP 2>/dev/null | awk 'NR>1 && $2>0 && $1!="tmpfs" && $1!="devtmpfs" {
            total=$2/1024/1024; used=$3/1024/1024; avail=$4/1024/1024; pct=$5; gsub(/%/,"",pct);
            printf "%s{\"mount\":\"%s\",\"total_gb\":%.1f,\"used_gb\":%.1f,\"avail_gb\":%.1f,\"use_pct\":%d}",
              (n++?",":""), $6, total, used, avail, pct
        }' | sed 's/^/[/;s/$/]/'
    else  # AIX df -g gives GB
        df -g 2>/dev/null | awk 'NR>1 && $2>0 {
            pct=$4; gsub(/%/,"",pct);
            printf "%s{\"mount\":\"%s\",\"total_gb\":%.1f,\"used_gb\":%.1f,\"avail_gb\":%.1f,\"use_pct\":%d}",
              (n++?",":""), $7, $2, $3, $4?$4:0, pct
        }' | sed 's/^/[/;s/$/]/'
    fi
}

# ---------- Top processes ----------
top_json() {
    if [ "$OS" = "Linux" ]; then
        ps -eo pid,user,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -16 | awk '
          NR>1 {gsub(/"/,"",$5); printf "%s{\"pid\":%d,\"user\":\"%s\",\"cpu\":%.1f,\"mem\":%.1f,\"cmd\":\"%s\"}",
                 (n++?",":""), $1, $2, $3, $4, $5}
          END{print ""}' | sed 's/^/[/;s/$/]/'
    else  # AIX - ps columns differ
        ps -eo pid,user,pcpu,pmem,comm 2>/dev/null | head -16 | awk '
          NR>1 {gsub(/"/,"",$5); printf "%s{\"pid\":%d,\"user\":\"%s\",\"cpu\":%.1f,\"mem\":%.1f,\"cmd\":\"%s\"}",
                 (n++?",":""), $1, $2, $3, $4, $5}
          END{print ""}' | sed 's/^/[/;s/$/]/'
    fi
}

# ---------- Network ----------
network_json() {
    if [ "$OS" = "Linux" ]; then
        awk 'NR>2 {
          split($1,a,":"); iface=a[1];
          if (iface=="lo") next;
          printf "%s{\"iface\":\"%s\",\"rx_kb\":%d,\"tx_kb\":%d}", (n++?",":""), iface, $2/1024, $10/1024
        } END{print ""}' /proc/net/dev | sed 's/^/[/;s/$/]/'
    else
        netstat -in 2>/dev/null | awk 'NR>1 && $1!="Name" && $1!="lo0" {
          printf "%s{\"iface\":\"%s\",\"rx_kb\":%d,\"tx_kb\":%d}", (n++?",":""), $1, $5/1024, $7/1024
        } END{print ""}' | sed 's/^/[/;s/$/]/'
    fi
}

# ---------- Uptime ----------
uptime_sec() {
    if [ "$OS" = "Linux" ]; then
        cut -d. -f1 /proc/uptime
    else
        # AIX: parse from uptime human string -> approx
        uptime | sed 's/.*up //;s/,.*//' | awk '
          {d=0;h=0;m=0;
           for(i=1;i<=NF;i++){
             if($i ~ /day/) d=$(i-1);
             if($i ~ /:/){split($i,t,":"); h=t[1]; m=t[2]}
           }
           print d*86400 + h*3600 + m*60}'
    fi
}

# ---------- OS info ----------
os_version() {
    if [ "$OS" = "Linux" ]; then
        ( . /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" ) || cat /etc/redhat-release 2>/dev/null || echo "Linux"
    else
        oslevel -s 2>/dev/null || uname -v
    fi
}

# ---------- Build payload ----------
build_payload() {
    CPU=$(cpu_pct)
    read L1 L5 L15 <<EOF
$(load_avg | tr ' ' '\n' | head -3 | tr '\n' ' ')
EOF
    L1=${L1:-0}; L5=${L5:-0}; L15=${L15:-0}
    RAM=$(ram_json); [ -z "$RAM" ] && RAM='{}'
    MOUNTS=$(mounts_json); [ -z "$MOUNTS" ] && MOUNTS='[]'
    TOP=$(top_json); [ -z "$TOP" ] && TOP='[]'
    NET=$(network_json); [ -z "$NET" ] && NET='[]'
    UP=$(uptime_sec)
    OV=$(os_version)
    KV=$(uname -r)
    NAME_ESC=$(json_escape "$SERVER_NAME")
    OV_ESC=$(json_escape "$OV")
    KV_ESC=$(json_escape "$KV")

    cat <<EOF
{
  "server_name":"$NAME_ESC",
  "os_type":"$OS",
  "os_version":"$OV_ESC",
  "kernel":"$KV_ESC",
  "uptime_sec":${UP:-0},
  "cpu":{"usage_pct":$CPU,"load_1":$L1,"load_5":$L5,"load_15":$L15},
  "ram":$RAM,
  "mounts":$MOUNTS,
  "top_cpu":$TOP,
  "top_mem":$TOP,
  "network":$NET,
  "services":[]
}
EOF
}

# ---------- Send ----------
send() {
    PAYLOAD=$(build_payload)
    if command -v curl >/dev/null 2>&1; then
        curl -sS -m 5 -X POST "$CENTRAL_URL/api/v1/metrics" \
             -H "Authorization: Bearer $TOKEN" \
             -H "Content-Type: application/json" \
             -d "$PAYLOAD" >/dev/null 2>&1
    elif command -v wget >/dev/null 2>&1; then
        echo "$PAYLOAD" > /tmp/.sngpl-payload.$$
        wget -q -T 5 -O /dev/null \
             --header="Authorization: Bearer $TOKEN" \
             --header="Content-Type: application/json" \
             --post-file=/tmp/.sngpl-payload.$$ \
             "$CENTRAL_URL/api/v1/metrics" 2>/dev/null
        rm -f /tmp/.sngpl-payload.$$
    fi
}

# ---------- Main loop ----------
log "SNGLP agent started on $OS as $SERVER_NAME"
while true; do
    send
    sleep "${INTERVAL:-3}"
done
