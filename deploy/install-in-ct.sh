#!/usr/bin/env bash
# Run inside a fresh Debian/Ubuntu LXC as root (also invoked by pve-create-install.sh).
# Downloads the release tarball from GitHub and runs lxc-setup.sh.
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-}"
RELEASE_TAG="${RELEASE_TAG:-}"
TARBALL_URL="${TARBALL_URL:-}"

if [[ -z "$GITHUB_REPO" && -z "$TARBALL_URL" ]]; then
  echo "Set GITHUB_REPO (owner/name) or TARBALL_URL to a range-tracker-lxc.tar.gz"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  echo "Install curl or wget."
  exit 1
fi

download() {
  local url="$1"
  local dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -A 'range-tracker-install' "$url" -o "$dest"
  else
    wget -qO "$dest" --user-agent='range-tracker-install' "$url"
  fi
}

if [[ -z "$TARBALL_URL" ]]; then
  if [[ -z "$RELEASE_TAG" ]]; then
    api="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
    json=""
    if command -v curl >/dev/null 2>&1; then
      json="$(curl -fsSL -A 'range-tracker-install' "$api" 2>/dev/null || true)"
    else
      json="$(wget -qO- --user-agent='range-tracker-install' "$api" 2>/dev/null || true)"
    fi
    if [[ -z "$json" ]]; then
      echo "Could not reach GitHub API. Set RELEASE_TAG (e.g. v1.0.0) or TARBALL_URL."
      exit 1
    fi
    RELEASE_TAG="$(printf '%s' "$json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    if [[ -z "$RELEASE_TAG" ]]; then
      echo "No GitHub release found for ${GITHUB_REPO}. Create a v* release (CI publishes the tarball) or set TARBALL_URL."
      exit 1
    fi
    echo "Using release ${RELEASE_TAG}"
  fi
  TARBALL_URL="https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}/range-tracker-lxc.tar.gz"
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

echo "Downloading bundle…"
download "$TARBALL_URL" "${WORKDIR}/bundle.tar.gz"
tar -xzf "${WORKDIR}/bundle.tar.gz" -C "${WORKDIR}"

SETUP="${WORKDIR}/range-tracker/deploy/lxc-setup.sh"
if [[ ! -f "$SETUP" ]]; then
  echo "Bundle layout unexpected (missing range-tracker/deploy/lxc-setup.sh)."
  exit 1
fi
chmod +x "$SETUP"
bash "$SETUP"
