#!/bin/ksh
SELF_DIR=$(dirname "$0")
CONF="$SELF_DIR/agent.conf"
LOG="$SELF_DIR/agent.log"
[ -f "$CONF" ] || { echo "Missing $CONF"; exit 1; }
. "$CONF"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

cpu_pct() { vmstat 1 2 2>/dev/null | tail -1 | awk '{print 100-$16}'; }

load_avg() {
  uptime | sed 's/.*average: //' | awk -F, '{gsub(/ /,""); print $1" "$2" "$3}'
}

ram_json() {
  svmon -G -O unit=MB 2>/dev/null | awk '/^memory/{printf "{\"total_mb\":%d,\"used_mb\":%d,\"free_mb\":%d,\"cached_mb\":0,\"swap_total_mb\":0,\"swap_used_mb\":0}", $2,$3,$4}'
}

mounts_json() {
  df -g 2>/dev/null | awk '
    NR>1 && $2 ~ /^[0-9]/ {
      t=$2; f=$3; u=t-f; p=$4; gsub(/%/,"",p);
      printf "%s{\"mount\":\"%s\",\"total_gb\":%.2f,\"used_gb\":%.2f,\"avail_gb\":%.2f,\"use_pct\":%d}",
        (n++?",":""), $7, t, u, f, p
    }' | sed 's/^/[/;s/$/]/'
}

top_json() {
  ps -eo pid,user,pcpu,pmem,args 2>/dev/null | awk 'NR>1' | \
  sort -rn +2 | head -15 | awk '
    {
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
  netstat -in 2>/dev/null | awk '
    NR>1 && $1 !~ /^Name/ && $1 != "lo0" && $4 ~ /\./ {
      printf "%s{\"iface\":\"%s\",\"rx_kb\":%d,\"tx_kb\":%d}",
        (n++?",":""), $1, $5/1024, $7/1024
    }' | sed 's/^/[/;s/$/]/'
}

uptime_sec() {
  uptime | sed 's/.*up //;s/,.*//' | awk '
    { d=0; h=0; m=0;
      for(i=1;i<=NF;i++){
        if($i ~ /day/) d=$(i-1);
        if($i ~ /:/){ split($i,t,":"); h=t[1]; m=t[2] }
      }
      print d*86400 + h*3600 + m*60 }'
}

# ────── SERVICE CHECKS (read-only) ──────
check_one_service_aix() {
  NAME="$1"
  TYPE="$2"
  CHK="$3"
  STATUS="unknown"
  T_START=$(date +%s 2>/dev/null || echo 0)

  case "$TYPE" in
    aix_src)
      if command -v lssrc >/dev/null 2>&1; then
        OUT=$(lssrc -s "$CHK" 2>/dev/null | tail -1)
        if echo "$OUT" | grep -q "active"; then
          STATUS="running"
        elif echo "$OUT" | grep -q "inoperative"; then
          STATUS="down"
        else
          STATUS="unknown"
        fi
      fi
      ;;
    process)
      if ps -ef 2>/dev/null | grep -v grep | grep -q "$CHK"; then
        STATUS="running"
      else
        STATUS="down"
      fi
      ;;
    port)
      if netstat -An 2>/dev/null | grep LISTEN | grep -q "\.$CHK "; then
        STATUS="running"
      else
        STATUS="down"
      fi
      ;;
  esac

  T_END=$(date +%s 2>/dev/null || echo 0)
  RESP_MS=$(( (T_END - T_START) * 1000 ))
  [ $RESP_MS -lt 0 ] && RESP_MS=0

  printf '{"name":"%s","type":"%s","check":"%s","status":"%s","response_ms":%d}' \
    "$NAME" "$TYPE" "$CHK" "$STATUS" "$RESP_MS"
}

services_json() {
  [ -z "$SERVICES" ] && { echo "[]"; return; }
  FIRST=1
  RESULT="["
  OLDIFS="$IFS"
  IFS=';'
  for entry in $SERVICES; do
    IFS="$OLDIFS"
    NAME=$(echo "$entry" | cut -d'|' -f1)
    TYPE=$(echo "$entry" | cut -d'|' -f2)
    CHK=$(echo "$entry" | cut -d'|' -f3)
    [ -z "$NAME" ] && { IFS=';'; continue; }
    [ $FIRST -eq 0 ] && RESULT="$RESULT,"
    RESULT="$RESULT$(check_one_service_aix "$NAME" "$TYPE" "$CHK")"
    FIRST=0
    IFS=';'
  done
  IFS="$OLDIFS"
  RESULT="$RESULT]"
  echo "$RESULT"
}

