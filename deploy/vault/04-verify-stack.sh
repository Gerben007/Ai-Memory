#!/bin/bash
# Step 4 — Verify the ai-memory Portainer stack after reconfiguring to
# bind-mount /mnt/vault.
#
# This script does NOT modify anything. It's a read-only smoke test you
# run on the Core Services VM after you've edited the stack in Portainer
# and redeployed.

set -u

fail=0
ok()   { echo "  [OK]   $*"; }
bad()  { echo "  [FAIL] $*"; fail=1; }

echo "==> Container is running"
if docker ps --format '{{.Names}}' | grep -qx knowledge-vault; then
    ok "container knowledge-vault up"
else
    bad "container knowledge-vault not running"
fi

echo "==> Bind-mount is in place (host /mnt/vault -> /data/vault)"
src=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/vault"}}{{.Source}}{{end}}{{end}}' knowledge-vault 2>/dev/null)
if [[ "$src" == "/mnt/vault" ]]; then
    ok "/data/vault -> /mnt/vault"
else
    bad "/data/vault source is '$src', expected /mnt/vault"
fi

echo "==> Container can see seeded folders"
if docker exec knowledge-vault ls /data/vault >/dev/null 2>&1; then
    ok "ls /data/vault succeeded inside container"
    docker exec knowledge-vault ls /data/vault | sed 's/^/        /'
else
    bad "ls /data/vault failed inside container"
fi

echo "==> MCP endpoint responds"
if curl -fsS --max-time 5 http://192.168.20.62:3002/ >/dev/null; then
    ok "http://192.168.20.62:3002/ responded 2xx"
else
    # container may be on 3001; try that too
    if curl -fsS --max-time 5 http://192.168.20.62:3001/ >/dev/null; then
        ok "http://192.168.20.62:3001/ responded 2xx"
    else
        bad "neither 3001 nor 3002 responded — check container logs"
    fi
fi

echo "==> Old Docker volume still exists (must NOT be deleted yet)"
if docker volume ls --format '{{.Name}}' | grep -qx ai-knowledge_vault-data; then
    ok "ai-knowledge_vault-data volume still present (preserved for migration)"
else
    bad "ai-knowledge_vault-data volume is GONE — stop and investigate"
fi

echo
if [[ $fail -eq 0 ]]; then
    echo "ALL CHECKS PASSED."
else
    echo "ONE OR MORE CHECKS FAILED — see above."
    exit 1
fi
