#!/bin/bash
# Step 1 — Initialise Git in /mnt/vault and make the first commit.
#
# Run on Core Services VM (192.168.20.62) as a user with sudo.
# Idempotent: safe to re-run.

set -euo pipefail

VAULT=/mnt/vault
EMAIL="gerben@stratusfinance.co.za"
NAME="Gerben"

if [[ ! -d "$VAULT" ]]; then
    echo "ERROR: $VAULT does not exist. Is the NFS mount up?" >&2
    exit 1
fi

if ! mountpoint -q "$VAULT"; then
    echo "ERROR: $VAULT is not a mountpoint. Check fstab / NFS." >&2
    exit 1
fi

if ! dpkg -l | grep -q "^ii  git "; then
    echo "==> Installing git"
    sudo apt-get update -qq
    sudo apt-get install -y git
fi

echo "==> Marking $VAULT as a safe directory for root's git"
sudo git config --global --add safe.directory "$VAULT"

cd "$VAULT"

if [[ ! -d .git ]]; then
    echo "==> git init"
    sudo git init -q
else
    echo "==> .git already exists, skipping init"
fi

echo "==> Setting local git identity"
sudo git config --local user.email "$EMAIL"
sudo git config --local user.name  "$NAME"
sudo git config --local --add safe.directory "$VAULT"

echo "==> Seeding .gitkeep in empty top-level folders"
for d in Daily Inbox Clients Reference Projects Skills Templates \
         _ingest _ingest/_staging _ingest/_quarantine; do
    if [[ -d "$VAULT/$d" ]] && [[ -z "$(ls -A "$VAULT/$d")" ]]; then
        sudo touch "$VAULT/$d/.gitkeep"
        echo "   + $d/.gitkeep"
    fi
done

echo "==> Staging and committing"
sudo git add -A
if sudo git diff --cached --quiet; then
    echo "   (nothing to commit)"
else
    sudo git commit -q -m "Initial vault structure"
fi

echo
echo "==> Done. Current state:"
sudo git log --oneline
sudo git status --short
