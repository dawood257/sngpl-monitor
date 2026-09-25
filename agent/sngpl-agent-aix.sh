#!/bin/ksh
# SNGLP Agent for IBM AIX 7.2 — Perl-based HTTP transport
# No curl/wget required

CONF="/etc/sngpl-agent.conf"
LOG="/var/log/sngpl-agent.log"
[ -f "$CONF" ] || { echo "Missing $CONF"; exit 1; }
. "$CONF"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n'
}

# ---------- CPU % ----------
cpu_pct() {
    vmstat 1 2 2>/dev/null | tail -1 | awk '{print 100-$16}'
}

# ---------- Load avg ----------
load_avg() {
    uptime | sed 's/.*average: //' | awk -F, '{gsub(/ /,""); print $1" "$2" "$3}'
}

# ---------- RAM (svmon -G, pages of 4096 bytes) ----------
ram_json() {
    svmon -G -O unit=MB 2>/dev/null | awk '
      /^memory/ {total=$2; used=$3; free=$4}
      END{
        printf "{\"total_mb\":%d,\"used_mb\":%d,\"free_mb\":%d,\"cached_mb\":0,\"swap_total_mb\":0,\"swap_used_mb\":0}",
               total, used, free
      }'
}

# ---------- Swap ----------
swap_json() {
    lsps -s 2>/dev/null | tail -1 | awk '{
      gsub(/MB/,""); gsub(/%/,"");
      total=$1; used=$2;
      printf "{\"swap_total_mb\":%d,\"swap_used_mb\":%d}", total, total*used/100
    }'
}

# ---------- Disks (df -g gives GB) ----------
mounts_json() {
    df -g 2>/dev/null | awk '
      NR>1 && $2 ~ /^[0-9]/ {
        total=$2; free=$3; used=total-free; pct=$4; gsub(/%/,"",pct);
        mount=$7;
        printf "%s{\"mount\":\"%s\",\"total_gb\":%.2f,\"used_gb\":%.2f,\"avail_gb\":%.2f,\"use_pct\":%d}",
          (n++?",":""), mount, total, used, free, pct
      }' | sed 's/^/[/;s/$/]/'
}

# ---------- Top processes (AIX sort uses +N not -kN) ----------
top_json() {
    ps -eo pid,user,pcpu,pmem,comm 2>/dev/null | awk 'NR>1' | \
    sort -rn +2 | head -15 | awk '
      { printf "%s{\"pid\":%d,\"user\":\"%s\",\"cpu\":%.1f,\"mem\":%.1f,\"cmd\":\"%s\"}",
          (n++?",":""), $1, $2, $3, $4, $5 }
      END{print ""}' | sed 's/^/[/;s/$/]/'
}

# ---------- Network (AIX netstat -in) ----------
network_json() {
    netstat -in 2>/dev/null | awk '
      NR>1 && $1 !~ /^Name/ && $1 != "lo0" && $4 ~ /\./ {
        printf "%s{\"iface\":\"%s\",\"rx_kb\":%d,\"tx_kb\":%d}",
          (n++?",":""), $1, $5/1024, $7/1024
      }' | sed 's/^/[/;s/$/]/'
}

# ---------- Uptime (parse from uptime) ----------
uptime_sec() {
    uptime | sed 's/.*up //;s/,.*//' | awk '
      { d=0; h=0; m=0;
        for(i=1;i<=NF;i++){
          if($i ~ /day/) d=$(i-1);
          if($i ~ /:/){ split($i,t,":"); h=t[1]; m=t[2] }
        }
        print d*86400 + h*3600 + m*60 }'
}

# ---------- OS version ----------
os_version() {
    oslevel -s 2>/dev/null || uname -v
}

# ---------- Build JSON payload ----------
build_payload() {
    CPU=$(cpu_pct)
    LOADS=$(load_avg)
    L1=$(echo $LOADS | awk '{print $1}')
    L5=$(echo $LOADS | awk '{print $2}')
    L15=$(echo $LOADS | awk '{print $3}')
    RAM=$(ram_json); [ -z "$RAM" ] && RAM='{}'
    SWAP=$(swap_json)
    MOUNTS=$(mounts_json); [ -z "$MOUNTS" ] && MOUNTS='[]'
    TOP=$(top_json); [ -z "$TOP" ] && TOP='[]'
    NET=$(network_json); [ -z "$NET" ] && NET='[]'
    UP=$(uptime_sec)
    OV=$(os_version)
    KV=$(uname -v).$(uname -r)
    NM=$(json_escape "$SERVER_NAME")
    OV_ESC=$(json_escape "$OV")
    KV_ESC=$(json_escape "$KV")

    cat <<EOF
{
  "server_name":"$NM",
  "os_type":"AIX",
  "os_version":"$OV_ESC",
  "kernel":"$KV_ESC",
  "uptime_sec":${UP:-0},
  "cpu":{"usage_pct":$CPU,"load_1":${L1:-0},"load_5":${L5:-0},"load_15":${L15:-0}},
  "ram":$RAM,
  "mounts":$MOUNTS,
  "top_cpu":$TOP,
  "top_mem":$TOP,
  "network":$NET,
  "services":[]
}
EOF
}

# ---------- HTTP POST via Perl (no curl/wget needed) ----------
send_perl() {
    PAYLOAD="$1"
    URL="$CENTRAL_URL/api/v1/metrics"
    /usr/bin/perl -e '
        use IO::Socket::INET;
        my ($url, $token, $body) = @ARGV;
        $url =~ m{^http://([^:/]+):?(\d*)(/.*)$};
        my $host = $1;
        my $port = $2 || 80;
        my $path = $3;
        my $len = length($body);
        my $sock = IO::Socket::INET->new(
            PeerAddr => $host, PeerPort => $port,
            Proto => "tcp", Timeout => 5
        ) or die "connect failed: $!";
        print $sock "POST $path HTTP/1.0\r\n";
        print $sock "Host: $host\r\n";
        print $sock "Authorization: Bearer $token\r\n";
        print $sock "Content-Type: application/json\r\n";
        print $sock "Content-Length: $len\r\n";
        print $sock "Connection: close\r\n";
        print $sock "\r\n";
        print $sock $body;
        close $sock;
    ' "$URL" "$TOKEN" "$PAYLOAD" 2>>"$LOG"
}

# ---------- Main loop ----------
log "AIX agent started on $(hostname) as $SERVER_NAME"
while true; do
    PAYLOAD=$(build_payload)
    send_perl "$PAYLOAD"
    sleep "${INTERVAL:-3}"
done
