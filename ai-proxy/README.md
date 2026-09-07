# Factor IO MiniMax proxy

Holds the MiniMax credential server-side so `tco-calculator.html` can ship with
no API-key field and no token in its JavaScript.

The browser POSTs the exact OpenAI-compatible Chat Completions body that
`tco-calculator/chat.js` already builds, and sends **no** `Authorization`
header. `chat.js:requestChatTurn` only sets that header when a token is passed,
so pointing the endpoint at this proxy needed no change to the request path.

## Shape

```
browser ──▶ cloudflared (ai.factor-io.com) ──▶ nginx :80 ──▶ node :8790 ──▶ api.minimax.io
                                                                 ▲
                                                    Bearer MINIMAX_API_KEY
                                                    from the EnvironmentFile
```

Cloudflare terminates TLS at the edge, so nothing here manages a certificate.

## Contract

| Route | Method | Behaviour |
|---|---|---|
| `/healthz` | GET | `{ok, credential, upstream, models}` — reports whether a credential is loaded, never its value |
| `/v1/chat/completions` | POST | validates, injects the credential, forwards, returns the upstream body unmodified |
| `/v1/chat/completions` | OPTIONS | CORS preflight |

Refusals are pinned to the calculator's own usage so an open prototype endpoint
cannot be repurposed as free general-purpose inference:

- model must be in `MINIMAX_ALLOWED_MODELS` (default `MiniMax-M3`)
- body capped at `MAX_BODY_BYTES` (default 256 KB) → `413`
- `stream: true` refused → this proxy returns complete responses only
- `max_completion_tokens` / `max_tokens` clamped to `MAX_COMPLETION_TOKENS`
- CORS `Access-Control-Allow-Origin` echoed only for `ALLOWED_ORIGINS`

**There is deliberately no rate limit or quota.** That was an explicit operator
decision for the prototype; authentication is being added separately. Until it
lands, this hostname is an open endpoint that spends the account's MiniMax
credit — the contract rules above narrow what it can be *used for*, not how much.

## Logging

Method, route, status, model, byte counts and duration. Never the credential,
never a prompt, never a completion. The upstream error path reports a fixed
string rather than the caught error object, because a thrown `fetch` error can
carry the request init — and therefore the header — in some runtimes.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `MINIMAX_API_KEY` | — | required; absent ⇒ `/healthz` reports `credential:false` and POST returns `503` |
| `PORT` / `HOST` | `8790` / `127.0.0.1` | loopback only; nginx is the only reachable front |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | |
| `MINIMAX_ALLOWED_MODELS` | `MiniMax-M3` | comma-separated |
| `ALLOWED_ORIGINS` | `https://studio.factor-io.com`, `http://127.0.0.1:8781`, `http://localhost:8781` | comma-separated |
| `MAX_BODY_BYTES` | `262144` | |
| `MAX_COMPLETION_TOKENS` | `4096` | |
| `UPSTREAM_TIMEOUT_MS` | `60000` | nginx allows 90s above this |

A missing credential does **not** exit the process. `Restart=on-failure` would
turn a config typo into an endless restart loop; reporting it on `/healthz` and
`503` is the debuggable failure.

## Install (light-worker)

```
# 1. code + credential
mkdir -p ~/factor-ai-proxy
cp server.mjs ~/factor-ai-proxy/
install -m 600 /dev/null ~/factor-ai-proxy/.env      # then write MINIMAX_API_KEY=...

# 2. service
cp deploy/factor-ai-proxy.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now factor-ai-proxy

# 3. nginx
sudo cp deploy/nginx-ai.conf /etc/nginx/sites-available/factor-ai
sudo ln -sfn /etc/nginx/sites-available/factor-ai /etc/nginx/sites-enabled/factor-ai
sudo nginx -t
sudo systemctl reload nginx

# 4. tunnel  (order matters — the new hostname must precede http_status:404)
sudo cp deploy/cloudflared-config.yml /etc/cloudflared/config.yml
cloudflared tunnel route dns 7f569c27-159a-409d-b5f1-16a39df11d0f ai.factor-io.com
sudo systemctl restart cloudflared
```

## Rollback

```
sudo rm -f /etc/nginx/sites-enabled/factor-ai
sudo systemctl reload nginx
sudo cp /etc/cloudflared/config.yml.bak.<ts> /etc/cloudflared/config.yml
sudo systemctl restart cloudflared
systemctl --user disable --now factor-ai-proxy
```

The calculator page keeps working throughout — losing the proxy costs the AI
assist, not the deterministic calculator.