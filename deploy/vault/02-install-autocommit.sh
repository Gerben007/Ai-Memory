#!/bin/bash
# Step 2 — Install daily auto-commit (script + systemd timer).
# Run on Core Services VM. Idempotent.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing /usr/local/bin/vault-autocommit.sh"
sudo install -m 0755 -o root -g root \
    "$HERE/vault-autocommit.sh" /usr/local/bin/vault-autocommit.sh

echo "==> Installing systemd unit files"
sudo install -m 0644 -o root -g root \
    "$HERE/systemd/vault-autocommit.service" /etc/systemd/system/vault-autocommit.service
sudo install -m 0644 -o root -g root \
    "$HERE/systemd/vault-autocommit.timer" /etc/systemd/system/vault-autocommit.timer

echo "==> systemctl daemon-reload"
sudo systemctl daemon-reload

echo "==> Enabling + starting timer"
sudo systemctl enable --now vault-autocommit.timer

echo "==> Dry-run the script (expect exit 0, probably no commit)"
if sudo /usr/local/bin/vault-autocommit.sh; then
    echo "   script exit: 0"
else
    echo "   script exit: non-zero — investigate" >&2
    exit 1
fi

echo
echo "==> Timer status:"
systemctl list-timers --all | grep vault-autocommit || true
echo
systemctl status vault-autocommit.timer --no-pager || true
