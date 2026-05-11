#!/usr/bin/env bash
# Run inside a fresh Debian/Ubuntu LXC on Proxmox (as root).
# Prereq: this repo (or at least dist/ + server/ + deploy/) is present on the container,
# and `npm run build` has been run so ./dist exists — or copy dist/ in before running.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST="${REPO_ROOT}/dist"
WEB_ROOT="/var/www/range-tracker"
NGINX_SITE="/etc/nginx/sites-available/range-tracker"
APP_DIR="/opt/range-tracker"

if [[ ! -f "${DIST}/index.html" ]]; then
  echo "Missing ${DIST}/index.html"
  echo "On your dev machine: cd to the repo, run: npm ci && npm run build"
  echo "Then copy this repo (or at least dist/, server/, and deploy/) onto the LXC and re-run."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script expects apt (Debian/Ubuntu LXC)."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx curl ca-certificates

# Install Node.js LTS via NodeSource
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

# Static frontend
install -d -m 0755 "${WEB_ROOT}"
rm -rf "${WEB_ROOT:?}/"*
cp -a "${DIST}/." "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"

# Backend server
install -d -m 0755 "${APP_DIR}"
cp -a "${REPO_ROOT}/server" "${APP_DIR}/"
cp "${REPO_ROOT}/package.json" "${REPO_ROOT}/package-lock.json" "${APP_DIR}/"
cd "${APP_DIR}"
npm ci --omit=dev
npm install -g tsx

# Generate a persistent JWT secret
DATA_DIR="/var/lib/range-tracker"
install -d -m 0700 "${DATA_DIR}"
if [[ ! -f "${DATA_DIR}/.jwt-secret" ]]; then
  openssl rand -base64 32 > "${DATA_DIR}/.jwt-secret"
  chmod 600 "${DATA_DIR}/.jwt-secret"
fi

# systemd service
cat > /etc/systemd/system/range-tracker.service <<UNIT
[Unit]
Description=Range Tracker API
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/tsx server/index.ts
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=DATA_DIR=${DATA_DIR}
EnvironmentFile=-${DATA_DIR}/.env

# Read JWT secret from file
ExecStartPre=/bin/bash -c 'echo "JWT_SECRET=\$(cat ${DATA_DIR}/.jwt-secret)" > ${DATA_DIR}/.env'

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable range-tracker
systemctl restart range-tracker

# nginx
cp "${SCRIPT_DIR}/nginx-range-tracker.conf" "${NGINX_SITE}"

if [[ -e /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi
ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/range-tracker

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "Range tracker is being served at http://$(hostname -I | awk '{print $1}')/"
echo "API server running on port 3001 (proxied via nginx)."
echo "Data stored in ${DATA_DIR}/"
echo "Point your reverse proxy or DNS to this container if needed."
