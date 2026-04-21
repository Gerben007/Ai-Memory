---
title: "Vault MCP Architecture and Cloudflare Limitation"
tags: [project/ai-memory, infrastructure/mcp, infrastructure/cloudflare]
created: 2026-04-21T22:00:00.000Z
updated: 2026-04-21T22:00:00.000Z
---

## MCP Endpoint

Remote MCP at `/mcp` using Streamable HTTP transport. Authenticated via `MCP_BEARER_TOKEN` (bearer header or `?token=` query param).

### Available MCP Tools (12 total)
- `vault_list_notes` — list all notes with titles/tags
- `vault_read_note` — read a specific note
- `vault_create_note` — create note with title, content, tags
- `vault_update_note` — update existing note
- `vault_delete_note` — delete a note
- `vault_search` — BM25 full-text search
- `vault_stats` — vault statistics
- `vault_quick_capture` — append to daily note
- `vault_daily_note` — get/create today's daily note
- `vault_random_note` — random discovery
- `vault_list_attachments` — list all saved attachment files
- `vault_read_attachment` — read attachment content (images returned as image blocks, text inline)

### Cloudflare Tunnel Limitation
Cloudflare Tunnel **strips the `Mcp-Session-Id` header**, breaking session-based MCP. The vault must use **stateless mode** (`sessionIdGenerator: undefined`) where each request creates a fresh server instance. This works because the MCP SDK allows `tools/list` and `tools/call` without prior `initialize` in stateless mode.

### Internal Auth Bypass
MCP tool handlers call the vault API internally at `http://127.0.0.1:3001/api/*`. A random per-boot secret (`X-Internal-Bypass` header) lets these calls skip auth.

### Claude.ai Connection URL
```
https://vault.stratusfinance.co.za/mcp?token=28f90b086209a54d04ba9382fbe922ead200b0cbe8d6a8005956129a16987443
```

### Auth Architecture
Two auth methods, OR'd (not AND'd):
- **Bearer token** — for API/MCP access (`VAULT_AUTH_TOKEN`)
- **Cookie session** — for browser UI access (`AUTH_PASSWORD`)
Request with Bearer header → bearer auth. No Bearer → cookie auth.
