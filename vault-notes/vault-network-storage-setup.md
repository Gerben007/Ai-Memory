---
title: "Vault Network Storage via TrueNAS SMB"
tags: [infrastructure/truenas, infrastructure/vault, homelab/storage]
created: 2026-04-21T22:00:00.000Z
updated: 2026-04-21T22:00:00.000Z
---

## Setup

Vault data lives on TrueNAS dataset `/mnt/tank/vault`, shared via SMB as "Knowledge Vault".

### TrueNAS Config
- **Dataset**: `/mnt/tank/vault`
- **Share**: SMB with guest access enabled
- **Permissions**: 777 (owner: root, group: nobody, recursive)
- **TrueNAS IP**: 192.168.20.46

### Docker Mount
```yaml
volumes:
  - /mnt/vault:/data/vault
```
The homelab host mounts the TrueNAS NFS export at `/mnt/vault`, which Docker binds into the container.

### Windows Access
- Network path: `\\192.168.20.46\Knowledge Vault`
- Mapped as network drive for direct file access
- Can browse/edit `.md` vault notes and view attachments
- Files added here appear in vault UI immediately
- For AI processing of files, email them to `gerben.boersema+vault@gmail.com` or use the web UI Import feature

### Replaced Syncthing
TrueNAS SMB share replaces Syncthing — single source of truth, no sync conflicts.
