#!/bin/bash
# Step 3 — Install and configure Syncthing on Core Services VM.
#
# Design:
#   - Dedicated system user `syncthing` (nologin shell, home /var/lib/syncthing)
#   - User is added to the `root` group to gain rwx on /mnt/vault (0770 root:root)
#   - Web UI bound to 127.0.0.1:8384 only — reach via SSH tunnel
#   - Global discovery / relays / NAT traversal / usage reporting all OFF
#   - Local discovery + LAN ports 22000/tcp+udp stay ON for laptop pairing
#
# Run as a user with sudo. Idempotent where possible.
#
# What this script DOES:
#   1. Adds the Syncthing apt repo + GPG key
#   2. Installs `syncthing`
#   3. Creates the `syncthing` system user, adds it to the `root` group
#   4. Starts syncthing@syncthing.service once to generate the config skeleton
#   5. Patches config.xml for privacy + localhost UI + admin password
#   6. Installs /mnt/vault/.stignore
#   7. Restarts syncthing
#   8. Opens UFW ports 22000/tcp+udp if UFW is active
#   9. Prints the Device ID and the GUI admin password
#
# What this script does NOT do:
#   - Register the `knowledge-vault` folder in Syncthing config (do that via
#     the web UI once you've SSH-tunnelled in — see README.md Step 3d).
#     Reason: adding folders via raw XML is brittle across Syncthing versions.

set -euo pipefail

ST_USER=syncthing
ST_HOME=/var/lib/syncthing
VAULT=/mnt/vault

# ---------------------------------------------------------------------------
# 1. Syncthing apt repo (https://apt.syncthing.net/)
#    We always re-do the keyring + list file — a broken prior run leaves
#    files that would otherwise make an "already added" guard skip the
#    fix. Clean up stale state, then lay it down canonically.
# ---------------------------------------------------------------------------
echo "==> Configuring Syncthing apt repo"
sudo install -d -m 0755 /etc/apt/keyrings
sudo rm -f /etc/apt/keyrings/syncthing-archive-keyring.asc \
           /etc/apt/keyrings/syncthing-archive-keyring.gpg \
           /etc/apt/sources.list.d/syncthing.list \
           /etc/apt/sources.list.d/syncthing.sources
# gpg --dearmor reads either binary or ASCII-armored input and writes a
# binary keyring, which is what apt expects at the signed-by= path.
if ! command -v gpg >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y gnupg
fi
curl -fsSL https://syncthing.net/release-key.gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/syncthing-archive-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/syncthing-archive-keyring.gpg] https://apt.syncthing.net/ syncthing stable" \
    | sudo tee /etc/apt/sources.list.d/syncthing.list >/dev/null
sudo apt-get update -qq

# ---------------------------------------------------------------------------
# 2. Install syncthing
# ---------------------------------------------------------------------------
if ! command -v syncthing >/dev/null 2>&1; then
    echo "==> Installing syncthing"
    sudo apt-get install -y syncthing
fi

# ---------------------------------------------------------------------------
# 3. Dedicated system user
# ---------------------------------------------------------------------------
if ! id "$ST_USER" >/dev/null 2>&1; then
    echo "==> Creating system user $ST_USER"
    sudo useradd --system --create-home --home-dir "$ST_HOME" \
                 --shell /usr/sbin/nologin "$ST_USER"
fi

echo "==> Adding $ST_USER to root group (for 0770 vault access)"
sudo usermod -aG root "$ST_USER"

echo "==> Verifying syncthing user can write to $VAULT"
if ! sudo -u "$ST_USER" test -w "$VAULT"; then
    echo "ERROR: $ST_USER cannot write to $VAULT. Check vault perms (expect 0770 root:root)." >&2
    exit 1
fi
echo "   OK: $ST_USER has write access"

# ---------------------------------------------------------------------------
# 4. First start — generates config skeleton
# ---------------------------------------------------------------------------
echo "==> Enabling syncthing@$ST_USER.service"
sudo systemctl enable --now "syncthing@$ST_USER.service"

# Wait for config.xml to appear (Syncthing 1.27+ uses XDG paths).
# The syncthing user's home is typically 0700, so we must stat as root.
CFG=""
for _ in $(seq 1 20); do
    if   sudo test -f "$ST_HOME/.local/state/syncthing/config.xml"; then
        CFG="$ST_HOME/.local/state/syncthing/config.xml"; break
    elif sudo test -f "$ST_HOME/.config/syncthing/config.xml"; then
        CFG="$ST_HOME/.config/syncthing/config.xml"; break
    fi
    sleep 1
done

if [[ -z "$CFG" ]]; then
    echo "ERROR: config.xml did not appear. Check 'systemctl status syncthing@$ST_USER'." >&2
    exit 1
