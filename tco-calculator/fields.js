/**
 * fields.js — progressive disclosure for the input rail.
 *
 * The rail was ~50 label-above-input blocks, most carrying two lines of help
 * prose. Every one of those explanations is worth reading and none of them is
 * worth reading FIFTY AT ONCE, which is what a 400px column asked of you.
 *
 * So each field collapses to one line — label left, current value right — and
 * the explanation moves into a sheet that opens on the value you actually want
 * to change. Nothing is deleted. The writing is relocated to where there is room
 * for it.
 *
 * THE ONE INVARIANT THIS FILE EXISTS TO PROTECT
 * ---------------------------------------------
 * app.js reads every field as `$(id).value` and binds its listeners to those
 * exact nodes (`wireInputs`), while `applyWorkloadPreset`, `applyModelPreset`,
 * `balanceMix` and `renderArchGroups` write `.value` directly and then call
 * `onLiveInput()`. So the controls are MOVED between the rail vault and the
 * sheet, never copied. A proxy input would mean two nodes holding one number on
 * a calculator whose entire contract is that a displayed figure is attributable
 * to one source. That bug class is designed out rather than guarded against.
 *
 * The unit of relocation is the whole `.f` block, not the bare control, because
 * the block carries the label, the help prose, and in one case a live hint span
 * (`f-sh-count-hint` sits inside the f-sh-count label and is rewritten by
 * refreshDerived on every keystroke). Moving only the control would strand that
 * hint invisible in the vault.
 */

const $ = (id) => document.getElementById(id);

// Sections that open on arrival. Everything else folds to a summary of its own
// values: these two answer "who is this for", which is where a reader starts.
const OPEN_SECTIONS = new Set(["Start here", "Who uses it", "What they do"]);

// A label ending in a parenthetical unit reads better split: the number and the
// unit it is counted in are different information, and the value column should
// carry the unit, not the label. "Electricity ($/kWh)" -> "Electricity" + "$/kWh".
const UNIT_RE = /\s*\(([^()]{1,12})\)\s*$/;

let sheetOpen = null; // { field, host, spec, lastFocus }

/* ─────────────────────────────────────────────────────── harvesting the rail */

/**
 * A `.f` block is an editable FIELD only when it owns exactly one control and
 * contains no nested `.f`. The "Attention layers" block fails both tests: it is
 * a container whose children are the real fields, and treating it as one would
 * enhance a block with nothing to edit.
 */
function isField(f) {
  if (f.querySelector(".f")) return false;
  return f.querySelectorAll("input, select").length === 1;
}

/** The label's own words, without the live spans app.js rewrites inside it. */
function labelTextOf(f) {
  const el = f.querySelector("label");
  if (!el) return "";
  const clone = el.cloneNode(true);
  for (const junk of clone.querySelectorAll(".muted, .tag, span[id]")) junk.remove();
  return clone.textContent.replace(/\s+/g, " ").trim();
}

function sectionTitleOf(el) {
  return el.closest(".sec")?.querySelector("h2")?.textContent.trim() ?? "";
}

/* ────────────────────────────────────────────────────────── the value readout */

/**
 * What the right-hand column says. A field left blank is NOT rendered as an
 * empty slot — an empty column reads as broken, and most blanks here mean
 * "derived", which is a real and interesting state. refreshDerived writes the
 * derived figure into `.placeholder` live, so that is read rather than guessed.
 */
function readValue(ctrl) {
  if (ctrl.tagName === "SELECT") {
    const opt = ctrl.selectedOptions[0];
    return { text: opt ? opt.textContent.trim() : "—", derived: false };
  }
  const v = ctrl.value.trim();
  if (v !== "") return { text: v, derived: false };
  const ph = ctrl.placeholder.trim();
  return ph ? { text: ph, derived: true } : { text: "not set", derived: true };
}

function paintSpec(spec) {
  const ctrl = $(spec.dataset.for);
  if (!ctrl) return;
  const { text, derived } = readValue(ctrl);
  const v = spec.querySelector(".v");
  v.firstChild.textContent = text;
  v.classList.toggle("is-derived", derived);
  spec.setAttribute("aria-label", `${spec.dataset.label}: ${text}${spec.dataset.unit ? " " + spec.dataset.unit : ""}. Edit`);
}

