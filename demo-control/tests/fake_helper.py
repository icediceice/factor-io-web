"""Stand-in for Light's colab_helper.py in the demo-control tests.

Same contract as the real helper: one base64 JSON request in argv, the result
is the last stdout line LIGHTCOLAB:{json}. The fixture directory is the one
holding the request's "cli" path (each test app gets its own, so a flow still
running from an earlier test cannot write into a later test's log). Every
request is appended to helper.jsonl there as one JSON line. Replies come from
scenario.json there, keyed by verb; a list is consumed one entry per call of
that verb, and its last entry repeats. A pull reply with "content" writes that
JSON to local_path. A reply {"crash": true} exits without a result line, the
way a crashed helper does. "$SESSION" in a reply's "raw" text becomes the
session named by the latest request that named one (a sessions listing).
"""
import base64
import json
import os
import sys

req = json.loads(base64.b64decode(sys.argv[1]))
verb = req["verb"]
fixture = os.path.dirname(req["cli"])
log = os.path.join(fixture, "helper.jsonl")
with open(log, "a") as f:
    f.write(json.dumps(req) + "\n")
with open(log) as f:
    seen = [json.loads(line) for line in f]
n = sum(1 for r in seen if r["verb"] == verb) - 1
with open(os.path.join(fixture, "scenario.json")) as f:
    reply = json.load(f).get(verb, {"ok": False, "error": "unscripted"})
if isinstance(reply, list):
    reply = reply[min(n, len(reply) - 1)]
if reply.get("crash"):
    print("Traceback (most recent call last): colab proxy token refresh failed", file=sys.stderr)
    sys.exit(3)
if "raw" in reply:
    named = [r["session"] for r in seen if r.get("session")]
    reply = {**reply, "raw": reply["raw"].replace("$SESSION", named[-1] if named else "")}
if verb == "pull" and "content" in reply:
    with open(req["local_path"], "w") as f:
        json.dump(reply["content"], f)
    reply = {"ok": True}

# The real helper prints CLI chatter before its result line.
print("colab: refreshing proxy token")
print("LIGHTCOLAB:" + json.dumps(reply))