# Range Tracker

A self-hosted web app for tracking shooting range visits, round counts, and ammo costs. Multi-user with simple username/password accounts.

## Features

- **Visit logging** — date, notes, and multiple ammo lines per visit
- **Ammo catalog** — save calibers with default cost-per-round for quick entry
- **Dashboard stats** — total range days, rounds fired, and ammo spend
- **Multi-user** — each user has their own data, isolated from others
- **Dark mode** — automatic, follows your system preference

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite |
| Backend | Express 5, Node.js |
| Database | SQLite (via `node:sqlite`) |
| Auth | bcrypt + JWT (httpOnly cookies) |

## Deploy to Ubuntu / Debian

One command, run as root:

```bash
curl -fsSL https://raw.githubusercontent.com/cogger12/range-tracker/main/deploy/install.sh | bash
```

This installs Node.js, nginx, clones the repo, builds the frontend, and sets up a systemd service. When it finishes it prints the URL.

To **update** an existing install, just run the same command again.

### Reverse proxy

The app works behind an nginx/Caddy/Traefik reverse proxy. Forward traffic to the machine's port 80 and make sure headers are passed through:

```nginx
location / {
    proxy_pass http://<range-tracker-ip>;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Data location

| Path | Contents |
|------|----------|
| `/var/lib/range-tracker/range-tracker.db` | SQLite database (all user data) |
| `/var/lib/range-tracker/.jwt-secret` | JWT signing key |
| `/opt/range-tracker/` | Application code |
| `/var/www/range-tracker/` | Built frontend |

## Local development

```bash
# Install dependencies
npm install

# Start the API server (port 3001)
npm run dev:server

# In another terminal, start the frontend (port 5173, proxies /api to 3001)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), create an account, and start logging.

## Project structure

```
src/
  App.tsx           UI components (auth, visits, ammo catalog)
  api.ts            Fetch wrappers for all API endpoints
  useAuth.ts        Authentication hook
  useRangeData.ts   Data fetching and mutation hook
  types.ts          TypeScript type definitions
  storage.ts        localStorage helpers (used for data migration)

server/
  index.ts          Express app entry point
  db.ts             SQLite setup and schema
  auth.ts           Register, login, logout, JWT middleware
  routes/
    ammo.ts         CRUD for ammo types
    visits.ts       CRUD for visits and line items

deploy/
  install.sh        One-command installer for Ubuntu/Debian
  nginx-range-tracker.conf
```

## License

MIT
