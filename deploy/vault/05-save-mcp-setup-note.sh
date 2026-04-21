#!/usr/bin/env bash
# Run this on the core-services VM to save the MCP-setup note to the vault.
set -euo pipefail

cat > /tmp/vault-mcp-setup.md <<'NOTE'
---
title: "Knowledge Vault — Remote MCP Setup"
tags: [vault, mcp, claude, infra, setup]
created: 2026-04-21T00:00:00Z
updated: 2026-04-21T00:00:00Z
---

# Knowledge Vault — Remote MCP Setup

Notes on how the Knowledge Vault is exposed to the Claude mobile app / claude.ai
via a custom MCP connector.

## Endpoint

- Public URL: `https://vault.stratusfinance.co.za/mcp`
- Transport: Streamable HTTP (MCP spec 2024-11-05)
- Auth: bearer token, accepted two ways:
  - `Authorization: Bearer <token>` header, or
  - `?token=<token>` URL query parameter (added because claude.ai's custom
    connector UI couples its "client secret" field to an OAuth client ID,
    so plain bearer auth via Advanced settings fails validation).

## claude.ai custom connector config

- Name: `Knowledge Vault`
- URL: `https://vault.stratusfinance.co.za/mcp?token=<MCP_BEARER_TOKEN>`
- Advanced settings: leave empty (no OAuth client ID, no client secret)

## Stack config (Portainer → ai-memory)

Env var `MCP_BEARER_TOKEN` must be set on the container. Portainer's
`${MCP_BEARER_TOKEN:-}` interpolation from the stack-level env var section
did NOT propagate into the container during setup, so the token is
currently hardcoded directly in the compose YAML:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3001
  - VAULT_DIR=/data/vault
  - MCP_BEARER_TOKEN=<hex token>
```

To rotate the token: generate a new value, update the YAML, Update the
stack (Re-pull image OFF), then update the `?token=` in the claude.ai
connector URL.

Generate a 32-byte hex token in PowerShell:

```powershell
-join ((1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) }))
```

## MCP tools exposed

Ten tools are defined in `server/mcpRoutes.js`:

- `vault_list_notes` — list all notes with titles and tags
- `vault_read_note` — read full content of a note
- `vault_create_note` — create a new note (frontmatter auto-generated)
- `vault_update_note` — update an existing note (full content incl. frontmatter)
- `vault_delete_note` — delete a note
- `vault_search` — BM25 full-text search
- `vault_stats` — vault statistics
- `vault_quick_capture` — append a timestamped line to today's daily note
- `vault_daily_note` — get or create today's daily note
- `vault_random_note` — return a random note

## Architecture

- Express app on the core-services VM, container port 3001 (host 3002)
- Bind-mounts `/mnt/vault` (TrueNAS NFS, dataset `tank/vault`) into the container
- Cloudflare Tunnel `knowledge-vault` forwards `vault.stratusfinance.co.za`
  → `http://knowledge-vault:3001` inside the VM's docker network
- No Cloudflare Access policy — the `/mcp` bearer token is the only gate
- `/api/*` endpoints remain unauthenticated (known gap — defer)

## Files changed on branch `claude/setup-vault-git-AZT3f`

- `server/mcpRoutes.js` — new: Express router with MCP server + bearer auth
  (accepts both `Authorization: Bearer` header and `?token=` query param)
- `server/index.js` — mounts `/mcp` route
- `docker-compose.yml` + `portainer-stack.yml` — add `MCP_BEARER_TOKEN` env
- `package.json` — promoted `zod` to a direct dep

## Smoke test (from the VM)

```bash
curl -ik -X POST "https://vault.stratusfinance.co.za/mcp?token=<TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

Expect `HTTP/1.1 200` with a JSON-RPC initialize response listing server
capabilities (`tools`).

Note: from the VM itself, the TLS cert served at `vault.stratusfinance.co.za`
resolves through an internal proxy (openresty) with a mismatched SAN, so
strict TLS fails. This does NOT affect external clients (including
claude.ai); use `-k` locally or test from off-LAN.

## Gotchas learned during setup

- Portainer "Re-pull image" on a local-only image (`knowledge-vault:latest`)
  → HTTP 500 from the Portainer API: `pull access denied, repository does
  not exist`. Always keep "Re-pull image" OFF for this stack.
- Portainer env var section → the compose `${VAR:-}` interpolation didn't
  work for this stack. Hardcoding the value in the YAML was the workaround.
- Rebuild the image manually on the VM before redeploying — Portainer does
  NOT build it (no `build:` directive in `portainer-stack.yml`):

  ```bash
  cd ~/Ai-Memory
  git fetch origin
  git checkout claude/setup-vault-git-AZT3f
  git pull
  docker build -t knowledge-vault:latest .
  ```

  Then in Portainer: Stacks → ai-memory → Update the stack (Re-pull OFF).

- PowerShell's `curl` is aliased to `Invoke-WebRequest` — use `curl.exe` or
  `Invoke-RestMethod` when testing from Windows.
- claude.ai's custom connector "Add" dialog: putting a bearer token into
  the Advanced settings password field fails validation with "A client id
  must be provided with a client secret." Leave Advanced settings empty
  and put the token in the URL instead.
NOTE

curl -sS -X POST "http://127.0.0.1:3002/api/notes/vault-mcp-setup.md" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/vault-mcp-setup.md
echo
echo "Saved: vault-mcp-setup.md"
