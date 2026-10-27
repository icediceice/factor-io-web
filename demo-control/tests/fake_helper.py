"""Stand-in for Light's colab_helper.py in the demo-control tests.

Same contract as the real helper: one base64 JSON request in argv, the result
is the last stdout line LIGHTCOLAB:{json}. Every request is appended to
$FAKE_LOG as one JSON line. Replies come from the $FAKE_SCENARIO JSON object,
keyed by verb; a list is consumed one entry per call of that verb, and its last
entry repeats. A pull reply with "content" writes that JSON to local_path.
"""
import base64
import json
import os
import sys

req = json.loads(base64.b64decode(sys.argv[1]))
verb = req["verb"]
with open(os.environ["FAKE_LOG"], "a") as f:
    f.write(json.dumps(req) + "\n")
with open(os.environ["FAKE_LOG"]) as f:
    n = sum(1 for line in f if json.loads(line)["verb"] == verb) - 1
with open(os.environ["FAKE_SCENARIO"]) as f:
    reply = json.load(f).get(verb, {"ok": False, "error": "unscripted"})
if isinstance(reply, list):
    reply = reply[min(n, len(reply) - 1)]
if verb == "pull" and "content" in reply:
    with open(req["local_path"], "w") as f:
        json.dump(reply["content"], f)
    reply = {"ok": True}

# The real helper prints CLI chatter before its result line.
print("colab: refreshing proxy token")
print("LIGHTCOLAB:" + json.dumps(reply))