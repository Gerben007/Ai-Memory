---
title: "Email Attachment Processing Setup"
tags: [project/ai-memory, email/attachments, infrastructure/vault]
created: 2026-04-21T22:00:00.000Z
updated: 2026-04-21T22:00:00.000Z
---

## How Email Attachments Are Processed

When emails arrive via IMAP polling, attachments are handled in two ways:

### 1. Original Files Saved
- All attachments saved to `vault/attachments/` directory
- Filenames: `{email-slug}-{original-filename}` (sanitized)
- Linked from the note under `## Attachments` section with file type and size

### 2. Text Extracted for AI Processing
Supported extraction formats:
- **PDF** — runs in subprocess (isolates crashes from native `pdf-parse` binary)
- **DOCX** — converted to markdown via `mammoth`
- **XLSX/XLS/CSV** — converted to markdown tables via `xlsx`
- **TXT/MD/JSON/XML/HTML** — read as plain text (max 10KB)
- **Images** — saved only, no text extraction

Extracted text (up to 8KB per attachment) is appended to the email body and sent to Claude with 12K char limit for AI note generation.

### PDF Subprocess Isolation
`pdf-parse` uses native binaries that segfault on Alpine Docker / older CPUs. PDF extraction runs in a `child_process.execFileSync` subprocess with 30s timeout. If it crashes, only the child dies — the server stays up and the note is still created with the PDF linked (without inline text).

### UID Tracking
Email UIDs are saved to `.vault-email-state.json` **before** processing each email. If the server crashes mid-processing, the email won't be re-processed on restart.
