#!/usr/bin/env bash
# demo-control/deploy/install.sh — install or update the demo control app on light-worker.
#
#   bash demo-control/deploy/install.sh
#   systemctl --user daemon-reload
#   systemctl --user enable --now factor-demo-control     # first install
#   systemctl --user restart factor-demo-control          # updates
#
# Copies the app to ~/.factor-demo-control (data/ with the demo state is kept) and
# only the four files colab_start.sh needs to ~/.factor-demo-control/backend: the
# helper uploads that whole directory to the VM, so tests and caches stay behind.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(dirname "$HERE")"
REPO="$(dirname "$APP")"
DEST="${DEMO_CONTROL_HOME:-$HOME/.factor-demo-control}"
UNIT_DIR="$HOME/.config/systemd/user"

mkdir -p "$DEST/backend" "$DEST/data" "$UNIT_DIR"
rsync -a --delete --exclude data/ --exclude backend/ --exclude tests/ --exclude deploy/ "$APP/" "$DEST/"
rsync -a --delete \
  "$REPO/demo/chat/backend/colab_start.sh" \
  "$REPO/demo/chat/backend/gateway.py" \
  "$REPO/demo/chat/backend/rag.py" \
  "$REPO/demo/chat/backend/requirements.txt" \
  "$DEST/backend/"
install -m 0644 "$HERE/factor-demo-control.service" "$UNIT_DIR/factor-demo-control.service"

echo "installed to $DEST and $UNIT_DIR/factor-demo-control.service"