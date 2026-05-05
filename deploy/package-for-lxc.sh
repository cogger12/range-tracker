#!/usr/bin/env bash
# Run on your dev machine: creates deploy/lxc-bundle/range-tracker-lxc.tar.gz
# Upload the tarball to the LXC, extract, then run deploy/lxc-setup.sh inside.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ "${SKIP_NPM_CI:-}" != 1 ]]; then
  npm ci
fi
if [[ ! -f "${ROOT}/dist/index.html" ]]; then
  npm run build
fi

BUNDLE_DIR="${ROOT}/deploy/lxc-bundle"
STAGE="${BUNDLE_DIR}/stage"
rm -rf "${BUNDLE_DIR}"
mkdir -p "${STAGE}/range-tracker/deploy"

cp -a "${ROOT}/dist" "${STAGE}/range-tracker/"
cp -a "${ROOT}/deploy/lxc-setup.sh" "${ROOT}/deploy/nginx-range-tracker.conf" "${STAGE}/range-tracker/deploy/"
chmod +x "${STAGE}/range-tracker/deploy/lxc-setup.sh"

ARCHIVE="${BUNDLE_DIR}/range-tracker-lxc.tar.gz"
tar -czf "${ARCHIVE}" -C "${STAGE}" range-tracker

echo "Created ${ARCHIVE}"
echo "On the LXC: tar xzf range-tracker-lxc.tar.gz && cd range-tracker && sudo ./deploy/lxc-setup.sh"
