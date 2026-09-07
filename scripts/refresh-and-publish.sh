#!/usr/bin/env bash
# refresh-and-publish.sh — the unattended half of the refresh.
#
# Run by the factor-tco-refresh systemd user timer on light-worker. It exists
# because a snapshot that expires silently is worse than one that is obviously
# old: the calculator's SourceStatus envelope banners the moment observed_at
# passes its window, and this keeps that from happening in the first place.
#
# IT DOES NOT RUN IN THE DEVELOPMENT CHECKOUT, AND THAT IS THE POINT. An
# unattended `git commit` inside /Git/factor-io-web would race whatever the
# operator has open at 06:00. This works in a dedicated clone that nothing else
# writes to, and every guard below is there to make it REFUSE rather than guess:
#
#   exit 2  not on the publish branch
#   exit 3  working tree dirty          -> a human left something behind
#   exit 4  history diverged from origin -> never silently discarded
#   exit 5  refresh itself failed        -> old data stands, banner does its job
#   exit 6  refresh touched files outside tco-calculator/data
#
# Exit 0 with "no change" is a SUCCESS: prices simply did not move.
#
# NOTHING HERE IS EVIDENCE OF FRESHNESS. If this script dies, is disabled, or
# never runs again, the ONLY thing that tells a visitor is the client-side
# SourceStatus envelope reading observed_at out of the data it actually loaded.
# Do not add a "last refreshed by CI" line to any page: a freshness signal that
# can lie is worse than none, because it is believed.
set -euo pipefail

CLONE="${FACTOR_TCO_CLONE:-/home/ice/factor-tco-refresh}"
BRANCH="${FACTOR_TCO_BRANCH:-main}"
DATA="tco-calculator/data"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

cd "$CLONE"

current="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current" != "$BRANCH" ]; then
  log "refuse: clone is on '$current', not '$BRANCH'"
  exit 2
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  log "refuse: working tree is dirty — a previous run or a human left changes here"
  git status --short
  exit 3
fi

git fetch --quiet origin "$BRANCH"
# --ff-only, never reset --hard: if this clone has somehow acquired its own
# commits, that is a situation a person should see, not one to overwrite.
if ! git merge --ff-only "origin/$BRANCH" --quiet; then
  log "refuse: local history has diverged from origin/$BRANCH"
  exit 4
fi

log "refreshing…"
if ! node scripts/refresh-pricing.mjs; then
  log "refresh FAILED — the previous snapshot stands and the page will banner it"
  exit 5
fi

if git diff --quiet -- "$DATA" && [ -z "$(git ls-files --others --exclude-standard -- "$DATA")" ]; then
  log "no change: prices did not move"
  exit 0
fi

git add -A -- "$DATA"

# Only data/ may be published unattended. refresh-pricing.mjs writes nowhere
# else today, so anything extra means the script changed under us.
outside="$(git status --porcelain -- ":(exclude)$DATA")"
if [ -n "$outside" ]; then
  log "refuse: refresh touched files outside $DATA"
  printf '%s\n' "$outside"
  exit 6
fi

git commit --quiet -m "chore(tco): refresh pricing snapshot $(date -u +%F)"
git push --quiet origin "$BRANCH"
log "published $(git rev-parse --short HEAD)"