/** Repaint every visible line. Called from onLiveInput, AFTER refreshDerived. */
export function syncChips() {
  for (const spec of document.querySelectorAll(".rail .spec")) paintSpec(spec);
  for (const sec of document.querySelectorAll(".rail .sec.folded")) paintSummary(sec);
}

/* ──────────────────────────────────────────────────────── building the lines */

function buildSpec(f, ctrl) {
  const raw = labelTextOf(f);
  const m = raw.match(UNIT_RE);
  const label = m ? raw.slice(0, m.index).trim() : raw;
  const unit = m ? m[1] : "";

  const spec = document.createElement("button");
  spec.type = "button";
  spec.className = "spec";
  spec.dataset.for = ctrl.id;
  spec.dataset.label = label;
  spec.dataset.unit = unit;
  spec.setAttribute("aria-haspopup", "dialog");

  const k = document.createElement("span");
  k.className = "k";
  k.textContent = label;

  const v = document.createElement("span");
  v.className = "v";
  v.append(document.createTextNode(""));
  if (unit) {
    const u = document.createElement("span");
    u.className = "u";
    u.textContent = unit;
    v.append(u);
  }

  spec.append(k, v);
  spec.addEventListener("click", () => openSheet(spec));
  return spec;
}

/**
 * Replace each field in place with its line and park the block in the vault.
 * Idempotent: re-running after renderArchGroups only picks up blocks that have
 * not been enhanced yet.
 */
export function enhanceRail() {
  const vault = $("field-vault");
  if (!vault) return;

  for (const f of [...document.querySelectorAll(".rail .f")]) {
    if (f.dataset.enhanced || !isField(f)) continue;
    const ctrl = f.querySelector("input, select");
    if (!ctrl.id) continue; // nothing to address it by; leave it visible

    f.dataset.enhanced = "1";
    const spec = buildSpec(f, ctrl);
    // `.row` is a 2-up or 3-up grid. One field per line reads as a spec sheet;
    // two per line is the density we are removing.
    f.parentElement?.classList.add("speclist");
    f.replaceWith(spec);
    vault.append(f);
    paintSpec(spec);
  }

  enhanceSections();
}

/* ─────────────────────────────────────────────────────── section disclosure */

function paintSummary(sec) {
  const sum = sec.querySelector(".secsum");
  if (!sum) return;
  const specs = [...sec.querySelectorAll(".spec")];
  // A summary is a glance, not a readout. A full model id ("NVIDIA-Nemotron-
  // 3-Nano-30B-A3B-BF16 — full attention, MoE") wraps the line and buries the
  // two values beside it, so each entry is clipped to a recognisable head.
  const parts = specs.slice(0, 3).map((s) => {
    const { text } = readValue($(s.dataset.for));
    const short = text.length > 18 ? text.slice(0, 17).trimEnd() + "…" : text;
    return `${short}${s.dataset.unit ? " " + s.dataset.unit : ""}`;
  });
  const rest = specs.length - parts.length;
  sum.innerHTML = "";
  sum.append(document.createTextNode(parts.join("  ·  ")));
  if (rest > 0) {
    const b = document.createElement("b");
    b.textContent = `  +${rest} more`;
    sum.append(b);
  }
}

function enhanceSections() {
  for (const sec of document.querySelectorAll(".rail .sec")) {
    if (sec.dataset.folding) continue;
    const h2 = sec.querySelector("h2");
    if (!h2 || !sec.querySelector(".spec")) continue;
    sec.dataset.folding = "1";

    const head = document.createElement("button");
    head.type = "button";
    head.className = "sechead";
    h2.replaceWith(head);
    head.append(h2);
    const caret = document.createElement("span");
    caret.className = "caret";
    head.append(caret);

    const sum = document.createElement("div");
    sum.className = "secsum";
    head.after(sum);

    const title = h2.textContent.trim();
    // The summary states the values you are choosing not to look at. Folding a
    // section that then shows nothing would be hiding, not disclosing.
    const setFolded = (folded) => {
      sec.classList.toggle("folded", folded);
      head.setAttribute("aria-expanded", String(!folded));
      if (folded) paintSummary(sec);
    };
    head.addEventListener("click", () => setFolded(!sec.classList.contains("folded")));
    setFolded(!OPEN_SECTIONS.has(title));
  }
}

