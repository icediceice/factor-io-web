# Tailnet-only access for quotes.factor-io.com

The app listens directly on light-worker's Tailscale IPv4 address. WireGuard
encrypts the tailnet path; there is deliberately no TLS terminator, nginx,
Cloudflare Tunnel, Cloudflare proxy, Tailscale Serve or Funnel in front of it.
Browsers therefore use `http://`, without a padlock or secure-context APIs.

## DNS and service configuration

Create a DNS-only (grey-cloud) A record:

    quotes.factor-io.com -> 100.111.93.20

The address is in Tailscale's `100.64.0.0/10` CGNAT range. Public resolvers may
return it, but the public internet cannot route it. Do not proxy this record.

The service configuration is:

    NODE_ENV=production
    QUOTES_AUTH_MODE=tailscale
    QUOTES_BIND=127.0.0.1,100.111.93.20
    QUOTES_ALLOWED_EMAILS=icediceice@gmail.com
    QUOTES_AGENT_TOKEN=<random bearer token for loopback CLI use>

At boot, the production gate proves local tailscaled status and self-whois.
Each human request is then identified from the socket peer with `tailscale
whois`; client-supplied `Tailscale-User-*` headers are ignored. Lookup errors,
timeouts, malformed responses, non-tailnet peers and logins outside the
allowlist are denied.

Bearer-agent requests are authenticated before the human lane, so the loopback
listener remains available to the local CLI. In tailscale mode, an unauthenticated
loopback request is denied because loopback has no Tailscale whois identity.
State-changing browser requests must come from the app's own origin, and API
`POST`/`PUT` bodies must use `application/json`; this prevents another web page
from spending the operator's ambient tailnet identity.

## Verification

From an allowlisted tailnet device, open:

    http://quotes.factor-io.com

Create or edit a record and confirm `audit_log.actor` contains the Tailscale
login, not `dev` or `agent`. Send a forged `Tailscale-User-Login` header and
confirm it changes nothing. On light-worker, confirm the process listens only
on `127.0.0.1:8787` and `100.111.93.20:8787`, never `0.0.0.0` or a LAN address.
From a device outside the tailnet, confirm the DNS result is a 100.x address
and no connection reaches the process.

## Rollback

Delete the DNS A record and set `QUOTES_BIND=127.0.0.1`, then restart the user
service. This immediately removes tailnet access while preserving the local
CLI and database; the human UI is intentionally unavailable on loopback in
tailscale mode. Restoring public access is a separate change: use
`QUOTES_AUTH_MODE=oauth` and provide every OAuth setting listed in the README.
