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

## Sign-up role

`SIGNUP_ROLE=annotator` in `/srv/imprint/.env` makes every new account an
annotator, on the live site and the study database, so annotators can sign up
and go straight to the annotator tutorial without an admin changing their role.
Anything else (missing, empty, `user`, a typo) makes contributors, which is the
default. `admin` can never be given this way, and existing accounts are never
changed: it only decides the role an account is created with.

Turning it on or off needs no deploy, only an edit and a restart:

```bash
sudo -u imprint nano /srv/imprint/.env      # add or remove SIGNUP_ROLE=annotator
sudo systemctl restart imprint
```

While it is on, the admin Accounts tab says "New sign-ups become annotators".
**Turn it off before contributors open**, or they will sign up as annotators
too (decided 6 Oct 2026: on while the site is not public).

---

## Pilot accounts

`SIGNUP_PILOT=true` in `/srv/imprint/.env` marks every new contributor account
as a pilot account (`isPilot: true` on the users document), so the five-person
pilot's accounts can be told apart from the annotators' data and test accounts
on staging (S11, decided 23 Oct 2026). Only exactly `true` turns it on. Anything
else (missing, empty, `TRUE`, `1`, a typo) is off, and then no `isPilot` field is
written. It never marks an annotator or an admin, so with `SIGNUP_ROLE=annotator`
also set, new accounts are annotators without `isPilot`. Existing accounts are
never changed. Nothing else changes for the participant: same sign-up form,
consent, 18+ confirmation, profile, tutorial and sessions.

**Staging only, and only after the freeze dump** (option A), so pilot accounts
never reach production:

```bash
sudo -u imprint nano /srv/imprint/.env      # add SIGNUP_PILOT=true
sudo systemctl restart imprint
```

While it is on, the admin Accounts tab says "New contributor sign-ups are marked
as pilot accounts", and every pilot account carries a **Pilot** badge. When the
pilot ends, remove the line and restart the same way. The badge stays on the
accounts it marked.

**Production never gets `SIGNUP_PILOT`.** Check it is absent before opening,
together with the `SIGNUP_ROLE` check.

---

## Email verification

A new password account confirms its email address before it can annotate (S9,
decided 21 Oct 2026). Registering sends "Confirm your email for IMPRINT" with a
link that works for 24 hours, and the person lands on "Check your inbox", which
can send a new link (at most one per five minutes). Until the link is opened, a
contributor can do the tutorial, finish the profile and read the guide, but
`/api/annotationGet`, `/api/annotationSubmit` and `/api/annotationComplete`
answer 403. Annotators and admins are never held back. Google sign-ins count as
confirmed. Addresses are stored and compared trimmed and lowercased, so the
unique index on `users.email` allows one account per address. The admin
Accounts tab shows each address as Confirmed or Not confirmed.

The mail uses the same settings as the password reset (`EMAIL_SERVICE`,
`EMAIL_USER`, `EMAIL_PASS`), and the link is built from `NEXTAUTH_URL`, so
both must be right on the server.

Deploying it takes two one-off scripts, run like the other scripts in
`scripts/` with `MONGODB_URI` and `MONGODB_DB` set for the database being
changed. Each only counts unless given `--apply`, and prints counts only:

1. **Before deploying**, lowercase the stored addresses:
   ```bash
   node --env-file=.env scripts/normalize-emails.mjs           # counts
   node --env-file=.env scripts/normalize-emails.mjs --apply
   ```
   It refuses if two accounts would end up with the same address and says how
   many. Resolve those accounts first, then run it again.
2. Deploy as usual (`./deploy/deploy.sh`).
3. **Straight after deploying**, mark the existing accounts confirmed from their
   sign-up date (until then existing contributors cannot annotate). Pilot
   accounts (S11) are left to confirm by email:
   ```bash
   node --env-file=.env scripts/verify-existing-emails.mjs           # counts
   node --env-file=.env scripts/verify-existing-emails.mjs --apply
   ```
4. Run `normalize-emails.mjs` once more without `--apply`. It should find 0.

The nginx request limit also covers `/api/auth/resend-verification` (see
"Rate limiting").

---

## Rate limiting

`deploy/nginx.conf` limits password sign-in, sign-up and the password reset
(S8, 26 Oct 2026), so nobody can keep guessing passwords, creating accounts or
sending reset emails. Per client address: 10 requests a minute, with a burst of
5 allowed at once, so a run of rapid attempts is refused from the 7th, and one
more is allowed every 6 seconds after that. A refused request gets **429** and
the forms say "Too many attempts. Please wait a minute and try again."

Limited (exact paths only): `/api/auth/callback/credentials` (password sign-in),
`/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`,
`/api/auth/verify-reset-token`, `/api/auth/resend-verification`. Never limited:
`/api/auth/session` and `/api/auth/csrf` (NextAuth calls them on every page),
`/api/auth/providers`, the Google callback, and every page.

**Check the client address first.** The VMs sit behind the campus gateway, and
the limit counts by client address. On staging, watch the access log while
signing in from a phone on mobile data:

```bash
sudo tail -f /var/log/nginx/access.log      # the first field is the client address
```

If every request shows the gateway's address, every user shares one address and
the limit would lock everyone out together. Then uncomment the `set_real_ip_from`
block at the top of the server in `deploy/nginx.conf` with the gateway's address
(or ask IT how the client address reaches the VM), and check the log again. **Do
not deploy the limit until the log shows real client addresses.**

`deploy.sh` does not install nginx config. On each VM, staging first, from the
repository:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/imprint
sudo nginx -t && sudo systemctl reload nginx
```

Then check it on staging. Each line is one invalid sign-up, refused by the app
(422) until the limit answers 429, and ordinary pages keep answering 200:

```bash
for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{}' http://your-vm-hostname/api/auth/register; done
curl -s -o /dev/null -w "%{http_code}\n" http://your-vm-hostname/api/auth/session
```

Wait a minute before trying the forms after this, since the loop used the
address's attempts.

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
- **The request limit depends on the client address.** Behind the campus
  gateway it is only safe once the access log shows real client addresses (see
  "Rate limiting").
- **Sessions survive a password reset.** Sessions are stateless JWTs with no
  server-side store, so resetting a password does not end an attacker's existing
  session; it expires on its own schedule.
- **No backups.** Set up `mongodump` on a cron before you have data you would
  mind losing.
- **`telemetry_logs` grows without bound.** Fine for a study, worth a TTL index
  if this runs long-term.
