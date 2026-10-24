-- Cat Countdown free-copy giveaway: a pool of store promo codes handed out one per
-- Google account, attributed to the campaign link the visitor came through.
-- Times are integer Unix seconds (UTC). See ../../deploy/README.md#giveaway.

CREATE TABLE campaigns (
  -- The slug in https://catcountdown.factor-io.com/free/<id>.
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-z0-9-]*'),
  name TEXT NOT NULL,
  -- Where the link is posted (e.g. "app showcase community"); operator notes only.
  source TEXT NOT NULL DEFAULT '',
  platforms TEXT NOT NULL DEFAULT 'android' CHECK (platforms IN ('android', 'ios', 'android,ios')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  max_claims INTEGER CHECK (max_claims IS NULL OR max_claims >= 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE codes (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  code TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 128),
  batch TEXT NOT NULL DEFAULT '',
  expires_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  added_at INTEGER NOT NULL,
  -- Issuance. Once set these are never cleared: revoking or re-importing a code
  -- must not hand an issued code to a second account.
  claimant TEXT,            -- Google account id (ID token "sub")
  email TEXT,               -- display/contact only, never the dedup key
  campaign_id TEXT REFERENCES campaigns(id),
  claimed_at INTEGER,
  UNIQUE (platform, code),
  CHECK ((claimant IS NULL) = (claimed_at IS NULL))
);

-- One code per Google account, across every campaign and platform.
CREATE UNIQUE INDEX codes_one_per_claimant ON codes(claimant) WHERE claimant IS NOT NULL;
CREATE INDEX codes_by_campaign ON codes(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX codes_available ON codes(platform, expires_at, id) WHERE claimant IS NULL AND revoked = 0;