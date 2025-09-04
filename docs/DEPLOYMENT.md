# Deployment and Operations Guide

This document describes how this app is deployed on the VPS for `szkola.tkch.eu`: build, environment, systemd service, Nginx reverse proxy with TLS, and how to update (including branch-based deployments).

## Overview

- Runtime: Node.js 22.x
- App server: Express (serves API under `/v1` and static SPA from `dist/`)
- Port: `8787` (internal)
- Reverse proxy: Nginx
- TLS: Let’s Encrypt via Certbot
- Service user: `szkola`
- Project path: `/opt/szkola/stronaszkoly`
- Python (for scrapers): venv at `/opt/szkola/venv`

## Environment and Build

Run as `szkola` to install and build:

```
sudo -u szkola bash -lc '
cd /opt/szkola/stronaszkoly
node -v       # should be v22.x
npm ci
npm run build # produces dist/
'
```

Environment variables (systemd-managed):

- `NODE_ENV=production`
- `PORT=8787`
- `ADMIN_USER=admin`
- `ADMIN_PASS=<secure_password>`
- `ALLOWED_ORIGINS=https://szkola.tkch.eu`
- `PYTHON_PATH=/opt/szkola/venv/bin/python`

Python venv for scrapers:

```
sudo -u szkola bash -lc '
python3 -m venv /opt/szkola/venv
/opt/szkola/venv/bin/python -m pip install --upgrade pip
/opt/szkola/venv/bin/python -m pip install -r /opt/szkola/stronaszkoly/public/requirements.txt
'
```

## Systemd Service

Unit: `/etc/systemd/system/szkola.service`

Key fields:

```
[Service]
User=szkola
WorkingDirectory=/opt/szkola/stronaszkoly
Environment=NODE_ENV=production
Environment=PORT=8787
Environment=ADMIN_USER=admin
Environment=ADMIN_PASS=********
Environment=ALLOWED_ORIGINS=https://szkola.tkch.eu
Environment=PYTHON_PATH=/opt/szkola/venv/bin/python
ExecStart=/usr/bin/node server/server.js
Restart=on-failure
```

Manage the service:

```
sudo systemctl status szkola.service
sudo journalctl -u szkola.service -f
sudo systemctl restart szkola.service
sudo systemctl enable szkola.service
```

To change env values, edit the service file, then:

```
sudo systemctl daemon-reload
sudo systemctl restart szkola.service
```

## Nginx and TLS

Site file: `/etc/nginx/sites-available/szkola` (symlinked in `sites-enabled`).

- `szkola.tkch.eu`: proxies to `http://127.0.0.1:8787`.
- `tkch.eu` (+ `www.tkch.eu`): 301 → `https://szkola.tkch.eu/`.
- TLS: managed by Certbot, auto-renewed.

Certbot issuance example:

```
sudo certbot --nginx -d szkola.tkch.eu -d tkch.eu --redirect --agree-tos --email you@example.com
```

Renewals run via systemd timer. To test renewal:

```
sudo certbot renew --dry-run
```

## Content Security Policy (CSP)

In production, the app sends a strict CSP via `helmet` configured in `server/server.js`. It allows:

- Tailwind CDN script: `https://cdn.tailwindcss.com`
- Assets from `https://zse-zdwola.pl` and all subdomains
- Inline styles for initial page style

To allow additional domains (images, scripts, fonts, etc.), extend the CSP directives in `server/server.js` accordingly and restart the service.

## Health and Diagnostics

- Health: `GET /v1/health` → `{ ok: true }`
- Swagger (if present): `/docs`
- Logs: `sudo journalctl -u szkola.service -f`

## Update Workflow

Standard update from current branch:

```
sudo -u szkola bash -lc '
cd /opt/szkola/stronaszkoly
git pull --ff-only
npm ci
npm run build
'
sudo systemctl restart szkola.service
```

Update from a specific branch (e.g., `api-testing` or `main`):

```
sudo -u szkola bash -lc '
cd /opt/szkola/stronaszkoly
git fetch origin
git checkout api-testing      # or: main, feature/xyz
git reset --hard origin/api-testing
npm ci
npm run build
'
sudo systemctl restart szkola.service
```

Rollback to previous commit:

```
sudo -u szkola bash -lc '
cd /opt/szkola/stronaszkoly
git log --oneline -n 5
git checkout <good_commit_sha>
npm ci && npm run build
'
sudo systemctl restart szkola.service
```

## First-Time Provisioning (Reference)

1) Install Node 22 and tools:

```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
```

2) Clone repo and set ownership:

```
sudo useradd -r -s /usr/sbin/nologin -m -d /opt/szkola szkola || true
sudo mkdir -p /opt/szkola
sudo git clone https://github.com/troleqmaster816/stronaszkoly.git /opt/szkola/stronaszkoly
sudo chown -R szkola:szkola /opt/szkola
```

3) Build + configure venv and systemd (see sections above), then set up Nginx and issue TLS with Certbot.

## Notes

- Firewall: ensure ports 80/443 are open; internal app listens on 8787.
- Cookies are `Secure` in production; use HTTPS.
- CORS is restricted to `ALLOWED_ORIGINS`; add more if required.

