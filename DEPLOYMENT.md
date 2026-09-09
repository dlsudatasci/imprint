# Deploying Imprint to the university VM

Ubuntu VM, reachable over SSH, with the university's port-forward pointing at
**port 80**. nginx owns port 80 and proxies to Next.js on 3000.

Why not run Node on 80 directly: binding below 1024 needs root (or
`CAP_NET_BIND_SERVICE`), and you would lose static-asset caching, gzip, and the
place TLS goes later. nginx costs one config file and removes all three problems.

---

## Before you touch the VM

These are the things that will bite you, in the order they usually do.

### 1. `NEXTAUTH_URL` must match how people actually reach the site

This single variable decides two things: the OAuth callback URL, and the link in
password-reset emails. If it says `http://localhost:3000` in production, Google
sign-in fails with `redirect_uri_mismatch` and every reset email sends users to
their own machine.

Set it to the real origin, **no trailing slash**:

```
NEXTAUTH_URL=http://your-vm-hostname
```

If the university gives you a hostname with a non-standard port, include it.

### 2. Update the Google OAuth redirect URI

In Google Cloud Console → Credentials → your OAuth client, the authorised
redirect URI must be exactly:

```
<NEXTAUTH_URL>/api/auth/callback/google
```

Google sign-in will not work until this matches.

### 3. Generate a fresh `NEXTAUTH_SECRET`

```bash
openssl rand -base64 32
```

Don't reuse the development one. Changing it later logs everyone out.

### 4. Decide where MongoDB lives

- **Atlas** — add the VM's public IP to the network allowlist, or it will hang
  on connect with no useful error.
- **On the VM** — `sudo apt install mongodb-org`, and **do not expose 27017**.
  Bind it to `127.0.0.1` in `/etc/mongod.conf`.

### 5. Gmail needs an App Password

`EMAIL_PASS` is not the account password. Generate an App Password (requires 2FA
on the account) or password resets fail silently for the user and log an auth
error server-side.

### 6. Create the database indexes

The app checks uniqueness with a query-then-insert, which two simultaneous
signups can both pass. Only a unique index actually prevents duplicate accounts.
The same script adds the indexes the hot queries need — without them every
annotate page load scans the whole `sessions` collection.

```bash
npm run db:indexes
```

Run it against the production database once, before real traffic. It is
idempotent, and it reports duplicates rather than crashing if any already exist.

---

## One-time VM setup

```bash
ssh user@your-vm

# Node 22 (Ubuntu's default is too old for Next 16)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# Service user that owns nothing else and cannot log in
sudo useradd --system --create-home --home-dir /srv/imprint --shell /usr/sbin/nologin imprint
sudo mkdir -p /srv/imprint && sudo chown imprint:imprint /srv/imprint

# Secrets. 0600 so only the service user can read them.
sudo -u imprint nano /srv/imprint/.env      # paste from .env.example, filled in
sudo chmod 600 /srv/imprint/.env

# systemd unit and nginx site (copy from this repo's deploy/ directory)
sudo cp deploy/imprint.service /etc/systemd/system/imprint.service
sudo cp deploy/nginx.conf /etc/nginx/sites-available/imprint
sudo ln -sf /etc/nginx/sites-available/imprint /etc/nginx/sites-enabled/imprint
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
sudo systemctl daemon-reload && sudo systemctl enable imprint
```

Firewall, if `ufw` is on — note that 3000 is **not** opened, because only nginx
talks to it:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

---

## Deploying

From your laptop:

```bash
./deploy/deploy.sh user@your-vm
```

That builds locally, ships only `.next/standalone` + `.next/static` + `public/`,
restarts the service, and fails loudly with the last 40 log lines if the health
check doesn't come back.

Building locally is deliberate: the VM never needs a toolchain, never installs
dev dependencies, and a build that fails never reaches it.

---

## Checking it worked

```bash
curl -i http://your-vm-hostname/api/health     # {"status":"ok","database":"connected"}
sudo systemctl status imprint
journalctl -u imprint -f
```

`/api/health` pings MongoDB, so it returns **503** when the app is up but the
database is unreachable — which is exactly the failure that otherwise looks
healthy from the outside.

---

## Known gaps

Worth knowing before this carries real users.

- **No HTTPS.** Everything, including passwords and session cookies, crosses the
  network in clear text. If the VM gets a public hostname, run
  `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx`. If it
  is internal-only, at least tell participants not to reuse a password.
- **No Content-Security-Policy.** `next.config.js` sets the other standard
  headers but deliberately omits CSP — this app pulls Google Fonts, Google OAuth,
  Leaflet tiles and remote annotation images, and a CSP written without testing
  each origin breaks the site subtly. Add one once those origins are pinned.
- **No rate limiting.** `/api/auth/*` will accept unlimited login and
  password-reset attempts. nginx `limit_req` on `/api/auth/` is the cheap fix.
- **Sessions survive a password reset.** Sessions are stateless JWTs with no
  server-side store, so resetting a password does not end an attacker's existing
  session; it expires on its own schedule.
- **No backups.** Set up `mongodump` on a cron before you have data you would
  mind losing.
- **`telemetry_logs` grows without bound.** Fine for a study, worth a TTL index
  if this runs long-term.
