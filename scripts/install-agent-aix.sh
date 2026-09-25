#!/bin/sh
[ "$(id -u)" -ne 0 ] && { echo "Run as root"; exit 1; }
CENTRAL=""; NAME=""; TOKEN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --central) CENTRAL="$2"; shift 2;;
    --name)    NAME="$2"; shift 2;;
    --token)   TOKEN="$2"; shift 2;;
    *) echo "Unknown: $1"; exit 1;;
  esac
done
[ -z "$CENTRAL" -o -z "$NAME" -o -z "$TOKEN" ] && { echo "Usage: $0 --central URL --name NAME --token UUID"; exit 1; }
mkdir -p /opt/sngpl-agent
cp "$(dirname "$0")/../agent/sngpl-agent.sh" /opt/sngpl-agent/
chmod 755 /opt/sngpl-agent/sngpl-agent.sh
cat > /etc/sngpl-agent.conf <<CONF
SERVER_NAME="$NAME"
CENTRAL_URL="$CENTRAL"
TOKEN="$TOKEN"
INTERVAL=3
CONF
chmod 600 /etc/sngpl-agent.conf
touch /var/log/sngpl-agent.log
chmod 644 /var/log/sngpl-agent.log
mkdir -p /etc/rc.d/init.d
cp "$(dirname "$0")/../init/sngpl-agent.init" /etc/rc.d/init.d/sngpl-agent
chmod 755 /etc/rc.d/init.d/sngpl-agent
/etc/rc.d/init.d/sngpl-agent start
if ! grep -q "sngpl-agent" /etc/inittab; then
  echo "sngpl:2:once:/etc/rc.d/init.d/sngpl-agent start >/dev/null 2>&1" >> /etc/inittab
fi
echo "AIX agent '$NAME' installed."