# Vault deployment — run order

Target host: Core Services VM `192.168.20.62` (Ubuntu 24.04)
NFS source:  TrueNAS `192.168.20.46`, dataset `tank/vault`, mounted at `/mnt/vault`

Prereqs (already done): NFS export + client, mount point, fstab entry,
folder seeding under `/mnt/vault/`, `.gitignore` + `README.md` at vault root.

Run these scripts in order, as `gerben` on the VM, with sudo rights.

```bash
git clone git@github.com:Gerben007/Ai-Memory.git
cd Ai-Memory/deploy/vault
chmod +x ./*.sh

./01-git-init.sh            # Step 1: git init + initial commit
./02-install-autocommit.sh  # Step 2: daily auto-commit timer
./03-install-syncthing.sh   # Step 3: Syncthing (copy the Device ID + password it prints!)
```

## Step 4 — Portainer (manual, in Portainer UI)

The repo's `portainer-stack.yml` has been updated to bind-mount `/mnt/vault`
instead of the named volume. Apply it:

1. Portainer → Stacks → `ai-memory` → **Stop**
2. `docker volume ls | grep vault` — confirm `ai-knowledge_vault-data` still
   listed. **Do not delete it.** Capture its mountpoint:
   ```
   docker volume inspect ai-knowledge_vault-data --format '{{.Mountpoint}}'
   ```
   Save that path somewhere — it's the source for a future migration session.
3. Stack → **Editor** → replace the compose with the contents of
   `portainer-stack.yml` from this repo (bind-mount version).
4. **Update the stack**. Watch it redeploy.
5. Verify:
   ```bash
   ./04-verify-stack.sh
   ```
   All checks must pass. If any fail, roll the compose back to the named-volume
   version and stop.

## Step 5 — Syncthing pairing (manual, on your Windows laptop)

1. Install the Windows Syncthing client from https://syncthing.net/downloads/.
2. SSH-tunnel from your laptop to the server's web UI:
   ```
   ssh -L 8384:127.0.0.1:8384 gerben@192.168.20.62
   ```
   Then open http://127.0.0.1:8384 in a browser. Log in with the admin
   credentials that `03-install-syncthing.sh` printed.
3. In the server's Syncthing UI, **Add Folder**:
   - Folder ID:       `knowledge-vault`
   - Folder Label:    `Knowledge Vault`
   - Folder Path:     `/mnt/vault`
   - Type:            **Send & Receive**
   - File Versioning: **Staggered**, 30 days
   - Confirm `.stignore` is already populated (script installed it).
4. Copy the server's Device ID (shown at the top of the UI, also in the
   script output).
5. In the Windows Syncthing UI, **Add Remote Device** with the server's
   Device ID. On the server UI, accept the incoming request.
6. Share the `knowledge-vault` folder with the Windows device. Accept on
   Windows; point it at e.g. `C:\Users\<you>\KnowledgeVault`.
7. Smoke test: create `test.md` on one side, wait for it to appear on the other.

## Step 5 — Memory updates (do these in the memory system, not here)

- **Remove / replace:** "TrueNAS NFS permissions: Maproot User = root,
  Maproot Group = wheel required to allow ownership changes from guest VMs"
  — wrong on TrueNAS SCALE.
- **Add:** TrueNAS SCALE NFS: Maproot User = root, Maproot Group = root.
  `wheel` doesn't exist on SCALE (it's Linux); it's a CORE (FreeBSD) concept.
- **Add:** Knowledge Vault canonical storage migrated from Docker named
  volume `ai-knowledge_vault-data` to TrueNAS dataset `tank/vault`,
  NFS-mounted at `/mnt/vault` on Core Services VM (192.168.20.62),
  bind-mounted into the ai-memory stack at `/data/vault`. Old Docker volume
  retained for future data migration.
- **Add:** Vault has Git auto-commit daily at 02:00 via systemd timer
  `vault-autocommit.timer`. Safe directory config set for `/mnt/vault`.
- **Add:** Syncthing runs on Core Services VM as system user `syncthing`
  (member of root group for 0770 vault access). Web UI `127.0.0.1:8384`
  (SSH-tunnel only). Folder ID: `knowledge-vault`. `.git` is excluded from
  sync (history lives only on the server).

## Rules kept in force

- No Git remote configured on `/mnt/vault` — Gerben sets that up separately.
- Port 8384 is **not** exposed to the LAN.
- `ai-knowledge_vault-data` Docker volume is preserved untouched.
- Data migration from the old volume is a **separate future task**.
