#!/bin/bash
# Install to /usr/local/bin/vault-autocommit.sh (chmod 755, root-owned).
# Invoked by the systemd timer vault-autocommit.timer.

set -e
cd /mnt/vault || exit 1

git add -A
if ! git diff --cached --quiet; then
    git commit -m "Auto: $(date -Iminutes)"
fi
