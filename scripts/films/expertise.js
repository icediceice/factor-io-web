// What we deliver, one chapter per service: a cluster that survives a failed node, a
// model that stays inside the network, retrieval that respects authority, and an agent
// that stops for a person. The closing stack puts all four on one platform.
import { lerp, ease, prog, hold, el, svg, wire, place, style, box, copyBlock, chapterTag } from './kit.js';

export function build({ stage, copy, content, spec }) {
  const [, c1, c2, c3] = spec.chapters, D = spec.duration;
  const ch = copy.chapters, L = copy.labels;
  const tag = chapterTag(stage, copy.title, ch.map(c => c.title), spec.chapters);
  const texts = ch.map((c, i) => copyBlock(stage, { line: c.line, sub: c.sub, cls: i === 3 ? 'top' : '' }));
  const closing = copyBlock(stage, { line: copy.closing });
  const wires = svg(stage);
  const tagline = (text, x, y) => place(el('div', 'tagline', stage, text), { x, y });

  // Chapter 1: three nodes; node B fails and its pods reschedule onto the other two.
  const NODE = { y: 330, w: 210, h: 330 }, nodeX = [1110, 1345, 1580];
  const nodes = L.nodes.map((label, n) => box(stage, label, n === 2 ? 'left accent' : 'left', { x: nodeX[n], y: NODE.y, w: NODE.w, h: NODE.h }));
  const slot = (n, i) => ({ x: nodeX[n] + 22 + (i % 3) * 60, y: NODE.y + 100 + Math.floor(i / 3) * 60 });
  // [node, slot, where it lands after node B fails]
  const podPlan = [[0, 0], [0, 1], [0, 2], [1, 0, [0, 3]], [1, 1, [0, 4]], [1, 2, [2, 2]], [1, 3, [2, 3]], [2, 0], [2, 1]];
  const pods = podPlan.map(([n]) => el('div', n === 2 ? 'pod accent' : 'pod', stage));
  const down = tagline(L.down, nodeX[1], NODE.y - 44);

  // Chapter 2: the model server answers inside the network; the way out is closed.
  const zone = place(el('div', 'zone', stage), { x: 1050, y: 240, w: 580, h: 620 });
  el('span', 'mono', zone, L.network);
  const users = box(stage, L.users, '', { x: 1090, y: 300, w: 190, h: 96 });
  const docs = box(stage, L.docs, '', { x: 1090, y: 724, w: 190, h: 96 });
  const server = box(stage, L.server, 'accent', { x: 1360, y: 492, w: 200, h: 96 });
  const outside = box(stage, L.outside, 'dashed', { x: 1680, y: 492, w: 180, h: 96 });
  const inbound = [wire(wires, 'M1280 348 C1330 348 1310 540 1360 540'), wire(wires, 'M1280 772 C1330 772 1310 540 1360 540')];
  const outbound = wire(wires, 'M1560 540 L1630 540', 'accent');
  const traffic = [0, 1, 2, 3].map(() => el('div', 'dot', stage));
  const leak = el('div', 'dot', stage);
  const wall = place(el('div', 'stop', stage), { x: 1630, y: 540 });
  const blocked = tagline(L.blocked, 1680, 456);

  // Chapter 3: one question, three candidate sources; only the current one answers.
  const question = box(stage, L.question, '', { x: 1100, y: 500, w: 200, h: 80 });
  const docY = [480, 300, 660];
  const card = (i, cls) => { const node = box(stage, L.docNames[i], cls, { x: 1490, y: docY[i], w: 300, h: 120 }, L.docTags[i]); node.style.justifyContent = 'center'; return node; };
  const cards = L.docNames.map((_, i) => card(i, 'left'));
  const lit = card(0, 'left accent');
  const rays = docY.map((y, i) => wire(wires, `M1300 540 C1400 540 1390 ${y + 60} 1490 ${y + 60}`, i === 0 ? 'accent' : ''));
  const stops = [1, 2].map(i => place(el('div', 'stop', stage), rays[i].at(0.62)));

  // Chapter 4: the governed flow from the page's demo, stopping for a person.
  const stages = content.demo.stages, F = { x: 151, y: 640, w: 270, h: 110, gap: 67 };
  const fx = i => F.x + i * (F.w + F.gap);
  const geo = i => ({ x: fx(i), y: F.y, w: F.w, h: F.h });
  const flow = stages.map((label, i) => box(stage, label, '', geo(i)));
  const flowLit = stages.map((label, i) => box(stage, label, 'accent', geo(i)));
  const flowSolid = stages.map((label, i) => box(stage, label, 'solid', geo(i)));
  const links = [0, 1, 2, 3].map(i => wire(wires, `M${fx(i) + F.w} ${F.y + F.h / 2} L${fx(i + 1)} ${F.y + F.h / 2}`));
  const token = el('div', 'dot', stage);
  const ring = el('div', 'ring', stage);
  const outScope = tagline(L.scope, fx(2), F.y + F.h + 26);
  const waiting = tagline(L.waiting, fx(3), F.y + F.h + 26);
  const approved = tagline(L.approved, fx(3), F.y + F.h + 26);
  // Arrival at each stage; the token travels the link between leave[i] and arrive[i + 1].
  const arrive = [c3 + 1.9, c3 + 2.6, c3 + 3.3, c3 + 3.9, c3 + 5.5];
  const leave = [c3 + 2.2, c3 + 2.9, c3 + 3.5, c3 + 5.0];
  const APPROVE = c3 + 4.6, FLOW_OUT = c3 + 6.0;

  // Closing: the four services as one stack, the platform at the bottom.
  const stack = ch.map((c, i) => box(stage, c.title, i === 0 ? 'accent' : '', { x: 1110, y: 820 - i * 114, w: 680, h: 98 }));

  return t => {
    tag.render(t, prog(t, D - 0.5, 0.45));
    const ends = [c1 - 0.1, c2 - 0.1, c3 - 0.1, FLOW_OUT + 0.5];
    texts.forEach((text, i) => text.render(t, spec.chapters[i] + 0.3, ends[i]));
    closing.render(t, FLOW_OUT + 0.8, D - 0.1);

    // Chapter 1.
    const out1 = 1 - prog(t, c1 - 0.6, 0.5, ease.inOut);
    const fail = prog(t, 3.6, 0.4, ease.inOut);
    nodes.forEach((node, n) => {
      const p = prog(t, 0.3 + n * 0.15, 0.7, ease.expo);
      style(node, { opacity: p * out1 * (n === 1 ? lerp(1, 0.4, fail) : 1), y: 30 * (1 - p) });
    });
    nodes[1].style.borderStyle = fail > 0.5 ? 'dashed' : '';
    style(down, { opacity: prog(t, 3.8, 0.4) * out1 });
    pods.forEach((pod, k) => {
      const [n, i, move] = podPlan[k];
      const from = slot(n, i), to = move ? slot(move[0], move[1]) : from;
      const mv = move ? prog(t, 4.2 + (k - 3) * 0.2, 0.6, ease.inOut) : 0;
      place(pod, { x: lerp(from.x, to.x, mv), y: lerp(from.y, to.y, mv) });
      const dim = move ? 1 - 0.5 * fail * (1 - mv) : 1;
      style(pod, { opacity: prog(t, 0.8 + k * 0.08, 0.3) * out1 * dim, y: -40 * (1 - prog(t, 0.8 + k * 0.08, 0.6, ease.back)) });
    });

    // Chapter 2.
    const out2 = 1 - prog(t, c2 - 0.6, 0.5, ease.inOut);
    const zp = prog(t, c1 + 0.3, 0.6);
    style(zone, { opacity: zp * out2, scale: lerp(0.97, 1, zp) });
    [users, docs, server].forEach((node, i) => {
      const p = prog(t, c1 + 0.6 + i * 0.2, 0.7, ease.expo);
      style(node, { opacity: p * out2, y: 24 * (1 - p) });
    });
    inbound.forEach((path, i) => path.draw(prog(t, c1 + 1.4 + i * 0.2, 0.6), out2));
    traffic.forEach((dot, k) => {
      const p = ((((t - (c1 + 2.1)) * 0.6 + (k >> 1) * 0.5 + (k % 2) * 0.25) % 1) + 1) % 1;
      place(dot, inbound[k % 2].at(p));
      style(dot, { opacity: (t > c1 + 2.1 ? Math.sin(Math.PI * p) : 0) * out2 });
    });
    const op = prog(t, c1 + 2.8, 0.6, ease.expo);
    style(outside, { opacity: op * out2, y: 24 * (1 - op) });
    const leakP = prog(t, c1 + 3.4, 0.5, ease.inOut);
    outbound.draw(leakP, out2);
    place(leak, outbound.at(leakP));
    style(leak, { opacity: (leakP > 0 ? 1 : 0) * (1 - prog(t, c1 + 4.3, 0.4)) * out2 });
    style(wall, { opacity: prog(t, c1 + 3.9, 0.2) * out2, scale: lerp(0.3, 1, prog(t, c1 + 3.9, 0.3, ease.back)) });
    style(blocked, { opacity: prog(t, c1 + 4.1, 0.4) * out2 });

    // Chapter 3.
    const out3 = 1 - prog(t, c3 - 0.6, 0.5, ease.inOut);
    const qp = prog(t, c2 + 0.4, 0.7, ease.expo);
    style(question, { opacity: qp * out3, y: 24 * (1 - qp) });
    const decided = prog(t, c2 + 2.9, 0.6, ease.inOut);
    cards.forEach((node, i) => {
      const p = prog(t, c2 + 0.7 + i * 0.2, 0.7, ease.expo);
      style(node, { opacity: p * out3 * (i ? lerp(1, 0.45, decided) : 1), x: 30 * (1 - p) });
    });
    style(lit, { opacity: decided * out3 });
    rays.forEach((ray, i) => ray.draw(i === 0 ? prog(t, c2 + 2.2, 0.7, ease.inOut) : 0.62 * prog(t, c2 + 1.5 + i * 0.25, 0.6, ease.inOut), out3));
    stops.forEach((stop, j) => {
      const at = c2 + 2.35 + j * 0.25;
      style(stop, { opacity: prog(t, at, 0.15) * out3, scale: lerp(0.3, 1, prog(t, at, 0.3, ease.back)) });
    });

    // Chapter 4.
    const out4 = 1 - prog(t, FLOW_OUT, 0.45, ease.inOut);
    flow.forEach((node, i) => {
      const p = prog(t, c3 + 0.9 + i * 0.12, 0.7, ease.expo);
      style(node, { opacity: p * out4, y: 30 * (1 - p) });
      style(flowLit[i], { opacity: (i < 4 ? prog(t, arrive[i], 0.25) : 0) * out4 });
    });
    style(flowSolid[0], { opacity: 0 }); style(flowSolid[1], { opacity: 0 }); style(flowSolid[2], { opacity: 0 });
    style(flowSolid[3], { opacity: prog(t, APPROVE, 0.4) * out4 });
    style(flowSolid[4], { opacity: prog(t, arrive[4], 0.3) * out4 });
    links.forEach((link, i) => link.draw(prog(t, c3 + 1.3 + i * 0.12, 0.4), out4));

    const hop = leave.findIndex((s, i) => t >= s && t < arrive[i + 1]);
    if (hop >= 0) {
      const p = prog(t, leave[hop], arrive[hop + 1] - leave[hop], ease.inOut);
      place(token, { x: lerp(fx(hop) + F.w, fx(hop + 1), p), y: F.y + F.h / 2 });
    }
    style(token, { opacity: (hop >= 0 ? 1 : 0) * out4 });

    const pulse = (t * 0.8) % 1, ringOn = hold(t, arrive[3], APPROVE + 0.2, 0.3, 0.3);
    place(ring, { x: fx(3) - 30 * pulse, y: F.y - 30 * pulse, w: F.w + 60 * pulse, h: F.h + 60 * pulse });
    ring.style.borderRadius = `${14 + 30 * pulse}px`;
    ring.style.opacity = String(ringOn * (1 - pulse) * 0.8 * out4);
    style(outScope, { opacity: prog(t, arrive[2] + 0.1, 0.3) * out4 });
    style(waiting, { opacity: hold(t, arrive[3] + 0.1, APPROVE + 0.1, 0.3, 0.2) * out4 });
    style(approved, { opacity: prog(t, APPROVE + 0.1, 0.3) * out4 });

    // Closing.
    const fadeEnd = 1 - prog(t, D - 0.55, 0.5, ease.inOut);
    stack.forEach((node, i) => {
      const p = prog(t, FLOW_OUT + 1.0 + i * 0.2, 0.8, ease.expo);
      style(node, { opacity: p * fadeEnd, y: 40 * (1 - p) });
    });
  };
}