/* ────────────────────────────────────────────────────────────────── the sheet */

function openSheet(spec) {
  if (sheetOpen) closeSheet();
  const ctrl = $(spec.dataset.for);
  const field = ctrl?.closest(".f");
  if (!field) return;

  const root = $("sheet-root");
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${spec.dataset.label.replace(/"/g, "&quot;")}">
      <div class="s-eyebrow"></div>
      <div class="s-body"></div>
      <div class="s-foot">
        <button type="button" class="btn btn-p" data-done>Done</button>
        <span class="hintkey">Esc to close</span>
      </div>
    </div>`;
  scrim.querySelector(".s-eyebrow").textContent = sectionTitleOf(spec);
  // The block moves in whole: label, help prose, live hint and control, exactly
  // as authored in the HTML. The sheet restyles them; it does not rebuild them.
  scrim.querySelector(".s-body").append(field);
  root.append(scrim);

  sheetOpen = { field, spec, lastFocus: document.activeElement };

  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) closeSheet(); });
  scrim.querySelector("[data-done]").addEventListener("click", closeSheet);
  scrim.addEventListener("keydown", onSheetKey);
  ctrl.addEventListener("input", onSheetEdit);

  ctrl.focus();
  if (ctrl.select) ctrl.select();
}

/** Keep the line underneath live while the sheet is open. */
function onSheetEdit() {
  if (sheetOpen) paintSpec(sheetOpen.spec);
}

function onSheetKey(e) {
  if (e.key === "Escape") { e.stopPropagation(); closeSheet(); return; }
  if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); closeSheet(); return; }
  if (e.key !== "Tab") return;
  // Trap. A modal you can tab out of is a modal that loses the value you were
  // editing behind a scrim you can no longer reach.
  const focusables = [...e.currentTarget.querySelectorAll("input, select, button, [href], textarea")]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/**
 * Return the block to the vault and dismiss. Exported because renderArchGroups
 * rewrites `#sv-groups` innerHTML: if the sheet were holding one of those blocks
 * when that fired, the node — and the value in it — would be destroyed.
 */
export function closeSheet() {
  if (!sheetOpen) return;
  const { field, spec, lastFocus } = sheetOpen;
  sheetOpen = null;

  const ctrl = field.querySelector("input, select");
  ctrl?.removeEventListener("input", onSheetEdit);
  $("field-vault").append(field);
  document.querySelector("#sheet-root .scrim")?.remove();

  paintSpec(spec);
  const sec = spec.closest(".sec");
  if (sec?.classList.contains("folded")) paintSummary(sec);
  (spec.isConnected ? spec : lastFocus)?.focus?.();
}

export function isSheetOpen() {
  return sheetOpen !== null;
}

/**
 * Drop the vaulted blocks belonging to a container that is about to be rebuilt.
 *
 * `renderArchGroups` rewrites `#sv-groups` with innerHTML. That destroys the
 * collapsed LINES, but the blocks they stand for are in the vault, outside the
 * container, so they would survive the rewrite — leaving a stale
 * `#f-g0-layers` in the vault and a fresh one in the rail. Two nodes, one id:
 * `getElementById` would answer with whichever came first in document order, and
 * `readArchGroups` could read a value the user can no longer see. That is
 * exactly the duplicate-value failure this file is built to make impossible, so
 * it is released explicitly rather than left to document order.
 */
export function releaseFields(container) {
  if (!container) return;
  if (sheetOpen && container.contains(sheetOpen.spec)) closeSheet();
  const vault = $("field-vault");
  if (!vault) return;
  for (const spec of container.querySelectorAll(".spec")) {
    const ctrl = $(spec.dataset.for);
    const field = ctrl?.closest(".f");
    if (field && vault.contains(field)) field.remove();
  }
}