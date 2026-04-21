#!/bin/bash
# Step 1 — Initialise Git in /mnt/vault and make the first commit.
#
# Run on Core Services VM (192.168.20.62) as your normal user with sudo
# rights. The script does not require you to have access to /mnt/vault
# directly — the vault is 0770 root:root and the script routes every
# vault-touching call through `sudo` (and `git -C` so no `cd` is needed).
#
# Idempotent: safe to re-run.

set -euo pipefail

VAULT=/mnt/vault
EMAIL="gerben@stratusfinance.co.za"
NAME="Gerben"

if ! sudo test -d "$VAULT"; then
    echo "ERROR: $VAULT does not exist. Is the NFS mount up?" >&2
    exit 1
fi

if ! mountpoint -q "$VAULT"; then
    echo "ERROR: $VAULT is not a mountpoint. Check fstab / NFS." >&2
    exit 1
fi

if ! command -v git >/dev/null 2>&1; then
    echo "==> Installing git"
    sudo apt-get update -qq
    sudo apt-get install -y git
fi

echo "==> Marking $VAULT as a safe directory for root's git"
sudo git config --global --add safe.directory "$VAULT"

if ! sudo test -d "$VAULT/.git"; then
    echo "==> git init"
    sudo git -C "$VAULT" init -q
else
    echo "==> .git already exists, skipping init"
fi

echo "==> Setting local git identity"
sudo git -C "$VAULT" config --local user.email "$EMAIL"
sudo git -C "$VAULT" config --local user.name  "$NAME"
sudo git -C "$VAULT" config --local --add safe.directory "$VAULT"

echo "==> Seeding .gitkeep in empty top-level folders"
for d in Daily Inbox Clients Reference Projects Skills Templates \
         _ingest _ingest/_staging _ingest/_quarantine; do
    if sudo test -d "$VAULT/$d"; then
        if [[ -z "$(sudo ls -A "$VAULT/$d")" ]]; then
            sudo touch "$VAULT/$d/.gitkeep"
            echo "   + $d/.gitkeep"
        fi
    fi
done

echo "==> Staging and committing"
sudo git -C "$VAULT" add -A
if sudo git -C "$VAULT" diff --cached --quiet; then
    echo "   (nothing to commit)"
else
    sudo git -C "$VAULT" commit -q -m "Initial vault structure"
fi

echo
echo "==> Done. Current state:"
sudo git -C "$VAULT" log --oneline
sudo git -C "$VAULT" status --short
