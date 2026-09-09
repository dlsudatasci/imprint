#!/usr/bin/env bash
#
# One-time provisioning of the university VM. Run from your LAPTOP, not the VM,
# the same way deploy.sh works.
#
#   ./deploy/vm-setup.sh user@vm-host
#
# Installs Node 22, nginx and MongoDB, creates the service user and /srv/imprint,
# and installs the systemd unit and nginx site from this repo. Idempotent, so
# re-running it is safe.
#
# It does NOT write your secrets. It leaves a .env skeleton on the VM with
# NEXTAUTH_SECRET already generated, and you fill in the rest by hand.
#
# Optional flags:
#   --ufw     also enable the firewall (see the warning below before using)

set -euo pipefail

TARGET="${1:-}"
WITH_UFW=false
for arg in "$@"; do [[ "$arg" == "--ufw" ]] && WITH_UFW=true; done

if [[ -z "$TARGET" || "$TARGET" == --* ]]; then
  echo "usage: $0 user@vm-host [--ufw]" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Copying nginx site and systemd unit to $TARGET"
scp -q "$HERE/nginx.conf" "$HERE/imprint.service" "$TARGET:/tmp/"

echo "==> Provisioning (this takes a few minutes)"
ssh "$TARGET" WITH_UFW="$WITH_UFW" 'bash -s' <<'REMOTE'
set -euo pipefail
echo "--- OS ---"; . /etc/os-release; echo "$PRETTY_NAME"
if [[ "${VERSION_CODENAME:-}" != "noble" ]]; then
  echo "WARNING: expected Ubuntu 24.04 (noble), found ${VERSION_CODENAME:-unknown}." >&2
  echo "The MongoDB repository line below is codename-specific. Check it." >&2
fi

echo "--- Node 22 ---"
if ! command -v node >/dev/null || [[ "$(node -v | cut -c2-3)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "--- nginx ---"
command -v nginx >/dev/null || sudo apt-get install -y nginx
nginx -v 2>&1

echo "--- MongoDB 8.0 ---"
# Ubuntu's own repositories do not carry MongoDB, so this uses MongoDB's.
if ! command -v mongod >/dev/null; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y mongodb-org
fi
# Bind to loopback only. Port 27017 must never be reachable from outside:
# the deployment holds participant demographic data including disability
# status, and an exposed unauthenticated Mongo is how that ends up public.
sudo sed -i 's/^\( *bindIp:\).*/\1 127.0.0.1/' /etc/mongod.conf
sudo systemctl enable --now mongod
sleep 2
systemctl is-active mongod && echo "mongod listening on: $(sudo ss -tlnp | grep 27017 || echo '(not yet)')"

echo "--- service user and directory ---"
id -u imprint >/dev/null 2>&1 || \
  sudo useradd --system --create-home --home-dir /srv/imprint --shell /usr/sbin/nologin imprint
sudo mkdir -p /srv/imprint
sudo chown imprint:imprint /srv/imprint

echo "--- .env skeleton ---"
if sudo test -f /srv/imprint/.env; then
  echo "/srv/imprint/.env already exists, leaving it alone"
else
  SECRET="$(openssl rand -base64 32)"
  sudo tee /srv/imprint/.env >/dev/null <<ENVFILE
# Filled in by vm-setup.sh where it could be, by you where it could not.
# systemd reads this directly: no quotes, no export, no variable expansion.

# MUST match how participants actually reach the site, including the port,
# with no trailing slash. NextAuth builds OAuth callbacks and password-reset
# links from this, so a mismatch breaks sign-in and sends reset emails to
# the wrong host.
NEXTAUTH_URL=http://CHANGE-ME

NEXTAUTH_SECRET=$SECRET

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=imprint

EMAIL_SERVICE=gmail
EMAIL_USER=CHANGE-ME
EMAIL_PASS=CHANGE-ME-app-password-not-account-password

GOOGLE_ID=CHANGE-ME
GOOGLE_SECRET=CHANGE-ME
ENVFILE
  sudo chown imprint:imprint /srv/imprint/.env
  sudo chmod 600 /srv/imprint/.env
  echo "wrote /srv/imprint/.env (0600, NEXTAUTH_SECRET generated)"
fi

echo "--- systemd unit ---"
sudo cp /tmp/imprint.service /etc/systemd/system/imprint.service
sudo systemctl daemon-reload
sudo systemctl enable imprint >/dev/null
echo "enabled (not started: nothing deployed yet)"

echo "--- nginx site ---"
sudo cp /tmp/nginx.conf /etc/nginx/sites-available/imprint
sudo ln -sf /etc/nginx/sites-available/imprint /etc/nginx/sites-enabled/imprint
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

if [[ "${WITH_UFW}" == "true" ]]; then
  echo "--- firewall ---"
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
  sudo ufw status
fi

rm -f /tmp/nginx.conf /tmp/imprint.service
echo
echo "PROVISIONED."
REMOTE

cat <<EOF

==> Next, in order

1. Fill in the secrets on the VM:

     ssh $TARGET
     sudo -u imprint nano /srv/imprint/.env

   NEXTAUTH_URL is the one that matters most. Use exactly what a participant
   types, including the port, no trailing slash:

     NEXTAUTH_URL=http://your-host.dlsu.edu.ph:YOUR_PORT

2. Update the Google OAuth redirect URI in Google Cloud Console to:

     <NEXTAUTH_URL>/api/auth/callback/google

   Sign-in fails with redirect_uri_mismatch until this matches exactly.

3. Deploy:

     ./deploy/deploy.sh $TARGET

4. Create the database indexes, once, against production:

     npm run db:indexes

   DEPLOYMENT.md explains why: uniqueness is enforced by query-then-insert,
   which two simultaneous signups can both pass. Only a unique index actually
   prevents duplicate accounts.

5. Check it:

     curl -i http://your-host:YOUR_PORT/api/health

NOTE ON --ufw
   Not enabled unless you asked for it. Your SSH arrives on a forwarded
   external port that maps to 22 internally, so 'ufw allow OpenSSH' should
   cover it, but a firewall misconfiguration on a remote VM you cannot
   physically reach is a bad way to lose an afternoon. Deploy first, confirm
   everything works, then enable it.
EOF
