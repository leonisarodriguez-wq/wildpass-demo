#!/bin/sh
# Installs (or updates) the Seguros Wildpass website service and publishes it with Tailscale Funnel.
# Run with: sudo sh deploy/install.sh   (safe to run again; Tailscale must be installed and logged in first)
set -eu
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo sh deploy/install.sh" >&2; exit 1; fi

echo "1/4 Copying the wildpass-url command to /usr/local/bin"
install -m 0755 -o root -g root wildpass-url /usr/local/bin/wildpass-url

echo "2/4 Installing the service"
install -m 0644 -o root -g root wildpass-app.service /etc/systemd/system/wildpass-app.service
systemctl daemon-reload

echo "3/4 Stopping old copies started by hand (app on port 3000)"
for pid in $(pgrep -u leonisa_prueba -f '^node server\.js$' || true); do
  echo "   stopping process $pid"; kill "$pid" || true
done
sleep 2

echo "4/4 Starting the service (and enabling it at boot) and publishing it with Funnel"
systemctl enable --now wildpass-app.service
# --bg: Tailscale saves this setting, so the address keeps working after a reboot.
tailscale funnel --bg 3000

systemctl --no-pager --lines=0 status wildpass-app.service || true
echo
echo "Public address: $(/usr/local/bin/wildpass-url || echo 'Funnel not on yet')"
