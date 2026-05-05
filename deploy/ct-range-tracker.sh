#!/usr/bin/env bash
# Range tracker CT helper, shaped like the community-scripts one-liners.
# Run on the Proxmox VE host as root, e.g.:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/cogger12/range-tracker/main/deploy/ct-range-tracker.sh)"
set -euo pipefail

# Hard-coded to this repo so you don't have to export env vars.
GITHUB_REPO="cogger12/range-tracker"
BRANCH="${BRANCH:-main}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required on the Proxmox host."
  exit 1
fi

RAW_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/deploy/pve-create-install.sh"
echo "Fetching ${RAW_URL}..."

curl -fsSL "${RAW_URL}" | bash

