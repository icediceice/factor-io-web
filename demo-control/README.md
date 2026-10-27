# demo-control — one-click chat demo

A small page on light-worker that starts the
[chat-with-your-data demo](../demo/chat/) for a customer meeting: press
**Start demo**, wait about 15 minutes, copy the link. It replaces opening the
notebook in Colab by hand (`demo/chat/backend/factor_chat_backend.ipynb`).

```
operator browser (tailnet)
   │  http://demo.factor-io.com:8789   (https://demo.factor-io.com once caddy-worker serves it)
   ▼
light-worker  factor-demo-control.service  (node, 127.0.0.1 + 100.111.93.20 :8789)
   │  python colab_helper.py <base64 request>      Light-CF LightServer/mcptools/colab_helper.py
   ▼
Colab G4 VM   /content/factor-chat: colab_start.sh → Strata :8081, gateway :8000, cloudflared
   │
   ▼
customer      https://studio.factor-io.com/demo/chat/?api=https://<random>.trycloudflare.com
```

## Use

1. Open http://demo.factor-io.com:8789 from a device on the tailnet.
2. Leave the defaults (auto model, 64k context, 2 answers at once) or change them,
   then press **Start demo**. The page shows the four start-up steps and the VM's log.
3. When it says **Ready**, press **Copy link** and send the link to the customer.
4. Press **Stop demo** when the meeting ends. If you forget, it stops by itself
   6 hours after Start.

One demo runs at a time. If Colab does not confirm a stop, the page says the GPU
may still be billing and keeps **Stop the GPU** available; you can also run
`light_colab stop session:<the session shown on the page>`.

## Access

There is no login (the operator's choice). The app listens only on loopback and
light-worker's Tailscale address, and `demo.factor-io.com` is a DNS-only A record
to 100.111.93.20, so the name resolves publicly but only tailnet devices connect.

With no credential to steal, the remaining risk is a web page making the
operator's browser start a billed VM. The server refuses any request whose Host
is not in `DEMO_ALLOWED_HOSTS` (DNS rebinding), any POST that is not
`application/json` (a cross-site one would need a CORS preflight, which is never
granted), any POST marked cross-site by `Sec-Fetch-Site`, and any POST from an
Origin outside the allowlist. Settings are checked against a fixed list before
they reach the VM's shell command.

## The 6 hour cap

Three layers, so one failing does not leave a GPU billing:

1. **The app** stops the VM at Start + 6 h. The deadline is stored in
   `data/state.json`, so a restart of the app keeps it, and an app that was down
   past the deadline stops the VM as soon as it is back.
2. **The VM job** runs as `timeout 6h bash colab_start.sh`. colab_start.sh detaches
   Strata, the gateway and the tunnel, so this ends only the script; the next layer
   then frees the VM.
3. **Light's reaper**: the session is claimed with `max_hours 6, idle_minutes 15`,
   so once the job has ended the reaper stops the idle VM. It never stops a job
   that is still running before its 24 h limit, which is why layer 1 exists.

## Deploy (light-worker)

```bash
bash demo-control/deploy/install.sh
systemctl --user daemon-reload
systemctl --user enable --now factor-demo-control    # updates: systemctl --user restart factor-demo-control
CF_API_TOKEN=… node giveaway/deploy/dns-record.mjs demo.factor-io.com 100.111.93.20 \
  "demo control, tailnet only (demo-control/README.md)"
```

`install.sh` copies the app to `~/.factor-demo-control` (keeping `data/`) and only
`colab_start.sh`, `gateway.py`, `rag.py` and `requirements.txt` to
`~/.factor-demo-control/backend`, the directory uploaded to the VM. Run it again
after changing the demo backend. The unit's settings are in
`deploy/factor-demo-control.service`:

| Variable | Default | |
|---|---|---|
| `DEMO_BIND` | `127.0.0.1` | loopback or Tailscale addresses only |
| `DEMO_PORT` | `8789` | |
| `DEMO_ALLOWED_HOSTS` | (none) | required in production |
| `DEMO_COLAB_HELPER` | `/Git/Light-CF/LightServer/mcptools/colab_helper.py` | Light's helper, so demo VMs appear in `light_colab sessions` |
| `DEMO_COLAB_PYTHON` | `~/.local/share/uv/tools/google-colab-cli/bin/python` | |
| `DEMO_COLAB_CLI` | `~/.local/bin/colab` | |
| `DEMO_BACKEND` | `demo-control/backend` | |
| `DEMO_DATA` | `demo-control/data` | |
| `DEMO_CU_FLOOR` | `10` | refuse to rent below this Colab balance |

**Rollback:** `systemctl --user disable --now factor-demo-control`, then remove
`~/.config/systemd/user/factor-demo-control.service` and `~/.factor-demo-control`.
Stop any running demo first. The DNS record can stay; nothing answers it.

**HTTPS:** serving `https://demo.factor-io.com` through the tailnet-only
caddy-worker is a change to the Light-CF repo, tracked as a light_todo. Until
then use port 8789 over plain HTTP; the tailnet encrypts the traffic.

## Tests

```bash
node --test demo-control/tests/control.test.mjs
```

They run the real server and the real helper client against
`tests/fake_helper.py`, which speaks the helper's `LIGHTCOLAB:` contract, and
use a manual clock for the 6 hour cap.