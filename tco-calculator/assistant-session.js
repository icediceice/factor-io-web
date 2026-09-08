// Per-tab scenario handoffs only. Conversation messages never enter this store.
export const HANDOFF = Object.freeze({ version: 1, prefix: "factor-advisor:", ttl: 2 * 60 * 60 * 1000, maxChars: 240000 });
const validId = id => typeof id === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(id);
export const serial = value => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v);
export function controlIdentity(controls) {
  return JSON.stringify(Object.keys(controls).sort().map(key => [key, String(controls[key])]));
}
export function validateControlRecord(controls) {
  if (!controls || typeof controls !== "object" || Array.isArray(controls) || Object.keys(controls).length > 250) throw new Error("Invalid calculator controls");
  for (const [id, value] of Object.entries(controls)) {
    if (!/^(f-|fb-|fo-|fr-)[a-zA-Z0-9-]+$/.test(id) || typeof value !== "string" || value.length > 2000) throw new Error(`Invalid control: ${id}`);
  }
  return controls;
}
export function saveHandoff(storage, payload, { id = globalThis.crypto.randomUUID(), now = Date.now() } = {}) {
  if (!validId(id)) throw new Error("Invalid handoff identifier");
  validateControlRecord(payload.controls);
  const record = { ...payload, v: HANDOFF.version, saved_at: now, expires_at: now + HANDOFF.ttl, consumed: false };
  const text = serial(record);
  if (text.length > HANDOFF.maxChars) throw new Error("This scenario is too large to transfer. Export it or use the advisor without context.");
  // Bound this namespace without touching unrelated session storage.
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(key => key?.startsWith(HANDOFF.prefix));
  for (const key of keys) { try { if (JSON.parse(storage.getItem(key)).expires_at <= now) storage.removeItem(key); } catch { storage.removeItem(key); } }
  const remaining = keys.filter(key => storage.getItem(key));
  for (const key of remaining.slice(0, Math.max(0, remaining.length - 3))) storage.removeItem(key);
  storage.setItem(HANDOFF.prefix + id, text);
  return id;
}
export function readHandoff(storage, id, now = Date.now()) {
  try {
    if (!validId(id)) return null;
    const text = storage.getItem(HANDOFF.prefix + id);
    if (!text || text.length > HANDOFF.maxChars) return null;
    const row = JSON.parse(text);
    if (row.v !== HANDOFF.version || !Number.isFinite(row.saved_at) || !Number.isFinite(row.expires_at) || row.saved_at > now || row.expires_at <= now || row.expires_at - row.saved_at > HANDOFF.ttl) return null;
    validateControlRecord(row.controls);
    return row;
  } catch { return null; }
}
export function writeProposal(storage, id, proposal, now = Date.now()) {
  const row = readHandoff(storage, id, now);
  if (!row || row.consumed) throw new Error("Scenario expired or already applied. Reopen the advisor from the calculator.");
  const text = serial({ ...row, proposal });
  if (text.length > HANDOFF.maxChars) throw new Error("Proposal is too large");
  storage.setItem(HANDOFF.prefix + id, text);
}
export function consumeHandoff(storage, id) {
  const row = readHandoff(storage, id);
  if (!row || row.consumed) throw new Error("Proposal expired or already applied");
  storage.setItem(HANDOFF.prefix + id, serial({ ...row, consumed: true, proposal: null }));
}
export function clearHandoffs(storage) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys) if (key?.startsWith(HANDOFF.prefix)) storage.removeItem(key);
}
export function controlDiff(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter(id => before[id] !== after[id])
    .map(id => ({ field: id, from: before[id] ?? "", to: after[id] ?? "" }));
}
