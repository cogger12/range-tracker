# Proxmox LXC deployment

The production app is static files (`dist/`). The container only needs **nginx**; no Node.js at runtime.

## One command from the Proxmox host (like helper-scripts)

This mirrors the “paste in the Proxmox shell” flow used by [Proxmox VE Helper-Scripts](https://github.com/community-scripts/ProxmoxVE) / [community-scripts.org](https://community-scripts.org), but **stays self-contained in your repo** (it does not load their `build.func`). To get a script listed in the official catalog, new apps go through [ProxmoxVED](https://github.com/community-scripts/ProxmoxVED).

### Prerequisite: a GitHub release with the bundle

1. Push this repository to GitHub (any name is fine).
2. Create a version tag so CI publishes `range-tracker-lxc.tar.gz` (see [`.github/workflows/release.yml`](../.github/workflows/release.yml)):

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. Wait for the **Release** workflow to finish; confirm the release asset exists on GitHub.

### Run on the Proxmox node (host shell, as `root`)

For this repo (`cogger12/range-tracker`) the one-liner is:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/cogger12/range-tracker/main/deploy/ct-range-tracker.sh)"
```

Optional environment variables (all optional except `GITHUB_REPO` for this flow):

| Variable | Purpose |
|----------|---------|
| `RELEASE_TAG` | Pin a release (e.g. `v0.1.0`) instead of “latest” |
| `TARBALL_URL` | Full URL to `range-tracker-lxc.tar.gz` if not on GitHub Releases |
| `INSTALL_SCRIPT_URL` | Override where `install-in-ct.sh` is fetched from |
| `CTID`, `STORAGE`, `BRIDGE`, `HOSTNAME`, `DISK_GB`, `CORES`, `MEMORY_MB` | CT layout |

The script creates a **Debian 12** unprivileged CT, starts it, installs `curl`, then runs `install-in-ct.sh`, which pulls your **latest GitHub release** tarball and runs `lxc-setup.sh`. At the end it prints the CT IP, VMID, and a generated root password.

**Template:** the host must already have a local `debian-12-standard` template (`pveam update && pveam download local debian-12-standard_amd64.tar.zst`). Override with `OSTEMPLATE=local:vztmpl/<file>` if needed.

### Install only (existing Debian/Ubuntu CT)

If you created the CT yourself:

```bash
curl -fsSL "https://raw.githubusercontent.com/cogger12/range-tracker/main/deploy/install-in-ct.sh" | bash
```

Or set `RELEASE_TAG` / `TARBALL_URL` as documented in `install-in-ct.sh`.

---

## 1. Manual: Create the LXC

1. In Proxmox: **Create CT** (not VM).
2. **Template**: Debian 12 or Ubuntu 22.04/24.04 (standard, unprivileged is fine).
3. **Resources**: 1 vCPU, 512 MB RAM, 2–4 GB disk is plenty.
4. **Network**: DHCP or static IPv4; note the IP for your browser or reverse proxy.

No special options are required (nesting, FUSE, etc. are not needed for nginx + static files).

## 2. Put the built app on the container

**Option A — bundle from your dev machine (recommended)**

On the machine where this repo lives:

```bash
chmod +x deploy/package-for-lxc.sh
./deploy/package-for-lxc.sh
```

This runs `npm ci`, `npm run build`, and writes `deploy/lxc-bundle/range-tracker-lxc.tar.gz`.

Copy the archive to the LXC (replace `CT_IP`):

```bash
scp deploy/lxc-bundle/range-tracker-lxc.tar.gz root@CT_IP:/root/
```

On the LXC:

```bash
cd /root
tar xzf range-tracker-lxc.tar.gz
cd range-tracker
chmod +x deploy/lxc-setup.sh
./deploy/lxc-setup.sh
```

**Option B — git clone on the LXC**

Install Node on the CT only if you build there:

```bash
apt update && apt install -y git
# install Node 20+ (nodesource or distro packages), then:
git clone <your-repo-url> range-tracker
cd range-tracker
npm ci && npm run build
chmod +x deploy/lxc-setup.sh
./deploy/lxc-setup.sh
```

## 3. Verify

Open `http://CT_IP/` in a browser. You should see Range log.

## 4. HTTPS / hostname (optional)

Terminating TLS on another layer is common:

- **Proxmox host** or a separate VM running **Caddy** / **Traefik** / **nginx** as reverse proxy to `http://CT_IP:80`, with Let’s Encrypt.
- Or install **certbot** on the same LXC and extend the nginx site with a `server_name` and TLS certificates.

## Updates

Rebuild and redeploy `dist/`:

```bash
./deploy/package-for-lxc.sh
scp deploy/lxc-bundle/range-tracker-lxc.tar.gz root@CT_IP:/root/
```

On the LXC, extract over the old tree or only replace `dist/` under `/var/www/range-tracker` after running `npm run build` locally, then:

```bash
./deploy/lxc-setup.sh
```

The setup script wipes `/var/www/range-tracker` and recopies from `dist/`, so re-running it after updating the repo’s `dist/` is enough.

## Data note

The app stores data in the **browser** (`localStorage`), not on the server. The LXC only serves the UI; backups are per-browser unless you add a backend later.
