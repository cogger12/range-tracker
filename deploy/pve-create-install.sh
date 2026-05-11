#!/usr/bin/env bash
# Run on the Proxmox VE host as root (shell on the hypervisor).
# Creates a Debian 12 LXC, starts it, then installs Range log via GitHub release tarball.
#
# One-liner (replace OWNER/REPO and branch if needed):
#   export GITHUB_REPO=OWNER/range_tracker
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/OWNER/range_tracker/main/deploy/pve-create-install.sh)"
#
# Optional: RELEASE_TAG=v1.0.0  CTID=  STORAGE=local-lvm  BRIDGE=vmbr0  BRANCH=main
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-}"
BRANCH="${BRANCH:-main}"
RELEASE_TAG="${RELEASE_TAG:-}"
TARBALL_URL="${TARBALL_URL:-}"
CTID="${CTID:-}"
STORAGE="${STORAGE:-}"
BRIDGE="${BRIDGE:-vmbr0}"
HOSTNAME="${HOSTNAME:-range-tracker}"
DISK_GB="${DISK_GB:-4}"
CORES="${CORES:-1}"
MEMORY_MB="${MEMORY_MB:-512}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the Proxmox host."
  exit 1
fi

if ! command -v pveversion >/dev/null 2>&1; then
  echo "pveversion not found — is this a Proxmox VE node?"
  exit 1
fi

if [[ -z "$GITHUB_REPO" ]]; then
  echo "Export your GitHub path, e.g.:"
  echo "  export GITHUB_REPO=youruser/range_tracker"
  echo "Then re-run this script."
  exit 1
fi

if [[ -z "$STORAGE" ]]; then
  STORAGE="$(pvesm status -content rootdir 2>/dev/null | awk 'NR==2 {print $1}')"
fi
if [[ -z "$STORAGE" || "$STORAGE" == "Name" ]]; then
  STORAGE="local-lvm"
fi
if ! pvesm status 2>/dev/null | awk -v s="$STORAGE" 'NR > 1 && $1 == s { found = 1 } END { exit !found }'; then
  echo "Storage '${STORAGE}' not found. Set STORAGE= to a valid pool (see: pvesm status)."
  exit 1
fi

if [[ -z "$CTID" ]]; then
  CTID="$(pvesh get /cluster/nextid --output-format text 2>/dev/null | tr -d '[:space:]')"
fi
if [[ -z "$CTID" ]]; then
  max="$(pct list 2>/dev/null | awk 'NR>1 && $1 ~ /^[0-9]+$/ {print $1+0}' | sort -n | tail -1)"
  CTID=$(( "${max:-99}" + 1 ))
fi
if [[ -z "$CTID" ]]; then
  echo "Could not get next CT ID. Set CTID manually."
  exit 1
fi

OSTEMPLATE="${OSTEMPLATE:-}"
if [[ -z "$OSTEMPLATE" ]]; then
  mapfile -t templates < <(pveam list local 2>/dev/null | awk 'NR>1 {print $1}')
  if [[ ${#templates[@]} -eq 0 ]]; then
    echo "No templates found. Download one first:"
    echo "  pveam update && pveam download local debian-12-standard_12.7-1_amd64.tar.zst"
    echo "Or set OSTEMPLATE=local:vztmpl/<filename>"
    exit 1
  fi

  # Auto-select if there's only one
  if [[ ${#templates[@]} -eq 1 ]]; then
    OSTEMPLATE="${templates[0]}"
    echo "Using template: ${OSTEMPLATE}"
  else
    echo ""
    echo "Available templates:"
    for i in "${!templates[@]}"; do
      printf "  %d) %s\n" $((i + 1)) "${templates[$i]}"
    done
    echo ""
    while true; do
      read -rp "Pick a template [1-${#templates[@]}]: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#templates[@]} )); then
        OSTEMPLATE="${templates[$((choice - 1))]}"
        break
      fi
      echo "Invalid choice."
    done
    echo "Using template: ${OSTEMPLATE}"
  fi
fi

if pct status "$CTID" &>/dev/null; then
  echo "CT ${CTID} already exists."
  exit 1
fi

ROOTPW="$(openssl rand -base64 18)"
ROOTPW="${ROOTPW//[^a-zA-Z0-9]/}"

echo "Creating CT ${CTID} (${OSTEMPLATE}, ${STORAGE}:${DISK_GB}, ${MEMORY_MB} MB)…"
pct create "$CTID" "$OSTEMPLATE" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" \
  --memory "$MEMORY_MB" \
  --swap 256 \
  --rootfs "${STORAGE}:${DISK_GB}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --unprivileged 1 \
  --features nesting=0 \
  --onboot 1 \
  --password "$ROOTPW"

pct start "$CTID"

echo "Waiting for network in CT ${CTID}…"
ok=0
for _ in $(seq 1 45); do
  if pct exec "$CTID" -- ping -c1 -W2 1.1.1.1 >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [[ "$ok" -ne 1 ]]; then
  echo "CT did not get outbound ping in time. Start a shell with: pct enter ${CTID}"
  echo "Then run install manually (see deploy/PROXMOX.md)."
  exit 1
fi

INSTALL_SCRIPT_URL="${INSTALL_SCRIPT_URL:-https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/deploy/install-in-ct.sh}"
echo "Running guest installer from ${INSTALL_SCRIPT_URL}…"

pct exec "$CTID" -- env \
  GITHUB_REPO="$GITHUB_REPO" \
  RELEASE_TAG="$RELEASE_TAG" \
  TARBALL_URL="$TARBALL_URL" \
  bash -c "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq curl ca-certificates && curl -fsSL '${INSTALL_SCRIPT_URL}' | bash"

IP="$(pct exec "$CTID" -- hostname -I | awk '{print $1}')"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Range log LXC is ready."
echo "  URL:     http://${IP}/"
echo "  CT ID:   ${CTID}"
echo "  Root PW: ${ROOTPW}"
echo "Save the password if you need pct enter / SSH later."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
