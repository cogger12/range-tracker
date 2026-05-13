#!/usr/bin/env bash
# Install Range Tracker on any Debian/Ubuntu machine.
# Run as root:
#   curl -fsSL https://raw.githubusercontent.com/cogger12/range-tracker/main/deploy/install.sh | bash
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-cogger12/range-tracker}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/range-tracker"
WEB_ROOT="/var/www/range-tracker"
DATA_DIR="/var/lib/range-tracker"
NGINX_SITE="/etc/nginx/sites-available/range-tracker"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (or with sudo)."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script requires apt (Debian/Ubuntu)."
  exit 1
fi

echo "==> Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx curl ca-certificates git

# Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

# Clone or update repo
if [[ -d "${APP_DIR}/.git" ]]; then
  echo "==> Updating existing install..."
  cd "${APP_DIR}"
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
else
  echo "==> Cloning range-tracker..."
  rm -rf "${APP_DIR}"
  git clone --depth 1 --branch "${BRANCH}" "https://github.com/${GITHUB_REPO}.git" "${APP_DIR}"
fi

cd "${APP_DIR}"

echo "==> Installing dependencies..."
npm ci

echo "==> Building frontend..."
npm run build

# tsx for running TypeScript server
if ! command -v tsx >/dev/null 2>&1; then
  npm install -g tsx
fi

# Static frontend
echo "==> Deploying frontend to ${WEB_ROOT}..."
install -d -m 0755 "${WEB_ROOT}"
rm -rf "${WEB_ROOT:?}/"*
cp -a dist/. "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"

# Data directory + JWT secret
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
EnvironmentFile=-${DATA_DIR}/bootstrap.env
ExecStartPre=/bin/bash -c 'echo "JWT_SECRET=\$(cat ${DATA_DIR}/.jwt-secret)" > ${DATA_DIR}/.env'

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable range-tracker
systemctl restart range-tracker

# nginx
cp deploy/nginx-range-tracker.conf "${NGINX_SITE}"
if [[ -e /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi
ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/range-tracker
nginx -t
systemctl enable nginx
systemctl restart nginx

IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Range Tracker is ready!"
echo "  URL:  http://${IP}/"
echo "  Data: ${DATA_DIR}/"
echo ""
echo "  To update later, re-run this script."
echo ""
echo "  First admin (fresh database only):"
echo "    echo 'INITIAL_ADMIN_USERNAME=admin' > ${DATA_DIR}/bootstrap.env"
echo "    echo 'INITIAL_ADMIN_PASSWORD=your-secure-password' >> ${DATA_DIR}/bootstrap.env"
echo "    chmod 600 ${DATA_DIR}/bootstrap.env && systemctl restart range-tracker"
echo "    Then remove or clear bootstrap.env and restart again."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