machine_json() {
  local cpu_model=$(lsattr -El proc0 -a type 2>/dev/null | awk '{print $2}')
  local cpu_cores=$(lsdev -Cc processor 2>/dev/null | wc -l)
  local arch=$(uname -p)
  
  # Machine model (IBM,XXXX-XXX)
  local mmodel=$(uname -M)
  
  # Serial number - AIX uses system ID
  local mserial=""
  mserial=$(uname -u 2>/dev/null)
  if [ -z "$mserial" ]; then
    # Try lscfg
    mserial=$(lscfg 2>/dev/null | grep -i "System" | awk '{print $2}' | head -1)
  fi
  
  # Manufacturer
  local mmanufacturer="IBM"
  
  # CPU clock speed
  local cpu_speed=$(lsattr -El proc0 2>/dev/null | grep -i "frequency" | awk '{print $2}')
  
  # System firmware
  local fw=$(lsmcode -A 2>/dev/null | head -1)
  
  # Primary IP
  local ip=""
  ip=$(ifconfig -a 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}' | head -1)
  [ -z "$ip" ] && ip="unknown"
  
  # Cleanup
  [ -z "$mmodel" ] && mmodel="unknown"
  [ -z "$mserial" ] && mserial="unknown"
  [ -z "$cpu_model" ] && cpu_model="unknown"
  
  printf '{"cpu_model":"%s","cpu_cores":%d,"arch":"%s","machine_model":"%s","serial":"%s","manufacturer":"%s","cpu_speed":"%s","firmware":"%s","ip":"%s"}' \
    "$cpu_model" "${cpu_cores:-0}" "$arch" "$mmodel" "$mserial" "$mmanufacturer" "${cpu_speed:-unknown}" "${fw:-unknown}" "$ip"
}

users_json() {
  local active_list=$(who 2>/dev/null | awk '{print $1}' | sort -u)
  local first=1

  # Try getent first (LDAP-aware), fallback to /etc/passwd
  local src=""
  if command -v getent >/dev/null 2>&1; then
    src="getent passwd"
  else
    src="cat /etc/passwd"
  fi

  printf "["
  $src 2>/dev/null | awk -F: '
    $3 >= 200 && $7 !~ /nologin|false|\/bin\/sync|shutdown|halt/ {
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

      host = ""
      if (match($0, /\([^)]+\)/)) host = substr($0, RSTART+1, RLENGTH-2)

      src_ip = host
      if (src_ip == "" || src_ip !~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) {
        next  # skip local/X11/console sessions
      }

      if (!first) printf ","
      printf "{\"user\":\"%s\",\"tty\":\"%s\",\"source_ip\":\"%s\",\"login_time\":\"%s\",\"type\":\"SSH\"}", user, tty, src_ip, login_time
      first = 0
    }
    END { printf "]" }
  '
}


build_payload() {
  CPU=$(cpu_pct)
  LOADS=$(load_avg)
  L1=$(echo "$LOADS" | awk '{print $1}')
  L5=$(echo "$LOADS" | awk '{print $2}')
  L15=$(echo "$LOADS" | awk '{print $3}')
  RAM=$(ram_json); [ -z "$RAM" ] && RAM='{}'
  MOUNTS=$(mounts_json); [ -z "$MOUNTS" ] && MOUNTS='[]'
  TOP=$(top_json); [ -z "$TOP" ] && TOP='[]'
  NET=$(network_json); [ -z "$NET" ] && NET='[]'
  UP=$(uptime_sec)
  OV=$(oslevel -s 2>/dev/null)
  KV="$(uname -v).$(uname -r)"
  SVC=$(services_json); [ -z "$SVC" ] && SVC='[]'

  cat <<EOJSON
{"server_name":"$SERVER_NAME","os_type":"AIX","os_version":"$OV","kernel":"$KV","uptime_sec":${UP:-0},"cpu":{"usage_pct":${CPU:-0},"load_1":${L1:-0},"load_5":${L5:-0},"load_15":${L15:-0}},"ram":$RAM,"mounts":$MOUNTS,"top_cpu":$TOP,"top_mem":$TOP,"network":$NET,"services":$SVC,"machine":$(machine_json),"active_users":$(users_json),"ssh_sessions":$(ssh_sessions_json)}
EOJSON
}

