import test from "node:test";
import assert from "node:assert/strict";
import { HANDOFF, saveHandoff, readHandoff, writeProposal, consumeHandoff, clearHandoffs, controlIdentity, controlDiff } from "../assistant-session.js";
function store() {
  const map = new Map();
  return { get length() { return map.size; }, key: n => [...map.keys()][n], getItem: key => map.get(key) ?? null, setItem: (key, val) => map.set(key, val), removeItem: key => map.delete(key) };
}
const id = "00000000-0000-4000-8000-000000000001";
test("handoff round trip expires and never contains a transcript", () => {
  const s = store(); const now = Date.now();
  saveHandoff(s, { controls: { "f-users": "20" }, context: { figures: {} } }, { id, now });
  assert.equal(readHandoff(s, id, now).controls["f-users"], "20");
  assert.equal(readHandoff(s, id, now).transcript, undefined);
  assert.equal(readHandoff(s, id, now + HANDOFF.ttl), null);
});
test("proposal remains inert, consumption prevents replay", () => {
  const s = store(); saveHandoff(s, { controls: { "f-users": "20" } }, { id });
  writeProposal(s, id, { changes: [{ field: "f-users", value: "30" }] });
  assert.equal(readHandoff(s, id).controls["f-users"], "20");
  consumeHandoff(s, id);
  assert.equal(readHandoff(s, id).consumed, true);
  assert.throws(() => writeProposal(s, id, {}), /already applied/);
  assert.throws(() => consumeHandoff(s, id), /already applied/);
});
test("blocked, malformed, unknown-version and oversized storage fail closed", () => {
  assert.equal(readHandoff({ getItem() { throw new Error("blocked"); } }, id), null);
  const s = store(); s.setItem(HANDOFF.prefix + id, "{"); assert.equal(readHandoff(s, id), null);
  s.setItem(HANDOFF.prefix + id, JSON.stringify({ v: 99 })); assert.equal(readHandoff(s, id), null);
  assert.throws(() => saveHandoff(s, { controls: {}, context: "x".repeat(HANDOFF.maxChars) }, { id }), /too large/);
  assert.throws(() => saveHandoff(s, { controls: { __invalid: "x" } }, { id }), /Invalid control/);
});
test("reset clears only owned keys; identities ignore object ordering, not edits", () => {
  const s = store(); s.setItem("unrelated", "keep"); saveHandoff(s, { controls: {} }, { id }); clearHandoffs(s);
  assert.equal(s.getItem("unrelated"), "keep"); assert.equal(readHandoff(s, id), null);
  const a = { "f-users": "20", "f-days": "21" }; const b = { "f-days": "21", "f-users": "20" };
  assert.equal(controlIdentity(a), controlIdentity(b));
  assert.deepEqual(controlDiff(a, { ...b, "f-users": "30" }), [{ field: "f-users", from: "20", to: "30" }]);
});
