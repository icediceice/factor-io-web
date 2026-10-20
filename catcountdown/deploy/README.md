# Cat Countdown Subdomain Launch Preparation (`catcountdown.factor-io.com`)

This directory holds the prepared configuration to serve the dedicated Cat Countdown landing page at `https://catcountdown.factor-io.com/`.

**Current status:** Prepared only (not launched live). The page is authored at `/Git/factor-io-web/cat-countdown.html` with a directory redirect at `/Git/factor-io-web/catcountdown/index.html`, and uses document-relative `assets/...` URLs so it renders identically under:

1. Local verification (`node scripts/serve.mjs` at `/cat-countdown.html` and `/catcountdown/`, or `file:///Git/factor-io-web/cat-countdown.html`)
2. GitHub Pages (`https://studio.factor-io.com/cat-countdown.html` and `https://studio.factor-io.com/catcountdown/`)
3. Subdomain root (`https://catcountdown.factor-io.com/`) once the nginx and Cloudflare Tunnel rules below are enabled

## Architecture

```
browser --> cloudflared (catcountdown.factor-io.com) --> nginx :80 --> /Git/factor-io-web/cat-countdown.html
```

- `nginx-catcountdown.conf` sets `root /Git/factor-io-web;` and maps `location = /` explicitly to `/cat-countdown.html`, `location = /cat-countdown.html` to itself, and `location ^~ /assets/` to `/Git/factor-io-web/assets/` (for screenshots, launch film, favicon, and Geist fonts). All other paths return `404` so consulting pages are never exposed on the app subdomain.
- `cloudflared-catcountdown.yml` is an **additive ingress fragment**, not a whole-file replacement for `/etc/cloudflared/config.yml`.

## Launch Steps (When Ready to Go Live)

```bash
# 1. Install and enable the nginx site
sudo cp /Git/factor-io-web/catcountdown/deploy/nginx-catcountdown.conf /etc/nginx/sites-available/factor-catcountdown
sudo ln -sfn /etc/nginx/sites-available/factor-catcountdown /etc/nginx/sites-enabled/factor-catcountdown
sudo nginx -t
sudo systemctl reload nginx

# 2. Verify local nginx Host routing before touching DNS
curl -sSI -H 'Host: catcountdown.factor-io.com' http://127.0.0.1/
curl -sSI -H 'Host: catcountdown.factor-io.com' http://127.0.0.1/assets/work/cat-countdown-home.webp

# 3. Back up /etc/cloudflared/config.yml and insert the ingress rule ABOVE "- service: http_status:404"
#    - hostname: catcountdown.factor-io.com
#      service: http://localhost:80
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak.$(date +%Y%m%d%H%M%S)
# Edit /etc/cloudflared/config.yml to insert the fragment from cloudflared-catcountdown.yml

# 4. Route DNS to the tunnel and restart cloudflared
cloudflared tunnel route dns 7f569c27-159a-409d-b5f1-16a39df11d0f catcountdown.factor-io.com
sudo systemctl restart cloudflared
```

## Rollback

```bash
sudo rm -f /etc/nginx/sites-enabled/factor-catcountdown
sudo systemctl reload nginx
# Restore the previous /etc/cloudflared/config.yml backup and restart cloudflared
sudo systemctl restart cloudflared
```
