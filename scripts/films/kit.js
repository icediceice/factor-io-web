// kit.js: time helpers and the few reusable pieces every scene is built from.
// Each piece returns an object with render(t); nothing here keeps state between
// frames, so seeking backwards renders exactly what playing forwards did.
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, p) => a + (b - a) * p;
export const ease = {
  linear: p => p,
  out: p => 1 - (1 - p) ** 3,
  inOut: p => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  expo: p => (p === 1 ? 1 : 1 - 2 ** (-10 * p)),
  back: p => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2,
};
// 0..1 progress of t through [start, start + dur], eased.
export const prog = (t, start, dur, fn = ease.out) => fn(clamp((t - start) / dur));
// In at `start`, out at `end`: 0 before, 1 while held, 0 after.
export const hold = (t, start, end, fadeIn = 0.5, fadeOut = 0.45) =>
  Math.min(prog(t, start, fadeIn), 1 - prog(t, end - fadeOut, fadeOut, ease.inOut));

export function el(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}
const SVG = 'http://www.w3.org/2000/svg';
export function svg(parent) {
  const root = document.createElementNS(SVG, 'svg');
  root.setAttribute('class', 'wires'); root.setAttribute('viewBox', '0 0 1920 1080');
  parent.appendChild(root);
  return root;
}
// A path drawn from 0 to p via stroke-dashoffset; pathLength normalises the length.
export function wire(root, d, cls = '') {
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d); path.setAttribute('pathLength', '1');
  if (cls) path.setAttribute('class', cls);
  root.appendChild(path);
  return {
    path,
    draw(p, opacity = 1) {
      path.style.strokeDasharray = cls.includes('dash') ? '' : '1 1';
      path.style.strokeDashoffset = cls.includes('dash') ? '' : String(1 - p);
      // A dashed wire cannot also use the dash offset to draw, so it fades in instead.
      path.style.opacity = String(cls.includes('dash') ? p * opacity : p > 0 ? opacity : 0);
    },
    at(p) { const len = path.getTotalLength(); return path.getPointAtLength(len * clamp(p)); },
  };
}

export function place(node, { x, y, w, h }) {
  if (x !== undefined) node.style.left = `${x}px`;
  if (y !== undefined) node.style.top = `${y}px`;
  if (w !== undefined) node.style.width = `${w}px`;
  if (h !== undefined) node.style.height = `${h}px`;
  return node;
}
export function style(node, { opacity = 1, x = 0, y = 0, scale = 1 } = {}) {
  node.style.opacity = String(clamp(opacity));
  node.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
export function box(parent, label, cls = '', geometry = {}, note) {
  const node = place(el('div', `box ${cls}`.trim(), parent), geometry);
  el('span', '', node, label);
  if (note) el('small', '', node, note);
  return node;
}

// '*word*' in authored copy marks the accent; '\n' is an authored line break.
function fillLine(span, text) {
  text.split(/(\*[^*]+\*)/).filter(Boolean).forEach(part => {
    if (part.startsWith('*')) el('em', '', span, part.slice(1, -1)); else span.appendChild(document.createTextNode(part));
  });
}

// Headline + optional sub in a column. Lines rise out of a mask one after another.
export function copyBlock(parent, { line, sub, cls = '' }) {
  const wrap = el('div', `copy ${cls}`.trim(), parent);
  const h = el('h2', 'headline', wrap);
  const inners = line.split('\n').map(text => { const outer = el('span', 'line', h); const inner = el('span', '', outer); fillLine(inner, text); return inner; });
  const s = sub ? el('p', 'sub', wrap, sub) : null;
  return {
    wrap,
    render(t, start, end) {
      const out = prog(t, end - 0.5, 0.5, ease.inOut);
      wrap.style.visibility = t < start - 0.05 || t > end + 0.05 ? 'hidden' : 'visible';
      inners.forEach((inner, i) => {
        const p = prog(t, start + i * 0.14, 0.8, ease.expo);
        inner.style.transform = `translateY(${(1 - p) * 110}%)`;
      });
      wrap.style.opacity = String(1 - out);
      wrap.style.transform = `translateY(${-24 * out}px)`;
      if (s) style(s, { opacity: prog(t, start + 0.35 + inners.length * 0.14, 0.7) * (1 - out), y: 14 * (1 - prog(t, start + 0.35 + inners.length * 0.14, 0.9)) });
    },
  };
}

// Top-left 'FILM · CHAPTER' tag; the chapter name swaps with a short cross-fade.
export function chapterTag(parent, title, names, starts) {
  const tag = el('div', 'tag', parent);
  el('span', '', tag, title);
  const name = el('b', '', tag);
  el('div', 'brand', parent, 'Factor IO');
  return {
    render(t) {
      let i = 0;
      starts.forEach((s, j) => { if (t >= s - 0.2) i = j; });
      name.textContent = names[i];
      const since = t - (starts[i] - 0.2);
      name.style.opacity = String(i === 0 ? prog(t, 0.2, 0.6) : clamp(since / 0.4));
      tag.style.opacity = String(prog(t, 0, 0.6));
    },
  };
}