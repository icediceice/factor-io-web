// The studio story: background, the gap, what we build, the studio. No founding year:
// the operator excluded the incorporation date from publication.
import { clamp, lerp, ease, prog, hold, el, svg, wire, place, style, copyBlock, chapterTag } from './kit.js';

export function build({ stage, copy, spec }) {
  const [, c1, c2, c3] = spec.chapters, D = spec.duration;
  const ch = copy.chapters, L = copy.labels;
  const tag = chapterTag(stage, copy.title, ch.map(c => c.title), spec.chapters);
  const texts = ch.map((c, i) => copyBlock(stage, { line: c.line, sub: i === 3 ? '' : c.sub }));
  const wires = svg(stage);

  // Chapter 1: a rack elevation filling from the bottom, lights coming on.
  const UNITS = 11, rackX = 1330, rackY = 170, rackW = 400;
  const rack = place(el('div', 'rack', stage), { x: rackX, y: rackY, w: rackW, h: 16 + UNITS * 62 });
  const units = Array.from({ length: UNITS }, (_, i) => {
    const unit = el('div', 'unit', rack); unit.style.top = `${16 + i * 62}px`;
    place(el('i', 'slotline', unit), { w: 90 + ((i * 53) % 130) });
    const leds = [0, 1, 2].map(k => { const led = el('i', 'led', unit); led.style.right = `${18 + k * 22}px`; return led; });
    return { unit, leds };
  });

  // Chapter 2: the slide, the running system, and a line that stops halfway.
  const slide = place(el('div', 'card', stage), { x: 1110, y: 250, w: 360, h: 236 });
  el('span', 'mono', slide, L.slide);
  const bars = el('div', 'bars', slide); [88, 64, 76, 40].forEach(w => { el('i', '', bars).style.width = `${w}%`; });
  const system = place(el('div', 'card', stage), { x: 1430, y: 610, w: 360, h: 236 });
  el('span', 'mono', system, L.system);
  const sysUnits = el('div', 'units', system); [0, 1, 2].forEach(() => el('i', '', sysUnits));
  const link = wire(wires, 'M1290 486 C1290 560 1610 540 1610 610');
  const stop = el('div', 'stop', stage), ring = el('div', 'ring', stage);

  // Chapter 3: the stack, bare metal up. The platform layer carries the accent.
  const layers = L.layers.map((label, i) => {
    const node = place(el('div', `box ${i === 1 ? 'accent' : ''}`.trim(), stage), { x: 1110, y: 820 - i * 114, w: 680, h: 98 });
    el('span', '', node, label);
    return node;
  });

  // Close: the wordmark.
  const end = el('div', 'copy', stage);
  const mark = el('p', 'wordmark', end); mark.append('Factor '); el('span', '', mark, 'IO');
  const place1 = el('p', 'sub', end, ch[3].sub);
  const url = el('p', 'mono', end, 'studio.factor-io.com');

  return t => {
    tag.render(t);
    const ends = [c1 - 0.1, c2 - 0.1, c3 - 0.1, 24.9];
    texts.forEach((text, i) => text.render(t, spec.chapters[i] + 0.3, ends[i]));

    // Rack.
    const rackOn = hold(t, 0.2, c1 - 0.05, 0.5, 0.5);
    style(rack, { opacity: rackOn, x: 30 * (1 - prog(t, 0.2, 0.9)) });
    units.forEach(({ unit, leds }, i) => {
      const b = UNITS - 1 - i, p = prog(t, 0.5 + b * 0.09, 0.55);
      style(unit, { opacity: p, y: 18 * (1 - p) });
      leds.forEach((led, k) => {
        const on = t > 1.7 + ((i * 7 + k * 3) % 11) * 0.13;
        const blink = Math.floor(t * 3 + i * 1.7 + k) % 7 === 0;
        led.style.background = on && !blink ? (i === 4 && k === 0 ? 'var(--accent)' : 'var(--text)') : 'var(--dim)';
        led.style.opacity = on ? '0.9' : '0.6';
      });
    });

    // Gap, then the line completes at the start of chapter 3.
    const cardsOn = hold(t, c1 + 0.2, c2 + 1.4, 0.6, 0.5);
    style(slide, { opacity: cardsOn * prog(t, c1 + 0.3, 0.6), y: 20 * (1 - prog(t, c1 + 0.3, 0.8)) });
    style(system, { opacity: cardsOn * prog(t, c1 + 0.6, 0.6), y: 20 * (1 - prog(t, c1 + 0.6, 0.8)) });
    const reach = t < c2 ? 0.5 * prog(t, c1 + 1.5, 1.4, ease.inOut) : 0.5 + 0.5 * prog(t, c2, 0.8, ease.inOut);
    link.draw(reach, cardsOn);
    link.path.classList.toggle('accent', t >= c2);
    system.classList.toggle('accent', t >= c2 + 0.7);
    const gapOn = t > c1 + 2.9 && t < c2 ? hold(t, c1 + 2.9, c2, 0.3, 0.3) : 0;
    const point = link.at(0.5);
    place(stop, { x: point.x, y: point.y }); stop.style.opacity = String(gapOn);
    const pulse = (t * 0.8) % 1;
    place(ring, { x: point.x - 18 - pulse * 26, y: point.y - 18 - pulse * 26, w: 36 + pulse * 52, h: 36 + pulse * 52 });
    ring.style.opacity = String(gapOn * (1 - pulse) * 0.8);

    // Stack.
    const stackOn = hold(t, c2 + 1.2, 24.9, 0.4, 0.6);
    layers.forEach((layer, i) => {
      const p = prog(t, c2 + 1.3 + i * 0.45, 0.7, ease.expo);
      const dim = t > c3 ? lerp(1, 0.55, prog(t, c3, 0.8)) : 1;
      style(layer, { opacity: p * stackOn * dim, y: 44 * (1 - p) });
    });

    // Wordmark.
    const on = prog(t, 25.1, 0.8, ease.expo), off = prog(t, D - 0.45, 0.45, ease.inOut);
    end.style.opacity = String(clamp(prog(t, 25.1, 0.4)) * (1 - off));
    mark.style.transform = `translateY(${30 * (1 - on)}px)`;
    style(place1, { opacity: prog(t, 25.5, 0.6), y: 12 * (1 - prog(t, 25.5, 0.7)) });
    style(url, { opacity: prog(t, 25.8, 0.6) });
    tag.render(t);
    stage.querySelector('.tag').style.opacity = String(1 - prog(t, 24.8, 0.4));
  };
}