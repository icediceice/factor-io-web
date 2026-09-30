// The platform thesis: the model is the easy part; what it needs is a platform; the
// platform carries more than AI; build it once. Kubernetes leads, AI is one workload.
import { lerp, ease, prog, hold, el, svg, wire, place, style, box, copyBlock, chapterTag } from './kit.js';

export function build({ stage, copy, spec }) {
  const [, c1, c2, c3] = spec.chapters, D = spec.duration;
  const ch = copy.chapters, L = copy.labels;
  const tag = chapterTag(stage, copy.title, ch.map(c => c.title), spec.chapters);
  const texts = ch.map(c => copyBlock(stage, { line: c.line, sub: c.sub }));
  const wires = svg(stage);

  // Geometry. The model sits at the centre of the right half; five needs orbit it.
  const CX = 1470, CY = 520, MODEL = 210;
  const angles = [-90, -18, 54, 126, 198].map(a => (a * Math.PI) / 180);
  const orbit = angles.map(a => ({ x: CX + 280 * Math.cos(a), y: CY + 250 * Math.sin(a) }));
  const SLOT = { y: 580, w: 136, h: 150, gap: 15, x0: 1060 };
  const slotX = i => SLOT.x0 + i * (SLOT.w + SLOT.gap);
  const BAR = { x: 1060, y: 800, w: 740, h: 124 };

  const spokes = orbit.map(p => wire(wires, `M${CX} ${CY} L${p.x} ${p.y}`));
  const legs = [0, 1, 2, 3, 4].map(i => wire(wires, `M${slotX(i) + SLOT.w / 2} ${SLOT.y + SLOT.h} L${slotX(i) + SLOT.w / 2} ${BAR.y}`));
  const ring = el('div', 'ring', stage);
  const model = box(stage, L.model, 'accent');
  const needs = L.needs.map(label => { const node = box(stage, label, '', { w: 250, h: 80 }); node.style.fontSize = '22px'; return node; });

  const bar = place(el('div', 'box accent', stage), { x: BAR.x, y: BAR.y, w: BAR.w, h: BAR.h });
  el('span', '', bar, L.platform);
  const shorts = el('small', '', bar, L.short.join('  ·  '));
  const workloads = L.workloads.map((label, i) => box(stage, label, 'slot', { x: slotX(i + 1), y: SLOT.y, w: SLOT.w, h: SLOT.h }));
  const next = box(stage, L.next, 'slot dashed', { x: slotX(4), y: SLOT.y, w: SLOT.w, h: SLOT.h });
  const nextSolid = box(stage, L.next, 'slot solid', { x: slotX(4), y: SLOT.y, w: SLOT.w, h: SLOT.h });

  return t => {
    tag.render(t, prog(t, D - 0.5, 0.45));
    const ends = [c1 - 0.1, c2 - 0.1, c3 - 0.1, D - 0.2];
    texts.forEach((text, i) => text.render(t, spec.chapters[i] + 0.3, ends[i]));
    const fadeAll = 1 - prog(t, D - 0.6, 0.55, ease.inOut);

    // The model: centre stage, then it shrinks into the first workload slot.
    const toSlot = prog(t, c2 + 0.2, 1.1, ease.inOut);
    place(model, { x: lerp(CX - MODEL / 2, slotX(0), toSlot), y: lerp(CY - MODEL / 2, SLOT.y, toSlot), w: lerp(MODEL, SLOT.w, toSlot), h: lerp(MODEL, SLOT.h, toSlot) });
    model.style.fontSize = `${lerp(32, 20, toSlot)}px`;
    style(model, { opacity: prog(t, 0.5, 0.5) * fadeAll, scale: lerp(0.86, 1, prog(t, 0.5, 0.9, ease.back)) });

    const pulse = (t * 0.7) % 1, ringOn = hold(t, 1.2, c2 + 0.2, 0.4, 0.4);
    place(ring, { x: CX - MODEL / 2 - 40 * pulse, y: CY - MODEL / 2 - 40 * pulse, w: MODEL + 80 * pulse, h: MODEL + 80 * pulse });
    ring.style.borderRadius = `${14 + 40 * pulse}px`;
    ring.style.opacity = String(ringOn * (1 - pulse) * 0.7);

    // Five needs arrive, get wired to the model, then fold down into the platform bar.
    const fold = prog(t, c2 + 0.1, 1.0, ease.inOut);
    needs.forEach((node, i) => {
      const p = prog(t, c1 + 0.5 + i * 0.3, 0.8, ease.expo);
      const from = { x: CX + (orbit[i].x - CX) * 1.35, y: CY + (orbit[i].y - CY) * 1.35 };
      const at = { x: lerp(from.x, orbit[i].x, p), y: lerp(from.y, orbit[i].y, p) };
      const target = { x: BAR.x + (BAR.w / 5) * (i + 0.5), y: BAR.y + BAR.h / 2 };
      place(node, { x: lerp(at.x, target.x, fold) - 125, y: lerp(at.y, target.y, fold) - 40 });
      style(node, { opacity: p * (1 - fold), scale: lerp(1, 0.5, fold) });
      spokes[i].draw(prog(t, c1 + 1.2 + i * 0.3, 0.6), 1 - prog(t, c2, 0.3));
    });

    // Platform and workloads.
    const barOn = prog(t, c2 + 0.7, 0.7, ease.expo);
    style(bar, { opacity: barOn * fadeAll, y: 30 * (1 - barOn) });
    shorts.style.opacity = String(prog(t, c2 + 1.2, 0.6));
    workloads.forEach((node, i) => {
      const p = prog(t, c2 + 1.5 + i * 0.25, 0.7, ease.expo);
      style(node, { opacity: p * fadeAll, y: 26 * (1 - p) });
    });
    const pn = prog(t, c2 + 2.4, 0.7, ease.expo);
    style(next, { opacity: pn * fadeAll, y: 26 * (1 - pn) });
    legs.forEach((leg, i) => leg.draw(prog(t, c2 + 1.6 + i * 0.2, 0.5), fadeAll));

    // Build once: the empty slot for what comes next fills in.
    const fill = prog(t, c3 + 1.2, 0.8, ease.inOut);
    style(nextSolid, { opacity: fill * fadeAll, scale: lerp(0.94, 1, fill) });
  };
}