send_perl() {
  /usr/bin/perl -e '
    use IO::Socket::SSL;
    my ($url, $token, $body) = @ARGV;
    $url =~ m{^https?://([^:/]+):?(\d*)(/.*)$};
    my $host=$1; my $port=$2||80; my $path=$3; my $len=length($body);
    my $sock = IO::Socket::SSL->new(PeerHost=>$host,PeerPort=>$port,SSL_verify_mode=>0x00,Timeout=>5)
        or die "connect failed: $!";
    print $sock "POST $path HTTP/1.0\r\n";
    print $sock "Host: $host\r\n";
    print $sock "Authorization: Bearer $token\r\n";
    print $sock "Content-Type: application/json\r\n";
    print $sock "Content-Length: $len\r\n";
    print $sock "Connection: close\r\n\r\n";
    print $sock $body;
    close $sock;
  ' "$CENTRAL_URL/api/v1/metrics" "$TOKEN" "$PAYLOAD" 2>>"$LOG"
}

log "AIX agent started on $(hostname) as $SERVER_NAME"
while true; do
  PAYLOAD=$(build_payload)
  send_perl
  sleep "${INTERVAL:-3}"
done

# ────── SERVICE CHECKS (read-only) ──────
check_one_service_aix() {
  NAME="$1"
  TYPE="$2"
  CHK="$3"
  STATUS="unknown"
  T_START=$(date +%s 2>/dev/null || echo 0)

  case "$TYPE" in
    aix_src)
      if command -v lssrc >/dev/null 2>&1; then
        OUT=$(lssrc -s "$CHK" 2>/dev/null | tail -1)
        if echo "$OUT" | grep -q "active"; then
          STATUS="running"
        elif echo "$OUT" | grep -q "inoperative"; then
          STATUS="down"
        else
          STATUS="unknown"
        fi
      fi
      ;;
    process)
      if ps -ef 2>/dev/null | grep -v grep | grep -q "$CHK"; then
        STATUS="running"
      else
        STATUS="down"
      fi
      ;;
    port)
      if netstat -An 2>/dev/null | grep LISTEN | grep -q "\.$CHK "; then
        STATUS="running"
      else
        STATUS="down"
      fi
      ;;
  esac

  T_END=$(date +%s 2>/dev/null || echo 0)
  RESP_MS=$(( (T_END - T_START) * 1000 ))
  [ $RESP_MS -lt 0 ] && RESP_MS=0

  printf '{"name":"%s","type":"%s","check":"%s","status":"%s","response_ms":%d}' \
    "$NAME" "$TYPE" "$CHK" "$STATUS" "$RESP_MS"
}

services_json() {
  [ -z "$SERVICES" ] && { echo "[]"; return; }
  FIRST=1
  RESULT="["
  OLDIFS="$IFS"
  IFS=';'
  for entry in $SERVICES; do
    IFS="$OLDIFS"
    NAME=$(echo "$entry" | cut -d'|' -f1)
    TYPE=$(echo "$entry" | cut -d'|' -f2)
    CHK=$(echo "$entry" | cut -d'|' -f3)
    [ -z "$NAME" ] && { IFS=';'; continue; }
    [ $FIRST -eq 0 ] && RESULT="$RESULT,"
    RESULT="$RESULT$(check_one_service_aix "$NAME" "$TYPE" "$CHK")"
    FIRST=0
    IFS=';'
  done
  IFS="$OLDIFS"
  RESULT="$RESULT]"
  echo "$RESULT"
}

send_perl() {
  /usr/bin/perl -e '
    use IO::Socket::SSL;
    my ($url, $token, $body) = @ARGV;
    $url =~ m{^https?://([^:/]+):?(\d*)(/.*)$};
    my $host=$1; my $port=$2||80; my $path=$3; my $len=length($body);
    my $sock = IO::Socket::SSL->new(PeerHost=>$host,PeerPort=>$port,SSL_verify_mode=>0x00,Timeout=>5)
        or die "connect failed: $!";
    print $sock "POST $path HTTP/1.0\r\n";
    print $sock "Host: $host\r\n";
    print $sock "Authorization: Bearer $token\r\n";
    print $sock "Content-Type: application/json\r\n";
    print $sock "Content-Length: $len\r\n";
    print $sock "Connection: close\r\n\r\n";
    print $sock $body;
    close $sock;
  ' "$CENTRAL_URL/api/v1/metrics" "$TOKEN" "$PAYLOAD" 2>>"$LOG"
}

log "AIX agent started on $(hostname) as $SERVER_NAME"
while true; do
  PAYLOAD=$(build_payload)
  send_perl
  sleep "${INTERVAL:-3}"
done

# ══════ MACHINE + USERS (appended — Phase 6) ══════


# ══════ SSH SESSIONS (Phase 1) ══════
