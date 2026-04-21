#!/bin/sh
set -e

VAULT_DIR="${VAULT_DIR:-/data/vault}"

# Create vault directory if it doesn't exist
mkdir -p "$VAULT_DIR"

# If vault is empty, copy seed notes
if [ -z "$(ls -A "$VAULT_DIR" 2>/dev/null)" ]; then
  echo "Empty vault detected — copying seed notes..."
  cp /app/vault-seed/*.md "$VAULT_DIR/" 2>/dev/null || true
fi

echo "Starting Knowledge Vault..."
exec node server/index.js