fi
echo "==> Found config at $CFG"

# ---------------------------------------------------------------------------
# 5. Patch config for privacy + localhost UI + admin credentials
# ---------------------------------------------------------------------------
echo "==> Stopping syncthing to edit config"
sudo systemctl stop "syncthing@$ST_USER.service"

# Generate a strong GUI admin password
ADMIN_PW=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
# bcrypt hash with htpasswd (apache2-utils) — install if missing
if ! command -v htpasswd >/dev/null 2>&1; then
    sudo apt-get install -y apache2-utils
fi
ADMIN_HASH=$(htpasswd -nbBC 10 gerben "$ADMIN_PW" | cut -d: -f2)

sudo python3 - "$CFG" "$ADMIN_HASH" <<'PY'
import sys, xml.etree.ElementTree as ET
cfg_path, admin_hash = sys.argv[1], sys.argv[2]
tree = ET.parse(cfg_path)
root = tree.getroot()

gui = root.find('gui')
if gui is None:
    gui = ET.SubElement(root, 'gui')
gui.set('enabled', 'true')
gui.set('tls', 'false')
# Localhost only — Gerben SSH-tunnels to reach it
addr = gui.find('address')
if addr is None:
    addr = ET.SubElement(gui, 'address')
addr.text = '127.0.0.1:8384'
user = gui.find('user')
if user is None:
    user = ET.SubElement(gui, 'user')
user.text = 'gerben'
pw = gui.find('password')
if pw is None:
    pw = ET.SubElement(gui, 'password')
pw.text = admin_hash

opts = root.find('options')
if opts is None:
    opts = ET.SubElement(root, 'options')

def set_opt(name, value):
    el = opts.find(name)
    if el is None:
        el = ET.SubElement(opts, name)
    el.text = value

# Listen on LAN for sync traffic (default)
# Remove any existing listenAddress children, then add a single 'default'
for el in list(opts.findall('listenAddress')):
    opts.remove(el)
la = ET.SubElement(opts, 'listenAddress')
la.text = 'default'

set_opt('globalAnnounceEnabled', 'false')
set_opt('localAnnounceEnabled',  'true')
set_opt('relaysEnabled',         'false')
set_opt('natEnabled',             'false')
set_opt('urAccepted',            '-1')
set_opt('crashReportingEnabled', 'false')
set_opt('startBrowser',          'false')

tree.write(cfg_path, xml_declaration=True, encoding='utf-8')
print('Config patched.')
PY

# ---------------------------------------------------------------------------
# 6. .stignore
# ---------------------------------------------------------------------------
HERE="$(cd "$(dirname "$0")" && pwd)"
echo "==> Installing $VAULT/.stignore"
sudo install -m 0644 -o root -g root "$HERE/stignore" "$VAULT/.stignore"

# ---------------------------------------------------------------------------
# 7. Restart
# ---------------------------------------------------------------------------
echo "==> Starting syncthing"
sudo systemctl start "syncthing@$ST_USER.service"

# Wait for it to come up and emit a device ID
for _ in $(seq 1 20); do
    # -H sets HOME=/var/lib/syncthing so syncthing finds its cert.pem
    DEVICE_ID=$(sudo -Hu "$ST_USER" syncthing --device-id 2>/dev/null || true)
    [[ -n "$DEVICE_ID" ]] && break
    sleep 1
done

# ---------------------------------------------------------------------------
# 8. UFW (only if active)
# ---------------------------------------------------------------------------
if command -v ufw >/dev/null 2>&1 && sudo ufw status | head -1 | grep -q "Status: active"; then
    echo "==> UFW is active — opening 22000/tcp+udp (NOT 8384)"
    sudo ufw allow 22000/tcp comment 'Syncthing sync'
    sudo ufw allow 22000/udp comment 'Syncthing QUIC'
    sudo ufw reload
else
    echo "==> UFW inactive or absent — skipping firewall rules"
fi

# ---------------------------------------------------------------------------
# 9. Report
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "Syncthing installed and configured."
echo
echo "  Device ID:       ${DEVICE_ID:-<run: sudo -u $ST_USER syncthing --device-id>}"
echo "  Web UI:          http://127.0.0.1:8384   (localhost only)"
echo "  SSH tunnel:      ssh -L 8384:127.0.0.1:8384 gerben@192.168.20.62"
echo "  Admin user:      gerben"
echo "  Admin password:  $ADMIN_PW"
echo
echo "Next: open the tunnelled web UI, add the 'knowledge-vault' folder"
echo "pointing at $VAULT (Send & Receive, Staggered versioning 30d),"
echo "then pair your Windows laptop device."
echo "============================================================"
