#!/bin/bash
# ══════════════════════════════════════════════════════
# SNGLP Monitor — Automated Backup
# Daily backup + 7-day rolling retention
# ══════════════════════════════════════════════════════

set -euo pipefail

BACKUP_ROOT="/ords/sngpl-monitor/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/$DATE"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup → $BACKUP_DIR"

# 1. Config (chmod 600 preserved)
cp /ords/sngpl-monitor/config.yaml "$BACKUP_DIR/config.yaml"

# 2. Backend code
cp /ords/sngpl-monitor/backend/main.py "$BACKUP_DIR/main.py"
cp /ords/sngpl-monitor/backend/ai_insights.py "$BACKUP_DIR/ai_insights.py" 2>/dev/null || true
cp /ords/sngpl-monitor/backend/incidents.py "$BACKUP_DIR/incidents.py" 2>/dev/null || true
cp /ords/sngpl-monitor/backend/ratelimit.py "$BACKUP_DIR/ratelimit.py" 2>/dev/null || true
cp /ords/sngpl-monitor/backend/audit.py "$BACKUP_DIR/audit.py" 2>/dev/null || true

# 3. Frontend
cp /ords/sngpl-monitor/frontend/index.html "$BACKUP_DIR/index.html"
cp /ords/sngpl-monitor/frontend/performance.js "$BACKUP_DIR/performance.js" 2>/dev/null || true
cp /ords/sngpl-monitor/frontend/ai-functions.js "$BACKUP_DIR/ai-functions.js" 2>/dev/null || true
cp /ords/sngpl-monitor/frontend/login-visuals.js "$BACKUP_DIR/login-visuals.js" 2>/dev/null || true
cp /ords/sngpl-monitor/frontend/dashboard-visuals.css "$BACKUP_DIR/dashboard-visuals.css" 2>/dev/null || true

# 4. Database (safe copy while backend running)
sqlite3 /ords/sngpl-monitor/data/metrics.db ".backup $BACKUP_DIR/metrics.db" 2>/dev/null || \
    cp /ords/sngpl-monitor/data/metrics.db "$BACKUP_DIR/metrics.db"

# 5. Certificates (private keys chmod 600)
mkdir -p "$BACKUP_DIR/certs"
cp /ords/sngpl-monitor/certs/server.key "$BACKUP_DIR/certs/"
cp /ords/sngpl-monitor/certs/server.crt "$BACKUP_DIR/certs/"
cp /ords/sngpl-monitor/certs/ca.key "$BACKUP_DIR/certs/"
cp /ords/sngpl-monitor/certs/ca.crt "$BACKUP_DIR/certs/"
chmod 600 "$BACKUP_DIR/certs/"*.key

# 6. Metadata
cat > "$BACKUP_DIR/INFO.txt" <<EOF
SNGLP Monitor Backup
Date: $(date)
Host: $(hostname)
Files:
$(ls -la "$BACKUP_DIR")
EOF

# 7. Size report
SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[$(date)] Backup complete: $SIZE"
echo "$SIZE" > "$BACKUP_DIR/.size"

# 8. Rolling retention — delete old backups
echo "[$(date)] Cleaning backups older than $KEEP_DAYS days..."
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +$KEEP_DAYS -exec rm -rf {} \; 2>/dev/null || true

# 9. Summary
TOTAL=$(du -sh "$BACKUP_ROOT" | cut -f1)
COUNT=$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | wc -l)
echo "[$(date)] Total backups: $COUNT ($TOTAL)"

exit 0
