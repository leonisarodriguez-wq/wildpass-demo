#!/bin/sh
# Installs (or updates) the two Seguros Wildpass services. Run with: sudo sh deploy/install.sh
# Safe to run again. Never restarts a tunnel that is already running (that would change the public address).
set -eu
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo sh deploy/install.sh" >&2; exit 1; fi

echo "1/4 Copying programs to /usr/local/bin"
install -m 0755 -o root -g root /home/leonisa_prueba/.local/bin/cloudflared /usr/local/bin/cloudflared
install -m 0755 -o root -g root wildpass-save-url /usr/local/bin/wildpass-save-url
install -m 0755 -o root -g root wildpass-url /usr/local/bin/wildpass-url

echo "2/4 Installing the services"
install -m 0644 -o root -g root wildpass-app.service /etc/systemd/system/wildpass-app.service
install -m 0644 -o root -g root wildpass-tunnel.service /etc/systemd/system/wildpass-tunnel.service
systemctl daemon-reload

echo "3/4 Stopping old copies started by hand (app on port 3000, old tunnel)"
for pid in $(pgrep -u leonisa_prueba -f '^node server\.js$' || true) \
           $(pgrep -u leonisa_prueba -f '^/home/leonisa_prueba/\.local/bin/cloudflared tunnel' || true); do
  echo "   stopping process $pid"; kill "$pid" || true
done
sleep 2

echo "4/4 Starting the services (and enabling them at boot)"
systemctl enable --now wildpass-app.service
systemctl enable --now wildpass-tunnel.service

systemctl --no-pager --lines=0 status wildpass-app.service wildpass-tunnel.service || true
echo
echo "Public address: $(/usr/local/bin/wildpass-url || echo 'not ready yet, try wildpass-url in a few seconds')"
