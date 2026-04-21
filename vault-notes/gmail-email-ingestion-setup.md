---
title: "Gmail Email Ingestion Configuration"
tags: [project/ai-memory, email/gmail, infrastructure/vault]
created: 2026-04-21T22:00:00.000Z
updated: 2026-04-21T22:00:00.000Z
---

## Architecture

```
[Any device] → forward email → gerben.boersema+vault@gmail.com
                                        │
                              Gmail (auto-labels "Vault")
                                        │
                              Vault IMAP Poller (every 5 min)
                                        │
                              Claude AI → extract knowledge
                                        │
                              Vault Note (.md) + Attachments
```

## Gmail Setup
- **Address**: `gerben.boersema+vault@gmail.com` (alias of `gerben.boersema@gmail.com`)
- **IMAP login**: `gerben.boersema@gmail.com` (base address, NOT the +vault alias)
- **Auth**: Gmail App Password (Google Account → Security → 2-Step Verification → App passwords)
- **App password page**: https://myaccount.google.com/apppasswords
- **IMAP must be enabled**: Gmail Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP

## Gmail Filter
- **Matches**: `to:gerben.boersema+vault@gmail.com`
- **Action**: Apply label "Vault", skip inbox
- **Important**: Filter must match `to:` field, NOT `from:`

## Vault Config
- **Host**: imap.gmail.com
- **Port**: 993
- **Secure**: true
- **Folder**: Vault (Gmail label appears as IMAP folder)
- **Poll interval**: 5 minutes

## What Gets Processed
- Emails in the "Vault" label only (not entire inbox)
- Email body + attachment text extracted and sent to Claude
- Claude returns structured note with title, tags, content
- Skips spam, OTP codes, marketing, empty emails
- Notes include full email metadata: From, To, CC, Date, Subject
