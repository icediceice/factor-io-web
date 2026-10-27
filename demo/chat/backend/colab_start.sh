#!/usr/bin/env bash
# colab_start.sh — boot the Factor IO chat demo backend on a Colab GPU VM.
#
#   Strata (Qwen3.8-Flash-Next) on 127.0.0.1:8080   local only, never exposed
#   gateway.py (FastAPI)        on 127.0.0.1:8000   sessions, files, retrieval, queue, access key
#   cloudflared quick tunnel    https://<random>.trycloudflare.com -> :8000
#
# Prints a connect link: https://studio.factor-io.com/demo/chat/#api=<tunnel>&key=<key>
# Everything dies with the VM, including customers' uploaded files.
#
# Environment (all optional):
#   MODEL      auto | nvfp4 | iq3_s | iq3_xxs | iq2_xs | q2_0   (default auto: picked from RAM and disk)
#   CONTEXT    Strata context, e.g. 32k, 64k, 128k              (default 64k)
#   PARALLEL   answers generated at once, 1-8                   (default 2)
#   DEMO_KEY   access key in the link                           (default: random per boot)
#   PAGE_URL   where the chat page lives                        (default https://studio.factor-io.com/demo/chat/)
#   DATA_DIR   model download folder                            (default /content/strata-models)
#   KEEPALIVE  1 = stay in the foreground and report health     (default 1; the notebook sets 0)
#
# CAUTION, from Strata's docs: `strata launch` with no engine for this machine
# EXITS 0 AND STARTS NOTHING. Readiness is judged only by GET /health below,
# never by an exit code.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="$HERE/logs"
STATUS="$LOGS/status.json"
mkdir -p "$LOGS" "$HERE/bin"

MODEL="${MODEL:-auto}"
CONTEXT="${CONTEXT:-64k}"
PARALLEL="${PARALLEL:-2}"
PAGE_URL="${PAGE_URL:-https://studio.factor-io.com/demo/chat/}"
DATA_DIR="${DATA_DIR:-/content/strata-models}"
KEEPALIVE="${KEEPALIVE:-1}"
STRATA_WAIT_S="${STRATA_WAIT_S:-1800}"
PY="${PYTHON:-python3}"

log() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# status KEY=VALUE ... — merge fields into logs/status.json (the notebook and /api/health read it)
status() {
  "$PY" - "$STATUS" "$@" <<'PY'
import json, sys, time
path, pairs = sys.argv[1], sys.argv[2:]
try:
    data = json.load(open(path))
except (OSError, ValueError):
    data = {}
for p in pairs:
    k, _, v = p.partition("=")
    data[k] = int(v) if v.isdigit() else v
data["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
json.dump(data, open(path, "w"), indent=2)
PY
}

fail() {
  status state=failed "message=$1"
  log "FAILED: $1"
  for f in "$LOGS"/*.log; do [ -f "$f" ] && { echo "--- tail $f"; tail -n 30 "$f"; }; done
  exit 1
}

wait_for() {  # wait_for <url> <seconds> <label>
  local url="$1" secs="$2" label="$3" t=0
  until curl -sf -o /dev/null "$url"; do
    t=$((t + 5)); [ "$t" -ge "$secs" ] && return 1
    [ $((t % 60)) -eq 0 ] && log "still waiting for $label (${t}s)"
    sleep 5
  done
}

rm -f "$STATUS"
status state=checking message="Checking the hardware"

# ---------------------------------------------------------------- hardware
command -v nvidia-smi >/dev/null || fail "No NVIDIA GPU. In Colab: Runtime > Change runtime type > G4."
IFS=',' read -r GPU VRAM_MB DRIVER < <(nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits | head -n1)
GPU="$(echo "$GPU" | xargs)"; DRIVER="$(echo "$DRIVER" | xargs)"
VRAM_GB=$(( ${VRAM_MB// /} / 1024 ))
RAM_GB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 / 1024 ))
mkdir -p "$DATA_DIR"
DISK_GB=$(df -BG --output=avail "$DATA_DIR" | tail -n1 | tr -dc '0-9')
log "GPU $GPU (${VRAM_GB} GB VRAM, driver $DRIVER), RAM ${RAM_GB} GB, free disk ${DISK_GB} GB"
status "gpu=$GPU" "vram_gb=$VRAM_GB" "ram_gb=$RAM_GB" "disk_free_gb=$DISK_GB" "driver=$DRIVER"

# ------------------------------------------------------------------- model
# Thresholds from Strata docs/MODELS.md: NVFP4 needs ~80 GB RAM for every expert
# plus ~10 GB for the system, and 128 GB of download (+~6 GB MTP draft layer).
if [ "$MODEL" = auto ]; then
  if [ "$RAM_GB" -ge 100 ] && [ "$DISK_GB" -ge 150 ]; then MODEL=nvfp4; WHY="RAM ${RAM_GB} GB >= 100 and disk ${DISK_GB} GB >= 150"
  elif [ "$RAM_GB" -ge 65 ] && [ "$DISK_GB" -ge 90 ]; then MODEL=iq3_s; WHY="RAM ${RAM_GB} GB >= 65 and disk ${DISK_GB} GB >= 90"
  else MODEL=q2_0; WHY="smallest pack for RAM ${RAM_GB} GB / disk ${DISK_GB} GB"
  fi
else
  WHY="set by MODEL"
fi
case "$MODEL" in
  nvfp4) FAMILY=nvfp4; SIZE=NVFP4 ;;
  iq3_s|iq3_xxs|iq2_xs|q2_0) FAMILY=qwen; SIZE="$MODEL" ;;
  *) fail "Unknown MODEL '$MODEL' (use auto, nvfp4, iq3_s, iq3_xxs, iq2_xs or q2_0)" ;;
esac
log "Model: Qwen3.8-Flash-Next $SIZE ($WHY)"
status "family=$FAMILY" "size=$SIZE" "model_reason=$WHY"

# ------------------------------------------------------------------ strata
STRATA="$(command -v strata || true)"
[ -z "$STRATA" ] && [ -x "$HOME/.local/bin/strata" ] && STRATA="$HOME/.local/bin/strata"
if [ -z "$STRATA" ]; then
  status state=installing message="Installing Strata"
  log "Installing Strata"
  curl -fsSL https://github.com/Niko1221/Strata/releases/latest/download/install.sh -o /tmp/strata-install.sh
  sh /tmp/strata-install.sh > "$LOGS/strata-install.log" 2>&1 || fail "Strata install failed (see strata-install.log)"
  STRATA="$HOME/.local/bin/strata"
  [ -x "$STRATA" ] || STRATA="$(grep -oE '/[^ ]*/strata' "$LOGS/strata-install.log" | tail -n1)"
  [ -x "$STRATA" ] || fail "Strata installed but its binary was not found"
fi
"$STRATA" --version 2>/dev/null | head -n1 || true

if curl -sf -o /dev/null http://127.0.0.1:8080/health; then
  log "Strata already serving on :8080; reusing it"
else
  status state=downloading message="Downloading and loading Qwen3.8-Flash-Next $SIZE (first boot of a VM downloads the model; NVFP4 is 128 GB)"
  log "Launching Strata (download + load; this is the long part)"
  "$STRATA" launch --family "$FAMILY" --model "$SIZE" --data-dir "$DATA_DIR" \
    --context "$CONTEXT" --parallel "$PARALLEL" --vision off --tune skip \
    --access local --port 8080 --no-api-key --yes --no-tui 2>&1 | tee "$LOGS/strata-launch.log" || true  # judged by /health below
  status state=loading message="Waiting for the model to answer"
  wait_for http://127.0.0.1:8080/health "$STRATA_WAIT_S" "Strata /health" \
    || { "$STRATA" launch --status >> "$LOGS/strata-launch.log" 2>&1 || true; fail "Strata did not become healthy (no engine for this GPU, out of memory or disk?)"; }
fi
log "Strata is healthy"

# ----------------------------------------------------------------- gateway
status state=starting_gateway message="Starting the gateway"
"$PY" -m pip install -q -r "$HERE/requirements.txt" > "$LOGS/pip.log" 2>&1 || fail "pip install failed (see pip.log)"
DEMO_KEY="${DEMO_KEY:-$("$PY" -c 'import secrets; print(secrets.token_urlsafe(18))')}"
pkill -f "uvicorn gateway:app_from_env" 2>/dev/null || true
DEMO_KEY="$DEMO_KEY" PARALLEL="$PARALLEL" STATUS_FILE="$STATUS" \
  MODEL_LABEL="Qwen3.8-Flash-Next $SIZE" LLM_BASE_URL=http://127.0.0.1:8080/v1 \
  setsid nohup "$PY" -m uvicorn gateway:app_from_env --factory --app-dir "$HERE" \
    --host 127.0.0.1 --port 8000 --timeout-keep-alive 75 > "$LOGS/gateway.log" 2>&1 < /dev/null &
# The embedding model downloads on first start, before the port opens.
wait_for http://127.0.0.1:8000/api/ping 600 "gateway" || fail "Gateway did not start (see gateway.log)"
log "Gateway is up"

# ------------------------------------------------------------------ tunnel
status state=starting_tunnel message="Opening the public tunnel"
CF="$HERE/bin/cloudflared"
if [ ! -x "$CF" ]; then
  curl -fsSL -o "$CF" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$CF"
fi
pkill -f "cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000" 2>/dev/null || true
: > "$LOGS/tunnel.log"
setsid nohup "$CF" tunnel --no-autoupdate --url http://127.0.0.1:8000 > "$LOGS/tunnel.log" 2>&1 < /dev/null &
TUNNEL=""
for _ in $(seq 1 60); do
  TUNNEL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel.log" | head -n1 || true)"
  [ -n "$TUNNEL" ] && break
  sleep 2
done
[ -n "$TUNNEL" ] || fail "cloudflared printed no tunnel address (see tunnel.log)"
# A fresh trycloudflare name can take a few seconds to resolve.
wait_for "$TUNNEL/api/ping" 120 "the tunnel" || fail "Tunnel $TUNNEL is not reachable from outside"

LINK="${PAGE_URL}#api=${TUNNEL}&key=${DEMO_KEY}"
status state=ready message="Ready" "tunnel=$TUNNEL" "link=$LINK"
cat <<EOF

==================================================================
  Factor IO chat demo is READY  ($GPU, Qwen3.8-Flash-Next $SIZE)

  Send the customer this link:
  $LINK

  Backend URL : $TUNNEL
  Access key  : $DEMO_KEY
  The link stops working when this Colab runtime stops.
==================================================================
EOF

[ "$KEEPALIVE" = 1 ] || exit 0
# Stay in the foreground so a detached runner keeps the job alive, and say
# loudly if a component dies.
while sleep 60; do
  s=ok
  curl -sf -o /dev/null http://127.0.0.1:8080/health || s="strata DOWN"
  curl -sf -o /dev/null http://127.0.0.1:8000/api/ping || s="$s, gateway DOWN"
  pgrep -f "cloudflared tunnel --no-autoupdate" >/dev/null || s="$s, tunnel DOWN"
  log "health: $s"
  [ "$s" = ok ] || status state=degraded "message=$s"
done