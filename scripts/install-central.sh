#!/bin/bash
# NOTE: Requires root/sudo. For userspace deploy, see README.
set -euo pipefail
[ "$EUID" -ne 0 ] && { echo "Run as root or with sudo"; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST=/opt/sngpl-monitor
DATA=/var/lib/sngpl-monitor
echo "[1/6] Installing packages..."
dnf -y install python3 python3-pip nginx curl || true
echo "[2/6] Creating directories..."
mkdir -p "$DEST" "$DATA"
cp -r "$SRC/backend" "$DEST/"
cp -r "$SRC/frontend" "$DEST/"
cp "$SRC/config.yaml" "$DEST/config.yaml"
sed -i "s|dir:.*|dir: /opt/sngpl-monitor/frontend|" "$DEST/config.yaml"
sed -i "s|path:.*|path: /var/lib/sngpl-monitor/metrics.db|" "$DEST/config.yaml"
echo "[3/6] Python venv + deps..."
python3 -m venv "$DEST/venv"
"$DEST/venv/bin/pip" install --upgrade pip
"$DEST/venv/bin/pip" install -r "$DEST/backend/requirements.txt"
echo "[4/6] Generating admin password + JWT secret..."
ADMIN_PASS="${SNGLP_ADMIN_PASS:-$(tr -dc 'A-Za-z0-9@#' </dev/urandom | head -c 12)}"
HASH=$("$DEST/venv/bin/python" -c "from passlib.hash import bcrypt; print(bcrypt.hash('$ADMIN_PASS'))")
SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
sed -i "s|admin_password_hash:.*|admin_password_hash: \"$HASH\"|" "$DEST/config.yaml"
sed -i "s|jwt_secret:.*|jwt_secret: \"$SECRET\"|" "$DEST/config.yaml"
echo "[5/6] systemd + nginx..."
cp "$SRC/systemd/sngpl-backend.service" /etc/systemd/system/
cp "$SRC/nginx/sngpl-monitor.conf" /etc/nginx/conf.d/ 2>/dev/null || true
systemctl daemon-reload
systemctl enable --now sngpl-backend
if command -v nginx >/dev/null 2>&1; then nginx -t && systemctl enable --now nginx || true; fi
echo "[6/6] SELinux + firewall..."
setsebool -P httpd_can_network_connect 1 2>/dev/null || true
firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "=========================================="
echo " URL:      http://${IP}:3000"
echo " Username: admin"
echo " Password: $ADMIN_PASS"
echo " SAVE THIS PASSWORD!"
echo "=========================================="