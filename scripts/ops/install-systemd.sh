#!/usr/bin/env bash
set -Eeuo pipefail

install -d -m 700 /etc/wecraft-training
install -d -m 755 /etc/systemd/system
install -m 644 /opt/wecraft-training/deploy/training/systemd/wecraft-training-backup.service /etc/systemd/system/
install -m 644 /opt/wecraft-training/deploy/training/systemd/wecraft-training-backup.timer /etc/systemd/system/
install -m 644 /opt/wecraft-training/deploy/training/systemd/wecraft-training-monitor.service /etc/systemd/system/
install -m 644 /opt/wecraft-training/deploy/training/systemd/wecraft-training-monitor.timer /etc/systemd/system/

if [[ ! -r /etc/wecraft-training/backup.env ]]; then
  install -m 600 /opt/wecraft-training/deploy/training/backup.env.example /etc/wecraft-training/backup.env
fi
if [[ ! -r /etc/wecraft-training/monitor.env ]]; then
  install -m 600 /opt/wecraft-training/deploy/training/monitor.env.example /etc/wecraft-training/monitor.env
fi

chmod +x /opt/wecraft-training/scripts/ops/backup-postgres.sh /opt/wecraft-training/scripts/ops/restore-drill.sh /opt/wecraft-training/scripts/ops/monitor.sh /opt/wecraft-training/scripts/ops/release.sh
systemctl daemon-reload
systemctl enable --now wecraft-training-backup.timer wecraft-training-monitor.timer
systemctl list-timers --all 'wecraft-training-*' --no-pager
