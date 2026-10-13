# SNGPL Monitor

Central: RHEL 9.8. Monitored: 5x RHEL + 5x AIX 7.2.
Path: /ords/sngpl-monitor

## Start backend
cd /ords/sngpl-monitor
nohup ./venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 3000 --app-dir /ords/sngpl-monitor > data/backend.log 2>&1 &

## Agent install (RHEL)
sudo ./scripts/install-agent-rhel.sh --central http://CENTRAL:3000 --name rhel-01 --token UUID

## Agent install (AIX)
./scripts/install-agent-aix.sh --central http://CENTRAL:3000 --name aix-01 --token UUID# sngpl-monitor


