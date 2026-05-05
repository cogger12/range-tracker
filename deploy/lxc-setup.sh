#!/usr/bin/env bash
# Run inside a fresh Debian/Ubuntu LXC on Proxmox (as root).
# Prereq: this repo (or at least dist/ + deploy/) is present on the container,
# and `npm run build` has been run so ./dist exists — or copy dist/ in before running.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST="${REPO_ROOT}/dist"
WEB_ROOT="/var/www/range-tracker"
NGINX_SITE="/etc/nginx/sites-available/range-tracker"

if [[ ! -f "${DIST}/index.html" ]]; then
  echo "Missing ${DIST}/index.html"
  echo "On your dev machine: cd to the repo, run: npm ci && npm run build"
  echo "Then copy this repo (or at least dist/ and deploy/) onto the LXC and re-run."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script expects apt (Debian/Ubuntu LXC)."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx

install -d -m 0755 "${WEB_ROOT}"
rm -rf "${WEB_ROOT:?}/"*
cp -a "${DIST}/." "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"

cp "${SCRIPT_DIR}/nginx-range-tracker.conf" "${NGINX_SITE}"

if [[ -e /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi
ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/range-tracker

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "Range tracker is being served at http://$(hostname -I | awk '{print $1}')/"
echo "Point your reverse proxy or DNS to this container if needed."
