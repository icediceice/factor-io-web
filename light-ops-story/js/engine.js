/* Light Ops Stories engine.
   Stage (1920x1080, one transform), beats, stickman rig, Infographic Show builders,
   layout templates, hub, hash routes (#hub, #epN, #epN-S), dual play modes:
   Watch (?mode=watch, continuous autoplay + scrubber + Flow loops) and
   Present (?mode=present, strict 1-beat-per-click/Space/ArrowRight, zero timer),
   language (?lang=en|th, L), contact sheet (?sheet=epN), still mode (?still or reduced-motion).
   Episodes live in ep/epN.js and register with LS.ep({...}). */
(function () {
'use strict';
var LS = window.LS = { eps: {}, list: [] };
var R = Math.PI / 180;
var Q = location.search || '';
var STILL = /[?&]still\b/.test(Q);
var SHEET_MATCH = /[?&]sheet=ep(\d+)/.exec(Q);
var SHEET = !!SHEET_MATCH;
var REDUCE = STILL || SHEET || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
var HTML = document.documentElement;
if (STILL) HTML.classList.add('still');

/* ================= text and attributes ================= */
function T(x) {
  if (x == null) return '';
  if (Array.isArray(x)) return '<span class="L" lang="en">' + x[0] + '</span><span class="L" lang="th">' + (x[1] != null ? x[1] : x[0]) + '</span>';
  return String(x);
}
function bt(o) {
  var a = '';
  if (!o) return a;
  if (o.b != null) a += ' data-b="' + o.b + '"';
  if (o.d != null) a += ' data-d="' + o.d + '"';
  if (o.out != null) a += ' data-out="' + o.out + '"';
  if (o.at) a += ' data-cls="' + o.at + '"';
  return a;
}
function fx(o, def) { var v = (o && o.fx !== undefined) ? o.fx : def; return v ? ' fx-' + v : ''; }
function asObj(x) { return (Array.isArray(x) || typeof x === 'string') ? { text: x } : x; }
function fmt(v, dec) { dec = +dec || 0; var s = dec ? Number(v).toFixed(dec) : String(Math.round(v)); return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
LS.T = T; LS.bt = bt;
LS.ep = function (def) { LS.eps[def.no] = def; };

/* ================= icons (24-unit line art) ================= */
var IC = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  shieldCheck: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  server: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 7.5h.01M8 16.5h.01"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16.5h6"/>',
  building: '<path d="M5 21V4h10v17M15 9h4v12M3 21h18M8 8h4M8 12h4M8 16h4"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5A3.5 3.5 0 0 1 17 18z"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M12 7V5M9 4l1.5 2M15 4l-1.5 2M4 11h4M16 11h4M4 16h4M16 16h4M12 11v8"/>',
  patch: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M10.5 12h.01M13.5 12h.01M12 10.5h.01M12 13.5h.01"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21 19"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 5v16M8 7h7"/>',
  warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 10l1.5 1.5L12.5 9M14 10.5h2M8.5 15l1.5 1.5 2.5-2.5M14 15.5h2"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16a3 3 0 0 1 6 0M14 10h4M14 13.5h4"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  wrench: '<path d="M15 4a5 5 0 0 0-4.6 6.9L4 17.3V20h2.7l6.4-6.4A5 5 0 0 0 20 9l-3 1-2-2 1-3z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  scale: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  rocket: '<path d="M12 3c3 2 5 6 4 11h-8C7 9 9 5 12 3z"/><path d="M8 14l-3 3h4M16 14l3 3h-4M10 18l2 3 2-3"/><circle cx="12" cy="9" r="1.6"/>',
  door: '<path d="M6 21V3h12v18M3 21h18"/><circle cx="15" cy="12" r=".8"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  stamp: '<path d="M9 3h6v5l3 4H6l3-4z"/><path d="M4 16h16v3H4z"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9s10 3 10 9"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 12l6.3-6.3"/>',
  skull: '<path d="M7 18v2h10v-2c1.8-1.4 3-3.5 3-6a8 8 0 1 0-16 0c0 2.5 1.2 4.6 3 6z"/><circle cx="9.5" cy="12" r="1.4"/><circle cx="14.5" cy="12" r="1.4"/><path d="M10 18v2M14 18v2"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  click: '<path d="M9 9l10 4-4.2 1.6L13.2 19z"/><path d="M9 3v3M3 9h3M4.8 4.8l2.1 2.1M13.2 4.8l-2.1 2.1"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  fs: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  home: '<path d="M3 11l9-7 9 7M5 10v10h14V10"/>',
  deal: '<path d="M3 12l4-4 5 3 5-3 4 4-9 7z"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'
};
LS.IC = IC;
LS.ic = function (n, cls) {
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
};
/* An icon inside a scene SVG, centred at x,y, s px wide. Beat attrs sit on the outer <g> so CSS
   transforms (fx-pop) never overwrite the geometry transform on the inner <g>. */
LS.icg = function (o) {
  var s = o.s || 96;
  return '<g class="icg ' + (o.tone || '') + fx(o, 'pop') + '"' + bt(o) + '><g transform="translate(' + (o.x - s / 2) + ',' + (o.y - s / 2) + ') scale(' + (s / 24) + ')"><g fill="none" stroke="currentColor" stroke-width="' + (o.w || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + (IC[o.n] || '') + '</g></g></g>';
};

/* ================= scene helpers (return SVG strings) ================= */
function towerGeo(o) {
  var c = o.cols || 5, r = o.rows || 10, ww = o.ww || 44, wh = o.wh || 50, gx = o.gx || 30, gy = o.gy || 26, px = o.px || 32, py = o.py || 44;
  return { c: c, r: r, ww: ww, wh: wh, gx: gx, gy: gy, px: px, py: py, w: o.w || (px * 2 + c * ww + (c - 1) * gx), h: o.h || (py + r * (wh + gy) + (o.door ? 130 : 40)) };
}
LS.winAt = function (o, j, i) { var g = towerGeo(o); return [o.x + g.px + j * (g.ww + g.gx) + g.ww / 2, o.y + g.py + i * (g.wh + g.gy) + g.wh / 2]; };
LS.towerSize = function (o) { var g = towerGeo(o); return [g.w, g.h]; };
LS.tower = function (o) {
  var g = towerGeo(o), x = o.x, y = o.y, ch = o.chink, lit = o.lit == null ? 6 : o.lit;
  var s = '<g class="tower' + (o.cls ? ' ' + o.cls : '') + fx(o) + '"' + bt(o) + '><rect class="tw-body" x="' + x + '" y="' + y + '" width="' + g.w + '" height="' + g.h + '"/>';
  for (var i = 0; i < g.r; i++) for (var j = 0; j < g.c; j++) {
    var wx = x + g.px + j * (g.ww + g.gx), wy = y + g.py + i * (g.wh + g.gy);
    var isC = ch && ch[0] === j && ch[1] === i, on = !isC && lit && ((i * 7 + j * 3 + (o.seed || 0)) % lit === 0);
    var oc = isC ? (o.chinkAt != null ? ' data-cls="' + o.chinkAt + ':open"' : '') : '';
    if (isC) s += '<rect class="glow' + (o.chinkOpen ? ' open' : '') + '" x="' + (wx - 26) + '" y="' + (wy - 26) + '" width="' + (g.ww + 52) + '" height="' + (g.wh + 52) + '" rx="22"' + oc + '/>';
    s += '<rect class="win' + (on ? ' lit' : '') + (isC ? ' chink' + (o.chinkOpen ? ' open' : '') : '') + '" x="' + wx + '" y="' + wy + '" width="' + g.ww + '" height="' + g.wh + '" rx="3"' + oc + '/>';
  }
  if (o.door) s += '<rect class="door' + (o.doorOpen ? ' open' : '') + '"' + (o.doorAt != null ? ' data-cls="' + o.doorAt + ':open"' : '') + ' x="' + (x + g.w / 2 - 42) + '" y="' + (y + g.h - 116) + '" width="84" height="116" rx="4"/>';
  return s + '</g>';
};
LS.roof = function (o) { var w = o.w || 760; return '<rect class="roof" x="' + o.x + '" y="' + o.y + '" width="' + w + '" height="' + (1100 - o.y) + '"/><line class="ledge" x1="' + o.x + '" y1="' + (o.y + 22) + '" x2="' + (o.x + w) + '" y2="' + (o.y + 22) + '"/>'; };
LS.ground = function (y) { return '<rect class="floor" x="0" y="' + y + '" width="1920" height="' + (1080 - y) + '"/><line class="ground" x1="0" y1="' + y + '" x2="1920" y2="' + y + '"/>'; };
LS.rack = function (o) {
  var x = o.x, y = o.y, u = o.u || 7, w = o.w || 220, uh = o.uh || 52;
  var s = '<g class="rack' + (o.cls ? ' ' + o.cls : '') + fx(o) + '"' + bt(o) + '><rect class="rk" x="' + x + '" y="' + y + '" width="' + w + '" height="' + (u * uh + 28) + '" rx="10"/>';
  for (var i = 0; i < u; i++) {
    var yy = y + 14 + i * uh, cy = yy + (uh - 10) / 2;
    s += '<rect class="ru" x="' + (x + 14) + '" y="' + yy + '" width="' + (w - 28) + '" height="' + (uh - 10) + '" rx="5"/>' +
      '<line class="ru-l" x1="' + (x + 34) + '" y1="' + cy + '" x2="' + (x + w - 90) + '" y2="' + cy + '"/>' +
      '<circle class="led' + (o.bad === i ? ' bad' : (o.warn === i ? ' warn' : '')) + '" cx="' + (x + w - 44) + '" cy="' + cy + '" r="7" style="animation-delay:' + (-((i * 0.37) % 1.6)).toFixed(2) + 's"/>';
  }
  return s + '</g>';
};
LS.lock = function (o) {
  return '<g class="padlock' + (o.open ? ' open' : '') + (o.bad ? ' bad' : '') + (o.cls ? ' ' + o.cls : '') + fx(o, 'pop') + '"' + bt(o) + '><g transform="translate(' + o.x + ',' + o.y + ') scale(' + (o.s || 1) + ')">' +
    '<path class="shackle" d="M-26,-4 V-30 a26,26 0 0 1 52,0 V-4"/><rect class="lk" x="-42" y="-6" width="84" height="66" rx="12"/><circle class="kh" cx="0" cy="22" r="8"/><path class="kh" d="M0,26 v14"/></g></g>';
};
LS.plan = function (o) {
  var x = o.x, y = o.y, w = o.w || 240, h = o.h || 300, n = o.lines || 5;
  var s = '<g class="plandoc' + (o.cls ? ' ' + o.cls : '') + fx(o, 'pop') + '"' + bt(o) + '><rect class="pl" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="14"/>' +
    '<rect class="pl-h" x="' + x + '" y="' + y + '" width="' + w + '" height="44" rx="14"/><rect class="pl-h" x="' + x + '" y="' + (y + 24) + '" width="' + w + '" height="20"/>';
  for (var i = 0; i < n; i++) {
    var ly = y + 76 + i * ((h - 100) / n);
    var cb = o.checkAt && o.checkAt[i] != null ? ' data-b="' + o.checkAt[i] + '"' : '';
    var shown = cb || (o.checks && i < o.checks);
    s += '<path class="pl-ok' + (shown ? '' : ' hide') + '"' + cb + ' d="M' + (x + 24) + ',' + (ly + 4) + ' l9,9 l16,-18"/>' +
      '<rect class="pl-l" x="' + (x + 64) + '" y="' + (ly - 2) + '" width="' + (w - 96 - ((i * 37) % 60)) + '" height="14" rx="7"/>';
  }
  return s + '</g>';
};
LS.gate = function (o) {
  var x = o.x, y = o.y, h = o.h || 300, w = o.w || 300;
  return '<g class="gate' + (o.open ? ' open' : '') + (o.cls ? ' ' + o.cls : '') + fx(o) + '"' + bt(o) + '>' +
    '<rect class="gt-p" x="' + x + '" y="' + y + '" width="44" height="' + h + '" rx="8"/><rect class="gt-p" x="' + (x + w - 44) + '" y="' + y + '" width="44" height="' + h + '" rx="8"/>' +
    '<rect class="gt-p" x="' + (x - 10) + '" y="' + (y - 30) + '" width="' + (w + 20) + '" height="40" rx="10"/><circle class="gt-lamp" cx="' + (x + w / 2) + '" cy="' + (y - 10) + '" r="12"/>' +
    '<rect class="gt-bar" x="' + (x + 44) + '" y="' + (y + h * 0.55) + '" width="' + (w - 88) + '" height="22" rx="11"/></g>';
};
LS.idcard = function (o) {
  var x = o.x, y = o.y, w = o.w || 220, h = o.h || 140;
  return '<g class="idcard' + (o.cls ? ' ' + o.cls : '') + fx(o, 'pop') + '"' + bt(o) + '><rect class="idc" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="14"/>' +
    '<circle class="idc-a" cx="' + (x + 52) + '" cy="' + (y + 54) + '" r="22"/><path class="idc-a" d="M' + (x + 22) + ',' + (y + h - 20) + ' a30,26 0 0 1 60,0"/>' +
    '<rect class="idc-l" x="' + (x + 100) + '" y="' + (y + 36) + '" width="' + (w - 124) + '" height="14" rx="7"/><rect class="idc-l" x="' + (x + 100) + '" y="' + (y + 64) + '" width="' + (w - 150) + '" height="14" rx="7"/>' +
    (o.seal ? '<g class="seal"' + (o.sealAt != null ? ' data-b="' + o.sealAt + '"' : '') + '><circle cx="' + (x + w - 34) + '" cy="' + (y + h - 34) + '" r="22"/><path d="M' + (x + w - 45) + ',' + (y + h - 34) + ' l8,8 l14,-15"/></g>' : '') + '</g>';
};
LS.arrow = function (o) {
  var x1 = o.x1, y1 = o.y1, x2 = o.x2, y2 = o.y2, c = o.bend || 0, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  var cx = (x1 + x2) / 2 - dy / len * c, cy = (y1 + y2) / 2 + dx / len * c, a = Math.atan2(y2 - cy, x2 - cx), hs = o.head || 24;
  var p1 = [x2 - hs * Math.cos(a - 0.45), y2 - hs * Math.sin(a - 0.45)], p2 = [x2 - hs * Math.cos(a + 0.45), y2 - hs * Math.sin(a + 0.45)];
  return '<g class="arrow ' + (o.tone || '') + '"' + bt(o) + '><path class="arw draw" pathLength="1" d="M' + x1 + ',' + y1 + ' Q' + cx.toFixed(1) + ',' + cy.toFixed(1) + ' ' + x2 + ',' + y2 + '"' + (o.w ? ' style="stroke-width:' + o.w + 'px"' : '') + '/>' +
    '<path class="arw-h" d="M' + x2 + ',' + y2 + ' L' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' L' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1) + 'Z"/></g>';
};
LS.clock = function (o) {
  var x = o.x, y = o.y, r = o.r || 70;
  return '<g class="clock' + fx(o, 'pop') + '"' + bt(o) + '><circle class="clk-f" cx="' + x + '" cy="' + y + '" r="' + r + '"/>' +
    '<line class="clk-h" x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y - r * 0.5) + '" style="transform-origin:' + x + 'px ' + y + 'px;transform:rotate(' + (o.hr || 120) + 'deg)"/>' +
    '<line class="clk-h' + (o.spin !== false ? ' clk-m' : '') + '" x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y - r * 0.78) + '" style="transform-origin:' + x + 'px ' + y + 'px' + (o.spin === false ? ';transform:rotate(' + (o.mn || 0) + 'deg)' : '') + '"/></g>';
};
LS.cal = function (o) {
  var x = o.x, y = o.y, w = o.w || 170, h = o.h || 170;
  return '<g class="calp' + fx(o, 'pop') + '"' + bt(o) + '><rect class="cal-b" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="14"/><rect class="cal-t" x="' + x + '" y="' + y + '" width="' + w + '" height="44" rx="14"/><rect class="cal-t" x="' + x + '" y="' + (y + 24) + '" width="' + w + '" height="20"/>' +
    '<text class="cal-n" x="' + (x + w / 2) + '" y="' + (y + h * 0.76) + '" text-anchor="middle">' + (o.n || '') + '</text></g>';
};
LS.zzz = function (o) {
  var s = '<g class="zzz"' + bt(o) + '>';
  for (var i = 0; i < 3; i++) s += '<text class="zz" x="' + (o.x + i * 28) + '" y="' + (o.y - i * 34) + '" style="animation-delay:' + (i * 0.8) + 's;font-size:' + (36 + i * 8) + 'px">Z</text>';
  return s + '</g>';
};
/* Dashed wire with packets running along it (SMIL animateMotion: reliable on SVG in Chrome). */
LS.flow = function (o) {
  var n = o.n || 4, dur = o.dur || 3, s = '<g class="flow ' + (o.tone || '') + '"' + bt(o) + '><path class="wire" d="' + o.d + '"/>';
  for (var i = 0; i < n; i++) s += '<circle class="pk" r="' + (o.r || 9) + '"><animateMotion dur="' + dur + 's" begin="' + (-dur * i / n).toFixed(2) + 's" repeatCount="indefinite" path="' + o.d + '"/></circle>';
  return s + '</g>';
};

/* ================= stickman rig ================= */
var J = ['t', 'h', 'aL', 'fL', 'aR', 'fR', 'lL', 'sL', 'lR', 'sR'];
var SG = { t: 1, h: 1, aL: -1, fL: -1, aR: -1, fR: -1, lL: -1, sL: 1, lR: -1, sR: 1 };
var P0 = { t: 0, h: 0, aL: 10, fL: 10, aR: -8, fR: 12, lL: 5, sL: 3, lR: -5, sR: 3 };
var POSES = {
  stand: {}, none: {},
  lean: { t: 16, h: 10, aL: 64, fL: 112, aR: 72, fR: 104 },
  watch: { t: 4, h: -2, aL: 62, fL: 120, aR: 70, fR: 112 },
  sit: { lL: 84, sL: 84, lR: 78, sR: 80, aL: 25, fL: 45, aR: 30, fR: 50, t: 2 },
  point: { aR: 96, fR: 0, aL: 8, fL: 10 },
  pointup: { aR: 150, fR: 8 },
  type: { t: 10, h: 12, aL: 56, fL: 56, aR: 64, fR: 48 },
  cheer: { aL: 166, fL: 10, aR: 170, fR: -8, h: -10 },
  think: { h: 8, aR: 42, fR: 140, aL: -4, fL: 70 },
  hold: { aR: 34, fR: 70 },
  carry: { aL: 50, fL: 60, aR: 56, fR: 54 },
  stop: { aR: 88, fR: 84, t: -4 },
  guard: { aR: 70, fR: 20, aL: 30, fL: 60, t: 4 },
  hands: { aL: 150, fL: 30, aR: 150, fR: 30, h: -6 },
  crouch: { t: 30, lL: 62, sL: 104, lR: 40, sR: 92, aL: 40, fL: 40, aR: 50, fR: 30 },
  peek: { t: 28, h: 10, aL: 40, fL: 50, aR: 50, fR: 40 },
  sleep: { t: 62, h: 34, aL: 72, fL: 84, aR: 78, fR: 76, lL: 84, sL: 84, lR: 78, sR: 80 },
  present: { aR: 62, fR: -18, h: -4 },
  shrug: { aL: -28, fL: -96, aR: -24, fR: -100, h: 6 },
  reach: { t: 10, aR: 112, fR: 4, aL: 20, fL: 20 },
  sad: { h: 24, t: 6, aL: 4, fL: 6, aR: -4, fR: 6 },
  lookup: { h: -18 },
  fold: { aL: 52, fL: 112, aR: 58, fR: 104 },
  strike: { t: 8, aR: 110, fR: 10, aL: -30, fL: 80 },
  knocked: { t: -18, h: -14, lL: 40, sL: 20, lR: 20, sR: 10, aL: -40, fL: -60, aR: -30, fR: -70 }
};
var LOOPS = {
  watch: function (s) { return { h: -2 + 5 * Math.sin(s * 1.25), t: 4 + 2 * Math.sin(s * 1.25) }; },
  scan: function (s) { return { h: 10 * Math.sin(s * 1.6) }; },
  type: function (s) { return { aL: 56 + 7 * Math.sin(s * 13), aR: 64 + 7 * Math.sin(s * 13 + 2) }; },
  talk: function (s) { return { aR: 44 + 16 * Math.sin(s * 5), fR: 70 + 22 * Math.sin(s * 5 + 1), h: 3 * Math.sin(s * 3) }; },
  wave: function (s) { return { aR: 166, fR: 22 * Math.sin(s * 9) }; },
  cheer: function (s) { return { aL: 158 + 12 * Math.sin(s * 10), aR: 164 - 12 * Math.sin(s * 10) }; },
  nod: function (s) { return { h: 9 * Math.sin(s * 6) }; },
  panic: function (s) { return { aL: 150 + 30 * Math.sin(s * 14), aR: 140 - 30 * Math.sin(s * 14), fL: 20, fR: 20 }; },
  breathe: function (s) { return { t: 1.6 * Math.sin(s * 2) }; },
  bob: function (s) { return { t: 2 * Math.sin(s * 3), h: 4 * Math.sin(s * 3) }; },
  snore: function (s) { return { h: 34 + 4 * Math.sin(s * 2), t: 62 + 2 * Math.sin(s * 2) }; }
};
var SPEED = { walk: 260, run: 560, sneak: 150 }, STRIDE = { walk: 130, run: 230, sneak: 84 };
var GAIT = {
  walk: function (p) { var s = Math.sin(p); return { t: 3, lL: 24 * s, lR: -24 * s, sL: Math.max(0, 40 * Math.sin(p - 1.2)) + 4, sR: Math.max(0, 40 * Math.sin(p + Math.PI - 1.2)) + 4, aL: -20 * s, aR: 20 * s, fL: 12, fR: 12 }; },
  run: function (p) { var s = Math.sin(p); return { t: 14, h: 4, lL: 40 * s, lR: -40 * s, sL: Math.max(0, 64 * Math.sin(p - 1.2)) + 10, sR: Math.max(0, 64 * Math.sin(p + Math.PI - 1.2)) + 10, aL: -48 * s, aR: 48 * s, fL: 84, fR: 84 }; },
  sneak: function (p) { var s = Math.sin(p); return { t: 24, h: 8, lL: 30 + 22 * s, lR: 30 - 22 * s, sL: 70 + 22 * Math.max(0, Math.sin(p - 1)), sR: 70 + 22 * Math.max(0, Math.sin(p + Math.PI - 1)), aL: 56 + 10 * s, aR: 50 - 10 * s, fL: 60, fR: 66 }; }
};
var HEADS = {
  person: '<circle class="hd" cy="-29" r="22"/>',
  engineer: '<circle class="hd" cy="-29" r="22"/><path class="acc" d="M-23,-31 A23,23 0 0 1 23,-31"/><path class="acc" d="M21,-27 q4,16 -12,18"/>',
  attacker: '<path class="hood" d="M-26,-12 C-36,-64 30,-68 31,-27 C32,-6 20,7 2,9 C-16,9 -25,-1 -26,-12 Z"/><circle class="eye" cx="13" cy="-30" r="3.2"/><circle class="eye" cx="22" cy="-30" r="3.2"/>',
  burglar: '<circle class="hd" cy="-29" r="22"/><path class="beanie" d="M-23,-33 A23,23 0 0 1 23,-33 Z"/><rect class="mask" x="-21" y="-34" width="42" height="10" rx="5"/>',
  robot: '<rect class="hd" x="-22" y="-56" width="44" height="44" rx="11"/><rect class="visor" x="-4" y="-43" width="26" height="12" rx="6"/><line class="acc" y1="-56" y2="-68"/><circle class="tip" cy="-72" r="5"/>'
};
var ROLE_HEAD = { person: 'person', defender: 'person', engineer: 'engineer', boss: 'person', attacker: 'attacker', burglar: 'burglar', ai: 'robot', logbot: 'robot', rogue: 'robot', guardian: 'robot', agent: 'robot', lightagent: 'robot' };
var ROLE_HOLD = { guardian: 'shield', agent: 'keys' };
var HEADPROPS = { binoculars: '<g class="prop"><rect x="14" y="-42" width="30" height="12" rx="5"/><rect x="14" y="-28" width="30" height="12" rx="5"/></g>' };
var HANDPROPS = {
  laptop: '<g class="prop"><rect x="-6" y="-4" width="48" height="30" rx="4"/></g>',
  phone: '<rect class="prop" x="-7" y="-6" width="16" height="28" rx="4"/>',
  clipboard: '<g class="prop"><rect x="-6" y="-8" width="36" height="46" rx="4"/><line x1="3" y1="6" x2="22" y2="6"/><line x1="3" y1="17" x2="22" y2="17"/><line x1="3" y1="28" x2="15" y2="28"/></g>',
  scroll: '<g class="prop"><rect x="-4" y="-10" width="40" height="52" rx="4"/><line x1="4" y1="2" x2="28" y2="2"/><line x1="4" y1="14" x2="28" y2="14"/><line x1="4" y1="26" x2="20" y2="26"/></g>',
  key: '<g class="prop"><circle cx="0" cy="9" r="9"/><line x1="0" y1="18" x2="0" y2="44"/><line x1="0" y1="38" x2="9" y2="38"/></g>',
  keys: '<g class="prop"><circle cx="0" cy="8" r="10"/><g transform="rotate(24)"><line x1="0" y1="18" x2="0" y2="44"/><line x1="0" y1="38" x2="8" y2="38"/></g><g transform="rotate(-24)"><line x1="0" y1="18" x2="0" y2="42"/><line x1="0" y1="36" x2="-8" y2="36"/></g><line x1="0" y1="18" x2="0" y2="48"/><line x1="0" y1="42" x2="9" y2="42"/></g>',
  shield: '<path class="prop" d="M-2,-26 L36,-32 L36,8 C36,32 16,44 -2,50 Z"/>',
  wrench: '<path class="prop" d="M-4,-4 h8 v30 l7,8 l-5,11 l-6,-6 l-6,6 l-5,-11 l7,-8 z"/>',
  coffee: '<g class="prop"><rect x="-8" y="-6" width="24" height="28" rx="4"/><path class="acc" d="M16,0 q10,0 10,8 q0,8 -10,8"/></g>',
  flag: '<g class="prop"><line x1="0" y1="-60" x2="0" y2="30"/><path d="M0,-60 h44 l-10,14 l10,14 h-44 z"/></g>'
};
function limb(j, k, l1, l2, back, prop) {
  return '<g class="' + (back ? 'back' : '') + '" data-j="' + j + '"><line y2="' + l1 + '"/><g transform="translate(0,' + l1 + ')"><g data-j="' + k + '"><line y2="' + l2 + '"/>' +
    (prop ? '<g transform="translate(0,' + l2 + ')">' + prop + '</g>' : '') + '</g></g></g>';
}
function build(g, role, hold, headprop) {
  var head = (HEADS[ROLE_HEAD[role] || 'person'] || HEADS.person) + (HEADPROPS[headprop] || '');
  var chest = role === 'boss' ? '<path class="tie" d="M0,-64 l-8,10 l8,28 l8,-28 z"/>' : (role === 'lightagent' ? '<rect class="badge" x="2" y="-58" width="18" height="14" rx="3"/>' : '');
  g.innerHTML = '<g class="sm-root"><g class="sm-hip">' + limb('lL', 'sL', 48, 48, true) +
    '<g data-j="t"><g transform="translate(0,-66)">' + limb('aL', 'fL', 40, 38, true) + '</g><line y2="-74"/>' + chest +
    '<g transform="translate(0,-74)"><g data-j="h"><line y2="-8"/>' + head + '</g></g>' +
    '<g transform="translate(0,-66)">' + limb('aR', 'fR', 40, 38, false, HANDPROPS[hold] || '') + '</g></g>' +
    limb('lR', 'sR', 48, 48, false) + '</g></g>';
}
function named(n) { var o = {}, k; for (k in P0) o[k] = P0[k]; String(n || 'stand').split('+').forEach(function (p) { var q = POSES[p] || {}; for (var k in q) o[k] = q[k]; }); return o; }
function mix(a, b, t) { var o = {}; J.forEach(function (k) { o[k] = a[k] + (b[k] - a[k]) * t; }); return o; }
function over(a, d) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in d) o[k] = d[k]; return o; }
function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function parseActs(s) {
  var out = [], re = /(\d+)(?:\+([\d.]+))?:(\w+)\(([^)]*)\)/g, m;
  while ((m = re.exec(s))) out.push({ b: +m[1], d: +(m[2] || 0), c: m[3], a: m[4] === '' ? [] : m[4].split(',').map(function (x) { return x.trim(); }) });
  return out;
}
function Actor(g) {
  var d = g.dataset;
  this.g = g; this.id = d.actor; this.role = d.role || 'person';
  this.x0 = +d.x || 0; this.y0 = +d.y || 0; this.f0 = +(d.face || 1); this.s = +(d.s || 1);
  this.seat = d.seat === '1'; this.p0 = d.pose || 'stand'; this.acts = parseActs(d.act || '');
  g.classList.add('actor', 'role-' + this.role);
  build(g, this.role, d.hold != null ? d.hold : ROLE_HOLD[this.role], d.headprop);
  this.root = g.querySelector('.sm-root'); this.hip = g.querySelector('.sm-hip');
  this.root.style.setProperty('--s', this.s);
  this.j = {}; var self = this;
  g.querySelectorAll('[data-j]').forEach(function (n) { self.j[n.dataset.j] = n; });
  this.c0 = g.getAttribute('class'); /* reset restores this, undoing cls, uncls, hide and show */
  this.reset();
}
Actor.prototype.reset = function () {
  this.x = this.x0; this.y = this.y0; this.face = this.f0; this.base = named(this.p0); this.cur = this.base;
  this.tw = null; this.mv = null; this.lp = null; this.lp0 = 0; this.jmp = null;
  this.g.setAttribute('class', this.c0);
  this.draw(this.base, this.x, this.y);
};
Actor.prototype.run = function (c, now, settle) {
  var a = c.a, n = c.c;
  if (n === 'pose') { var to = named(a[0]), dur = a[1] != null ? +a[1] : .5; this.tw = (settle || !dur) ? null : { from: this.cur, to: to, t0: now, dur: dur }; this.base = to; }
  else if (n === 'loop') { this.lp = (a[0] === 'none' ? null : a[0]); this.lp0 = now; }
  else if (n === 'walk' || n === 'run' || n === 'sneak' || n === 'to') {
    var x1 = +a[0], y1 = (n === 'to' && a[1] != null) ? +a[1] : this.y, dist = Math.abs(x1 - this.x);
    var du = n === 'to' ? (a[2] != null ? +a[2] : 1) : (a[1] != null ? +a[1] : dist / SPEED[n]);
    if (n !== 'to' && x1 !== this.x && a[2] !== 'back') this.face = x1 > this.x ? 1 : -1;
    this.lp = null;
    if (settle || !du) { this.x = x1; this.y = y1; this.mv = null; }
    else this.mv = { x0: this.x, x1: x1, y0: this.y, y1: y1, t0: now, dur: du, g: n === 'to' ? null : n };
  }
  else if (n === 'face') this.face = +a[0];
  else if (n === 'cls') this.g.classList.add(a[0]);
  else if (n === 'uncls') this.g.classList.remove(a[0]);
  else if (n === 'hide') this.g.classList.add('gone');
  else if (n === 'show') this.g.classList.remove('gone');
  else if (n === 'jump' && !settle) this.jmp = { t0: now, dur: .5 };
  if (settle) this.tick(now, true);
};
Actor.prototype.tick = function (now, settled) {
  var p = this.base, x = this.x, y = this.y, k;
  if (this.tw) { k = Math.min(1, (now - this.tw.t0) / this.tw.dur); p = mix(this.tw.from, this.tw.to, ease(k)); if (k >= 1) this.tw = null; }
  if (this.lp && LOOPS[this.lp]) p = over(p, LOOPS[this.lp](settled ? 0 : now - this.lp0));
  if (this.mv) {
    var m = this.mv; k = Math.min(1, (now - m.t0) / m.dur);
    var e = m.g ? k : ease(k);
    x = m.x0 + (m.x1 - m.x0) * e; y = m.y0 + (m.y1 - m.y0) * e;
    if (m.g) { var gp = GAIT[m.g](2 * Math.PI * Math.abs(x - m.x0) / STRIDE[m.g]); p = mix(p, over(p, gp), Math.min(1, k * 6, (1 - k) * 6)); }
    if (k >= 1) { this.x = m.x1; this.y = m.y1; this.mv = null; }
  }
  if (this.jmp) { k = (now - this.jmp.t0) / this.jmp.dur; if (k >= 1) this.jmp = null; else y -= Math.sin(k * Math.PI) * 60 * this.s; }
  this.cur = p; this.draw(p, x, y);
};
Actor.prototype.draw = function (p, x, y) {
  var self = this;
  J.forEach(function (k) { var n = self.j[k]; if (n) n.setAttribute('transform', 'rotate(' + (SG[k] * p[k]).toFixed(2) + ')'); });
  var fy = function (l, s) { return 48 * Math.cos(l * R) + 48 * Math.cos((l - s) * R); };
  var hipY = this.seat ? 0 : Math.max(fy(p.lL, p.sL), fy(p.lR, p.sR));
  this.hip.setAttribute('transform', 'translate(0,' + (-hipY).toFixed(2) + ')');
  this.root.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + (this.face * this.s) + ',' + this.s + ')');
};
/* Actor markup for a scene: LS.A({id, role, x, y, s, face, seat, pose, hold, head, act, b}) */
LS.A = function (o) {
  return '<g data-actor="' + (o.id || '') + '" data-role="' + (o.role || 'person') + '" data-x="' + o.x + '" data-y="' + o.y + '" data-s="' + (o.s || 1) + '" data-face="' + (o.face || 1) + '"' +
    (o.seat ? ' data-seat="1"' : '') + ' data-pose="' + (o.pose || 'stand') + '"' + (o.hold != null ? ' data-hold="' + o.hold + '"' : '') +
    (o.head ? ' data-headprop="' + o.head + '"' : '') + (o.act ? ' data-act="' + o.act + '"' : '') + bt(o) + '></g>';
};
LS.POSES = POSES; LS.Actor = Actor;

/* ================= shot: beats, reveals, actors, beams ================= */
function parseCls(n) {
  return { n: n, list: n.dataset.cls.trim().split(/\s+/).map(function (s) { var i = s.indexOf(':'); return { b: +s.slice(0, i), c: s.slice(i + 1) }; }) };
}
function Shot(el) {
  var self = this;
  this.el = el;
  this.actors = [].map.call(el.querySelectorAll('[data-actor]'), function (g) { return new Actor(g); });
  this.byId = {}; this.actors.forEach(function (a) { if (a.id) self.byId[a.id] = a; });
  this.items = [].slice.call(el.querySelectorAll('[data-b]'));
  this.outs = [].slice.call(el.querySelectorAll('[data-out]'));
  this.cls = [].slice.call(el.querySelectorAll('[data-cls]')).map(parseCls);
  this.beams = [].slice.call(el.querySelectorAll('.beam[data-from]'));
  var mx = 0;
  this.items.forEach(function (i) { mx = Math.max(mx, +i.dataset.b); });
  this.outs.forEach(function (i) { mx = Math.max(mx, +i.dataset.out); });
  this.cls.forEach(function (x) { x.list.forEach(function (e) { mx = Math.max(mx, e.b); }); });
  this.actors.forEach(function (a) { a.acts.forEach(function (c) { mx = Math.max(mx, c.b); }); });
  this.n = mx + 1;
  this.times = (el.dataset.t || '').trim().split(/\s+/).filter(Boolean).map(Number);
  this.beat = -1; this.queue = []; this.counts = [];
}
Shot.prototype.reset = function () {
  this.items.forEach(function (i) { i.classList.remove('in'); i.style.transitionDelay = ''; });
  this.outs.forEach(function (i) { i.classList.remove('out'); });
  this.cls.forEach(function (x) { x.list.forEach(function (e) { x.n.classList.remove(e.c); }); });
  this.el.querySelectorAll('.count').forEach(function (c) { c.textContent = fmt(c.dataset.from || 0, c.dataset.dec); });
  this.actors.forEach(function (a) { a.reset(); });
  this.queue = []; this.counts = []; this.beat = -1;
};
Shot.prototype.go = function (b, settle, now) {
  /* finish the beat already on screen first, so none of its delayed actions land on the new one */
  if (this.beat >= 0 && b > this.beat) this.settle(now);
  for (var i = this.beat + 1; i <= b && i < this.n; i++) this.apply(i, settle || i < b, now);
  this.beat = Math.min(b, this.n - 1);
};
Shot.prototype.apply = function (b, settle, now) {
  var self = this;
  this.items.forEach(function (i) {
    if (+i.dataset.b !== b) return;
    var d = +(i.dataset.d || 0);
    i.style.transitionDelay = settle ? '0s' : d + 's';
    i.classList.add('in');
    i.querySelectorAll('.count').forEach(function (c) {
      if (settle) c.textContent = fmt(c.dataset.to, c.dataset.dec);
      else self.counts.push({ c: c, t0: now + d, dur: +(c.dataset.dur || 2), from: +(c.dataset.from || 0), to: +c.dataset.to, dec: c.dataset.dec });
    });
  });
  this.outs.forEach(function (i) { if (+i.dataset.out === b) i.classList.add('out'); });
  this.cls.forEach(function (x) { x.list.forEach(function (e) { if (e.b === b) x.n.classList.add(e.c); }); });
  this.actors.forEach(function (a) {
    a.acts.forEach(function (c) {
      if (c.b !== b) return;
      if (settle || !c.d) a.run(c, now, settle); else self.queue.push({ at: now + c.d, a: a, c: c });
    });
  });
};
Shot.prototype.settle = function (now) {
  this.queue.forEach(function (q) { q.a.run(q.c, now, true); });
  this.queue = [];
  this.counts.forEach(function (k) { k.c.textContent = fmt(k.to, k.dec); });
  this.counts = [];
  this.actors.forEach(function (a) { a.tw = null; if (a.mv) { a.x = a.mv.x1; a.y = a.mv.y1; a.mv = null; } a.tick(now, true); });
};
Shot.prototype.tick = function (now) {
  var q = this.queue, self = this;
  this.queue = [];
  q.forEach(function (e) { if (now >= e.at) e.a.run(e.c, now, false); else self.queue.push(e); });
  this.counts = this.counts.filter(function (k) {
    if (now < k.t0) return true;
    var t = Math.min(1, (now - k.t0) / k.dur);
    k.c.textContent = fmt(k.from + (k.to - k.from) * ease(t), k.dec);
    return t < 1;
  });
  this.actors.forEach(function (a) { a.tick(now, false); });
};
/* A beam starts at its actor's binoculars (or visor, or head) wherever the pose puts them and
   points at data-to; class "lock" stops the sweep on that line. */
Shot.prototype.aim = function () {
  if (!this.beams.length) return;
  var sr = this.el.getBoundingClientRect(), k = sr.width / 1920, self = this;
  if (!k) return;
  this.beams.forEach(function (bm) {
    var a = self.byId[bm.dataset.from];
    if (!a) return;
    var lens = a.g.querySelector('[data-j="h"] .prop') || a.g.querySelector('.visor') || a.g.querySelector('.hd');
    var r = lens.getBoundingClientRect();
    var ox = (r.left + r.width * (a.face > 0 ? .85 : .15) - sr.left) / k, oy = (r.top + r.height / 2 - sr.top) / k;
    var to = bm.dataset.to.split(',').map(Number), dx = to[0] - ox, dy = to[1] - oy;
    bm.style.left = ox.toFixed(1) + 'px'; bm.style.top = oy.toFixed(1) + 'px';
    bm.style.width = (Math.hypot(dx, dy) * 1.12).toFixed(0) + 'px';
    bm.style.setProperty('--lock', (Math.atan2(dy, dx) / R).toFixed(2) + 'deg');
  });
};
LS.Shot = Shot;

/* ================= templates & Infographic Show builders ================= */
function head(s) {
  if (!s.title && !s.kick && !s.sub) return '';
  return '<div class="head"' + (s.headW ? ' style="width:' + s.headW + 'px"' : '') + '>' +
    (s.kick ? '<div class="k" data-b="0">' + T(s.kick) + '</div>' : '') +
    (s.title ? '<h2 class="h-m fx-up" data-b="0">' + T(s.title) + '</h2>' : '') +
    (s.sub ? '<p class="p-m fx-up" data-b="0" data-d=".15">' + T(s.sub) + '</p>' : '') + '</div>';
}
function bannerHTML(bn) {
  if (!bn) return '';
  return '<div class="ig-banner tone-' + (bn.tone || 'c') + fx(bn, 'up') + '"' + bt(bn) + '>' +
    (bn.icon ? '<div class="ig-ban-ic">' + LS.ic(bn.icon) + '</div>' : '') +
    '<div class="ig-ban-body">' +
    (bn.k ? '<div class="ig-ban-k">' + T(bn.k) + '</div>' : '') +
    '<div class="ig-ban-t">' + T(bn.text) + '</div></div></div>';
}
var TPL = {};
TPL.scene = function () { return ''; };
TPL.title = function (s, ep) {
  return '<div class="tb" style="width:' + (s.w || 1160) + 'px' + (s.top ? ';top:' + s.top + 'px' : '') + '">' +
    (s.kick === false ? '' : '<div class="k" data-b="0">' + T(s.kick || ['Episode ' + ep.no + ' · ' + ep.title[0], 'ตอนที่ ' + ep.no + ' · ' + ep.title[1]]) + '</div>') +
    '<h1 class="h-xl fx-up" data-b="0" data-d=".15">' + T(s.title) + '</h1>' +
    (s.sub ? '<p class="p-l fx-up" data-b="' + (s.subB != null ? s.subB : 1) + '" data-d=".2">' + T(s.sub) + '</p>' : '') +
    (s.badge ? '<div class="hero-pill tone-' + (s.badgeTone || 'c') + ' fx-up" data-b="' + (s.badgeB != null ? s.badgeB : (s.sub ? 2 : 1)) + '">' + (s.badgeIcon ? LS.ic(s.badgeIcon) : '') + '<span>' + T(s.badge) + '</span></div>' : '') +
    '</div>';
};
TPL.statement = function (s) {
  var h = '<div class="center' + (s.mid ? ' mid' : '') + '"' + (s.box ? ' style="' + s.box + '"' : '') + '>';
  if (s.icon) h += '<div class="bigic tone-' + (s.tone || 'c') + ' fx-pop" data-b="0">' + LS.ic(s.icon) + '</div>';
  if (s.kick) h += '<div class="k" data-b="0">' + T(s.kick) + '</div>';
  h += '<h2 class="' + (s.size === 'xl' ? 'h-xl' : 'h-l') + ' fx-up" data-b="' + (s.textB || 0) + '" data-d=".1">' + T(s.text) + '</h2>';
  (s.lines || []).forEach(function (l, i) {
    var o = asObj(l);
    h += '<p class="' + (o.size === 'm' ? 'p-m' : 'p-l') + fx(o, 'up') + '" data-b="' + (o.b != null ? o.b : i + 1) + '"' + (o.out != null ? ' data-out="' + o.out + '"' : '') + '>' + T(o.text) + '</p>';
  });
  return h + '</div>';
};
TPL.stat = function (s) {
  var h = '<div class="center' + (s.mid ? ' mid' : '') + '"' + (s.box ? ' style="' + s.box + '"' : '') + '>' + (s.kick ? '<div class="k" data-b="0">' + T(s.kick) + '</div>' : '');
  h += '<div class="statnum tone-' + (s.tone || 'c') + ' fx-up" data-b="0">' + (s.pre || '') +
    (s.word != null ? T(s.word) : '<span class="count" data-to="' + s.value + '" data-from="' + (s.from || 0) + '" data-dur="' + (s.dur || 1.6) + '" data-dec="' + (s.dec || 0) + '">' + fmt(s.from || 0, s.dec) + '</span>') +
    (s.suf ? '<span class="suf">' + T(s.suf) + '</span>' : '') + '</div>';
  h += '<h2 class="h-m fx-up" data-b="0" data-d=".35">' + T(s.label) + '</h2>';
  if (s.scope) h += '<p class="stat-scope fx-up" data-b="0" data-d=".45">' + T(s.scope) + '</p>';
  (s.lines || []).forEach(function (l, i) { var o = asObj(l); h += '<p class="' + (o.size === 'm' ? 'p-m' : 'p-l') + ' fx-up" data-b="' + (o.b != null ? o.b : i + 1) + '"' + (o.out != null ? ' data-out="' + o.out + '"' : '') + '>' + T(o.text) + '</p>'; });
  return h + '</div>';
};
TPL.compare = function (s) {
  var h = head(s), b = (s.title || s.kick) ? 1 : 0;
  h += '<div class="cmp"' + (s.top ? ' style="top:' + s.top + 'px"' : '') + '>';
  [s.left, s.right].forEach(function (c, ci) {
    var tone = c.tone || (ci ? 'good' : 'bad'), mk = c.mark || (tone === 'good' ? 'check' : 'x');
    h += '<div class="col ' + tone + ' fx-up" data-b="' + b + '"><div class="col-h">' + (c.icon ? LS.ic(c.icon) : '') + '<h3 class="h-s">' + T(c.head) + '</h3></div>';
    c.rows.forEach(function (r, ri) {
      var rb = s.together ? b : b + 1 + ri;
      h += '<div class="row fx-left" data-b="' + rb + '"' + (s.together ? ' data-d="' + (0.15 * (ri + 1)).toFixed(2) + '"' : '') + '>' + LS.ic(mk, 'mk') + '<span>' + T(r) + '</span></div>';
    });
    b = s.together ? b + 1 : b + 1 + c.rows.length;
    h += '</div>';
  });
  return h + '</div>';
};
TPL.timeline = function (s) {
  var h = head(s), ay = s.axisY || 620, x0 = s.x0 || 240, x1 = s.x1 || 1680, n = s.marks.length;
  h += '<div class="tl-axis" data-b="0" style="top:' + (ay - 3) + 'px;left:' + (x0 - 80) + 'px;width:' + (x1 - x0 + 160) + 'px"></div>';
  s.marks.forEach(function (m, i) {
    var x = m.x != null ? m.x : (n > 1 ? x0 + (x1 - x0) * i / (n - 1) : (x0 + x1) / 2), up = m.pos ? m.pos === 'up' : (i % 2 === 0);
    h += '<div class="mk-t ' + (up ? 'up' : 'dn') + ' tone-' + (m.tone || 'c') + fx(m, 'up') + '" style="left:' + x.toFixed(0) + 'px;' + (up ? 'bottom:' + (1080 - ay - 14) + 'px' : 'top:' + (ay - 14) + 'px') +
      (m.w ? ';width:' + m.w + 'px;margin-left:' + (-m.w / 2) + 'px' : '') + '" data-b="' + (m.b != null ? m.b : i + 1) + '"><i></i><b>' + T(m.when) + '</b>' + (m.text ? '<span>' + T(m.text) + '</span>' : '') + '</div>';
  });
  return h;
};
TPL.loop = function (s) {
  var cx = s.cx || 1300, cy = s.cy || 560, r = s.r || 320, n = s.nodes.length;
  var h = '<div class="tb" style="width:' + (s.w || 600) + 'px;top:' + (s.top || 170) + 'px">' + (s.kick ? '<div class="k" data-b="0">' + T(s.kick) + '</div>' : '') +
    '<h2 class="h-l fx-up" data-b="0">' + T(s.title) + '</h2>' + (s.sub ? '<p class="p-m fx-up" data-b="0" data-d=".2">' + T(s.sub) + '</p>' : '') + '</div>';
  h += '<svg class="scene" viewBox="0 0 1920 1080" aria-hidden="true"><circle class="ring draw" pathLength="1" data-b="0" cx="' + cx + '" cy="' + cy + '" r="' + r + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/></svg>';
  s.nodes.forEach(function (nd, i) {
    var a = (-90 + 360 * i / n) * R, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    h += '<div class="node fx-pop" data-b="' + (nd.b != null ? nd.b : i + 1) + '" style="left:' + x.toFixed(0) + 'px;top:' + y.toFixed(0) + 'px"><div class="node-ic tone-' + (nd.tone || 'c') + '">' + LS.ic(nd.icon) + '</div><b>' + T(nd.label) + '</b>' + (nd.text ? '<span>' + T(nd.text) + '</span>' : '') + '</div>';
  });
  if (s.center) h += '<div class="ring-c fx-up" data-b="' + (s.centerB != null ? s.centerB : n + 1) + '" style="left:' + (cx - 170) + 'px;top:' + (cy - 100) + 'px">' + T(s.center) + '</div>';
  return h;
};
TPL.cards = function (s) {
  var n = s.cards.length, cols = s.cols || (n <= 4 ? n : Math.ceil(n / 2)), h = head(s);
  h += '<div class="cards" style="--cols:' + cols + ';top:' + (s.top || (s.sub ? 330 : 260)) + 'px' + (s.bottom != null ? ';bottom:' + s.bottom + 'px' : '') + '">';
  s.cards.forEach(function (c, i) {
    var b = c.b != null ? c.b : (s.together ? 1 : i + 1);
    h += '<div class="card tone-' + (c.tone || 'c') + ' fx-up" data-b="' + b + '"' + (s.together ? ' data-d="' + (i * 0.12).toFixed(2) + '"' : '') + '>' +
      '<div class="card-top">' + (c.icon ? LS.ic(c.icon) : '') + (c.stat ? '<span class="card-stat">' + T(c.stat) + '</span>' : '') + '</div>' +
      '<h3>' + T(c.h) + '</h3>' + (c.p ? '<p>' + T(c.p) + '</p>' : '') + '</div>';
  });
  return h + '</div>' + bannerHTML(s.banner);
};
TPL.shot = function (s) {
  var side = s.side || 'right', w = s.w || 960, ix = side === 'right' ? 1920 - 120 - w : 120, tw = s.tw || (1920 - 240 - w - 80);
  var h = '<div class="tb" style="width:' + tw + 'px;left:' + (side === 'right' ? 120 : 120 + w + 80) + 'px;top:' + (s.top || 140) + 'px">' + (s.kick ? '<div class="k" data-b="0">' + T(s.kick) + '</div>' : '') +
    '<h2 class="h-m fx-up" data-b="0">' + T(s.title) + '</h2>';
  (s.points || []).forEach(function (p, i) { var o = asObj(p); h += '<p class="p-m bul fx-up" data-b="' + (o.b != null ? o.b : i + 1) + '">' + T(o.text) + '</p>'; });
  h += '</div><div class="shotimg fx-up" data-b="0" data-d=".2" style="left:' + ix + 'px;top:' + (s.imgTop || 140) + 'px;width:' + w + 'px"><div class="bar"><i></i><i></i><i></i>' + (s.caption ? '<span class="bar-cap">' + T(s.caption) + '</span>' : '') + '</div><img src="img/product/' + s.img + '.webp" alt="">';
  (s.dots || []).forEach(function (d, i) { h += '<span class="dot fx-pop" data-b="' + d.b + '" style="left:' + d.x + '%;top:' + d.y + '%">' + (d.n || i + 1) + '</span>'; });
  return h + '</div>' + bannerHTML(s.banner);
};
TPL.verdict = function (s, ep) {
  var h = '<div class="center"' + (s.box ? ' style="' + s.box + '"' : '') + '><div class="k" data-b="0">' + T(s.kick || ['Remember', 'ประเด็นสำคัญ']) + '</div><h2 class="h-l fx-up" data-b="0" data-d=".1">' + T(s.title) + '</h2><div class="vlist">';
  s.points.forEach(function (p, i) { h += '<div class="vrow fx-left" data-b="' + (i + 1) + '"><span class="vnum">' + (i + 1) + '</span><p class="p-l">' + T(p) + '</p></div>'; });
  h += '</div>';
  var nx = LS.eps[ep.no + 1], nb = s.points.length + 1;
  h += nx ? '<a class="nextbtn fx-up" data-b="' + nb + '" href="#ep' + nx.no + '">' + T(['Next · EP' + nx.no + ' ' + nx.title[0], 'ตอนต่อไป · EP' + nx.no + ' ' + nx.title[1]]) + LS.ic('arrowR') + '</a>'
          : '<a class="nextbtn fx-up" data-b="' + nb + '" href="#hub">' + T(['All episodes', 'ดูครบทุกตอน']) + LS.ic('grid') + '</a>';
  return h + '</div>';
};

/* Infographic Show Builder 1: LS.diagram (SVG zones & connectors + HTML beat-timed node cards).
   All readable text sits outside <svg> so beatDur() measures English & Thai reading time accurately. */
function trimBoxPt(cx, cy, w, h, tx, ty, pad) {
  var dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  var hw = w / 2 + (pad || 14), hh = h / 2 + (pad || 14);
  var sx = Math.abs(dx) ? hw / Math.abs(dx) : 1e9;
  var sy = Math.abs(dy) ? hh / Math.abs(dy) : 1e9;
  var k = Math.min(sx, sy);
  return [cx + dx * k, cy + dy * k];
}
TPL.diagram = function (s) {
  var h = head(s), svg = '', html = '', map = {};
  (s.zones || []).forEach(function (z) {
    var zb = z.b != null ? z.b : 0;
    svg += '<rect class="dg-zone tone-' + (z.tone || 'c') + (z.dashed ? ' dashed' : '') + '" data-b="' + zb + '" x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" rx="24"/>';
    if (z.label) {
      html += '<div class="dg-zone-lbl tone-' + (z.tone || 'c') + ' fx-up" data-b="' + zb + '" style="left:' + (z.x + 28) + 'px;top:' + (z.y + 18) + 'px">' +
        (z.icon ? LS.ic(z.icon) : '') + '<span>' + T(z.label) + '</span></div>';
    }
  });
  (s.nodes || []).forEach(function (nd, i) {
    var nw = nd.w || 360, nh = typeof nd.boxH === 'number' ? nd.boxH : (typeof nd.h === 'number' ? nd.h : 240);
    map[nd.id || ('n' + i)] = { x: nd.x, y: nd.y, w: nw, h: nh };
  });
  (s.edges || []).forEach(function (ed) {
    var a = map[ed.from], b = map[ed.to];
    if (!a || !b) return;
    var p1 = ed.x1 != null ? [ed.x1, ed.y1] : trimBoxPt(a.x, a.y, a.w, a.h, b.x, b.y, 12);
    var p2 = ed.x2 != null ? [ed.x2, ed.y2] : trimBoxPt(b.x, b.y, b.w, b.h, a.x, a.y, 16);
    var eb = ed.b != null ? ed.b : 1, tone = ed.tone || 'c';
    svg += LS.arrow({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], bend: ed.bend || 0, tone: tone, b: eb, out: ed.out });
    if (ed.flow) {
      var dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy) || 1, c = ed.bend || 0;
      var qx = (p1[0] + p2[0]) / 2 - dy / len * c, qy = (p1[1] + p2[1]) / 2 + dx / len * c;
      svg += LS.flow({ d: 'M' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' Q' + qx.toFixed(1) + ',' + qy.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1), tone: tone, b: eb, out: ed.out, dur: ed.dur || 2.4 });
    }
    var mx = ed.lx != null ? ed.lx : (p1[0] + p2[0]) / 2, my = ed.ly != null ? ed.ly : (p1[1] + p2[1]) / 2 - (ed.bend ? ed.bend * 0.45 : 0);
    if (ed.blocked) {
      svg += '<g class="dg-block fx-pop" data-b="' + (ed.blockB != null ? ed.blockB : eb) + '"' + (ed.out != null ? ' data-out="' + ed.out + '"' : '') + '>' +
        '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="26"/>' +
        '<path d="M' + (mx - 11).toFixed(1) + ',' + (my - 11).toFixed(1) + ' L' + (mx + 11).toFixed(1) + ',' + (my + 11).toFixed(1) + ' M' + (mx + 11).toFixed(1) + ',' + (my - 11).toFixed(1) + ' L' + (mx - 11).toFixed(1) + ',' + (my + 11).toFixed(1) + '"/></g>';
    }
    if (ed.label) {
      var lby = ed.labelY != null ? ed.labelY : (ed.blocked ? my - 64 : my - 22);
      html += '<div class="dg-edge-lbl tone-' + tone + ' fx-pop" data-b="' + eb + '"' + (ed.out != null ? ' data-out="' + ed.out + '"' : '') +
        ' style="left:' + mx.toFixed(0) + 'px;top:' + lby.toFixed(0) + 'px">' + T(ed.label) + '</div>';
    }
  });
  (s.nodes || []).forEach(function (nd, i) {
    var nw = nd.w || 360, nh = typeof nd.boxH === 'number' ? nd.boxH : (typeof nd.h === 'number' ? nd.h : 240), nb = nd.b != null ? nd.b : (i + 1);
    var left = Math.round(nd.x - nw / 2), top = Math.round(nd.y - nh / 2);
    html += '<div class="dg-node tone-' + (nd.tone || 'c') + fx(nd, 'up') + '" data-b="' + nb + '"' + (nd.out != null ? ' data-out="' + nd.out + '"' : '') +
      ' style="left:' + left + 'px;top:' + top + 'px;width:' + nw + 'px' + (nd.minH ? ';min-height:' + nd.minH + 'px' : '') + '">' +
      '<div class="dg-nd-top">' + (nd.icon ? '<span class="dg-ic">' + LS.ic(nd.icon) + '</span>' : '') +
      (nd.stat ? '<span class="dg-stat">' + T(nd.stat) + '</span>' : (nd.k ? '<span class="dg-k">' + T(nd.k) + '</span>' : '')) + '</div>' +
      '<h3>' + T(nd.h || nd.title) + '</h3>' +
      ((nd.p || nd.text) ? '<p>' + T(nd.p || nd.text) + '</p>' : '') + '</div>';
  });
  return h + (svg ? '<svg class="scene dg-svg" viewBox="0 0 1920 1080" aria-hidden="true">' + svg + '</svg>' : '') + html + bannerHTML(s.banner);
};

/* Infographic Show Builder 2: LS.comparison (Arena Versus or Metric Scale Bars). */
TPL.comparison = function (s) {
  var h = head(s);
  if (s.variant === 'bars') {
    h += '<div class="ig-bars" style="top:' + (s.top || (s.sub ? 300 : 250)) + 'px">';
    (s.bars || []).forEach(function (br, i) {
      var b = br.b != null ? br.b : (i + 1), tone = br.tone || 'c';
      h += '<div class="ig-bar-row tone-' + tone + ' fx-up" data-b="' + b + '">' +
        '<div class="ig-bar-meta"><div class="ig-bar-title">' + (br.icon ? LS.ic(br.icon) : '') + '<b>' + T(br.label) + '</b></div>' +
        '<span class="ig-bar-val">' + T(br.value) + '</span></div>' +
        '<div class="ig-bar-track"><div class="ig-bar-fill" style="--pct:' + Math.max(3, Math.min(100, br.pct || 50)) + '%"></div></div>' +
        (br.note ? '<div class="ig-bar-note">' + T(br.note) + '</div>' : '') + '</div>';
    });
    return h + '</div>' + bannerHTML(s.banner);
  }
  var topY = s.top || (s.sub ? 290 : 240);
  h += '<div class="ig-arena" style="top:' + topY + 'px">';
  [s.left, s.right].forEach(function (side, idx) {
    var tone = side.tone || (idx === 0 ? 'r' : 'c');
    var mk = side.mark || (idx === 0 ? 'x' : 'check');
    var sb = side.b != null ? side.b : (idx + 1);
    h += '<div class="ig-side tone-' + tone + ' fx-up" data-b="' + sb + '">' +
      '<div class="ig-side-hd">' +
      '<div class="ig-side-title">' + (side.icon ? LS.ic(side.icon) : '') + '<div>' +
      (side.k ? '<div class="ig-side-k">' + T(side.k) + '</div>' : '') +
      '<h3>' + T(side.head) + '</h3></div></div>' +
      (side.metric ? '<div class="ig-side-metric"><b>' + T(side.metric) + '</b>' + (side.unit ? '<span>' + T(side.unit) + '</span>' : '') + '</div>' : '') +
      '</div><div class="ig-side-rows">';
    (side.rows || []).forEach(function (r, ri) {
      var o = asObj(r), rb = o.b != null ? o.b : (s.together ? sb : sb + (ri > 0 ? 0 : 0));
      h += '<div class="ig-side-row"' + (o.b != null ? ' data-b="' + rb + '"' : '') + '>' + LS.ic(o.icon || mk, 'mk') + '<span>' + T(o.text) + '</span></div>';
    });
    h += '</div></div>';
    if (idx === 0) h += '<div class="ig-vs fx-pop" data-b="' + (s.vsB != null ? s.vsB : 1) + '">VS</div>';
  });
  return h + '</div>' + bannerHTML(s.banner);
};

/* Infographic Show Builder 3: LS.eventTimeline (Stamped Incident / Breach-Clock Sequence). */
TPL.eventTimeline = function (s) {
  var evs = s.events || [], n = Math.max(1, evs.length), h = head(s);
  var railY = s.railY || (s.sub ? 336 : 292), cardTop = railY + 46;
  var padX = 120, usableW = 1920 - padX * 2, gap = 24, colW = (usableW - gap * (n - 1)) / n;
  var svg = '<line class="ev-rail" x1="' + (padX + colW / 2).toFixed(1) + '" y1="' + railY + '" x2="' + (1920 - padX - colW / 2).toFixed(1) + '" y2="' + railY + '"/>';
  evs.forEach(function (ev, i) {
    var cx = padX + colW * i + gap * i + colW / 2, b = ev.b != null ? ev.b : (i + 1), tone = ev.tone || 'c';
    if (i > 0) {
      var px = padX + colW * (i - 1) + gap * (i - 1) + colW / 2;
      svg += '<line class="ev-seg tone-' + tone + ' draw" pathLength="1" data-b="' + b + '" x1="' + px.toFixed(1) + '" y1="' + railY + '" x2="' + cx.toFixed(1) + '" y2="' + railY + '"/>';
    }
    svg += '<circle class="ev-dot tone-' + tone + ' fx-pop" data-b="' + b + '" cx="' + cx.toFixed(1) + '" cy="' + railY + '" r="15"/>';
  });
  h += '<svg class="scene ev-svg" viewBox="0 0 1920 1080" aria-hidden="true">' + svg + '</svg>';
  h += '<div class="ev-grid" style="--ev-cols:' + n + ';top:' + cardTop + 'px">';
  evs.forEach(function (ev, i) {
    var b = ev.b != null ? ev.b : (i + 1), tone = ev.tone || 'c';
    h += '<div class="ev-card tone-' + tone + ' fx-up" data-b="' + b + '">' +
      '<div class="ev-card-top"><span class="ev-time">' + T(ev.time) + '</span>' +
      (ev.icon ? '<span class="ev-ic">' + LS.ic(ev.icon) + '</span>' : '') + '</div>' +
      (ev.badge ? '<div class="ev-badge">' + T(ev.badge) + '</div>' : '') +
      '<h3>' + T(ev.title) + '</h3>' +
      (ev.text ? '<p>' + T(ev.text) + '</p>' : '') + '</div>';
  });
  return h + '</div>' + bannerHTML(s.banner);
};

LS.TPL = TPL;
LS.diagram = TPL.diagram;
LS.comparison = TPL.comparison;
LS.eventTimeline = TPL.eventTimeline;

function common(s) {
  var h = '';
  if (s.bg) {
    h += '<img class="bg" src="img/bg/' + s.bg + '.webp" alt="" style="--bgo:' + (s.bgo != null ? s.bgo : .85) + '">';
  }
  if (s.flow) {
    h += '<video class="bg-vid" muted loop playsinline preload="none" aria-hidden="true" data-src="img/flow/' + s.flow + '.mp4" style="--bgo:' + (s.bgo != null ? s.bgo : .84) + '"></video>';
  }
  if ((s.bg || s.flow) && s.shade !== 'none') {
    h += '<div class="shade' + (s.shade ? ' ' + s.shade : '') + '"></div>';
  }
  if (s.svg) h += '<svg class="scene" viewBox="0 0 1920 1080" aria-hidden="true">' + s.svg + '</svg>';
  (s.beams || []).forEach(function (b) { h += '<div class="beam tone-' + (b.tone || 'c') + '" data-from="' + b.from + '" data-to="' + b.to.join(',') + '"' + bt(b) + '></div>'; });
  return h;
}
function overlays(s) {
  var h = '';
  (s.labs || []).forEach(function (l) {
    h += '<div class="lab tone-' + (l.tone || 'a') + (l.c ? ' c' : '') + fx(l, 'pop') + '" style="' + (l.r != null ? 'right:' + l.r + 'px' : 'left:' + l.x + 'px') + ';top:' + l.y + 'px' + (l.size ? ';font-size:' + l.size + 'px' : '') + '"' + bt(l) + '>' + T(l.text) + '</div>';
  });
  (s.says || []).forEach(function (q) {
    h += '<div class="say tail-' + (q.tail || 'bl') + (q.tone ? ' tone-' + q.tone : '') + (q.c ? ' c' : '') + fx(q, 'pop') + '" style="' + (q.r != null ? 'right:' + q.r + 'px' : 'left:' + q.x + 'px') + ';top:' + q.y + 'px;max-width:' + (q.w || 560) + 'px"' + bt(q) + '>' + T(q.text) + '</div>';
  });
  (s.caps || []).forEach(function (c) {
    h += '<div class="capbox' + (c.pos ? ' ' + c.pos : '') + (c.tone ? ' tone-' + c.tone : '') + fx(c, 'up') + '"' + (c.w ? ' style="max-width:' + c.w + 'px"' : '') + bt(c) + '>' +
      (c.k ? '<div class="k">' + T(c.k) + '</div>' : '') + (c.h ? '<div class="h-m">' + T(c.h) + '</div>' : '') + (c.p ? '<div class="p-m">' + T(c.p) + '</div>' : '') + '</div>';
  });
  if (s.html) h += s.html;
  if (s.note) { var o = asObj(s.note); h += '<div class="note"' + bt(o) + '>' + T(o.text) + '</div>'; }
  return h;
}
function slideHTML(s, ep, k) {
  var tpl = s.tpl || 'scene';
  return '<section class="slide tpl-' + tpl + (s.cls ? ' ' + s.cls : '') + '" data-i="' + k + '"' + (s.t ? ' data-t="' + s.t.join(' ') + '"' : '') + '>' +
    common(s) + TPL[tpl](s, ep, k) + overlays(s) + (s.brand === false ? '' : '<div class="brand">LIGHT OPS STORIES · EP' + ep.no + '</div>') + '</section>';
}

/* ================= hub ================= */
LS.hub = {
  kick: ['Light\u00A0Ops · Animated Infographic Series', 'Light\u00A0Ops · ซีรีส์อินโฟกราฟิกแอนิเมชันสำหรับผู้บริหาร'],
  title: ['Cyber attacks now run at AI speed. Your defence must stay on a leash.', 'เมื่อภัยไซเบอร์บุกด้วยความเร็วระดับ\u2060\u00A0AI ระบบป้องกันของคุณต้องทั้งทันเกมและมีสายจูงควบคุม'],
  sub: ['Seven visual episodes on the 2025 to 2026 AI threat wave, and how Light\u00A0Ops protects and runs your servers inside Thailand with human-approved AI.', '7 ตอนสั้นเข้าใจง่าย: เจาะลึกคลื่นภัยไซเบอร์ยุค\u2060\u00A0AI ปี 2025 ถึง 2026 และวิธีที่ Light\u00A0Ops ดูแลระบบของคุณในประเทศไทยด้วย\u2060\u00A0AI ที่รอคำสั่งอนุมัติจากคุณเสมอ']
};
function hubHTML() {
  var h = '<section class="slide hub plain active"><img class="bg" src="img/bg/flow-cyber-storm.webp" alt="" style="--bgo:.72"><div class="shade top"></div><div class="brand">LIGHT OPS STORIES</div>' +
    '<div class="tb hub-tb"><div class="k">' + T(LS.hub.kick) + '</div><h1 class="h-l">' + T(LS.hub.title) + '</h1><p class="p-m">' + T(LS.hub.sub) + '</p></div><div class="tiles">';
  LS.list.forEach(function (e) {
    h += '<a class="tile" href="#ep' + e.no + '"><span class="no">EP' + e.no + '</span><h3>' + T(e.title) + '</h3><p>' + T(e.blurb) + '</p></a>';
  });
  h += '<a class="tile start" href="#ep' + (LS.list[0] ? LS.list[0].no : 1) + '"><span class="no">' + LS.ic('play') + '</span><h3>' +
    T(['Start Episode 1', 'เริ่มดูตั้งแต่ตอนที่ 1']) + '</h3><p>' +
    T(['Watch plays continuously. Switch to Present below to step 1 beat per click.', 'โหมดดูต่อเนื่องเล่นเองอัตโนมัติ หรือสลับเป็นโหมดบรรยายด้านล่างเพื่อคลิกทีละจังหวะ']) + '</p></a>';
  return h + '</div></section>';
}

/* ================= playback controller, routing, HUD ================= */
var st = { mode: 'watch', playing: false, pausedByUser: false, ep: null, i: 0, shots: [], nextAt: Infinity };
var stage, vp, hudEl, progEl, scrubEl, idleT = 0;
function now() { return performance.now() / 1000; }
function isTh() { return HTML.classList.contains('th'); }

function readOptions() {
  var search = location.search || '';
  var lq = /[?&]lang=(th|en)\b/.exec(search);
  var mq = /[?&]mode=(watch|present)\b/.exec(search);
  var savedLang = null, savedMode = null;
  try {
    savedLang = localStorage.getItem('ls-lang');
    savedMode = localStorage.getItem('ls-mode');
  } catch (e) { /* storage unavailable */ }
  return {
    th: lq ? lq[1] === 'th' : savedLang === 'th',
    mode: mq ? mq[1] : (savedMode === 'present' ? 'present' : 'watch')
  };
}

function syncUrl(hashOverride) {
  if (SHEET) return;
  try {
    var u = new URL(location.href);
    u.searchParams.set('mode', st.mode);
    u.searchParams.set('lang', isTh() ? 'th' : 'en');
    if (hashOverride != null) u.hash = hashOverride;
    else if (st.ep) u.hash = '#ep' + st.ep.no + (st.i ? '-' + (st.i + 1) : '');
    try {
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e1) {
      if (u.hash && location.hash !== u.hash) history.replaceState(null, '', u.hash);
    }
  } catch (e) { /* file:// or opaque origin may refuse replaceState */ }
}

function setHash() {
  if (!st.ep) return;
  syncUrl('#ep' + st.ep.no + (st.i ? '-' + (st.i + 1) : ''));
}

/* Text an element shows in the current language, without its own nested beats. Works without
   layout, so a detached deck (LS.runtime, tests) times beats exactly as the live page does. */
function ownText(el) {
  var c = el.cloneNode(true), other = isTh() ? 'en' : 'th';
  [].slice.call(c.querySelectorAll('[data-b], .L[lang="' + other + '"]')).forEach(function (n) { n.parentNode.removeChild(n); });
  return (c.textContent || '').replace(/\s+/g, ' ').trim();
}
/* How long a beat stays before the next one plays in Watch mode: authored t[], else reading time. */
function beatDur(sh) {
  var b = Math.max(0, sh.beat);
  if (sh.times[b] != null) return sh.times[b];
  var chars = 0;
  sh.items.forEach(function (el) { if (+el.dataset.b === b && !(el.closest && el.closest('svg'))) chars += ownText(el).length; });
  var d = 1.15 + chars / (isTh() ? 17 : 19);
  if (sh.actors.some(function (a) { return a.acts.some(function (c) { return c.b === b && c.c !== 'loop'; }); })) d = Math.max(d, 2.1);
  return Math.max(1.75, Math.min(6.4, d));
}

function fit() {
  if (!stage) return;
  var w = window.innerWidth, h = window.innerHeight, s = Math.min(w / 1920, h / 1080);
  stage.style.transform = 'translate(' + ((w - 1920 * s) / 2).toFixed(1) + 'px,' + ((h - 1080 * s) / 2).toFixed(1) + 'px) scale(' + s + ')';
}
function flush(sh) { void sh.el.offsetWidth; requestAnimationFrame(function () { requestAnimationFrame(function () { sh.el.classList.remove('nt'); }); }); }

/* Poster-first Watch-only Flow loop controller: mounts and plays <video> only on the active shot
   when mode === 'watch' and motion is enabled; pauses/hides cleanly everywhere else. */
function syncMedia() {
  if (!stage) return;
  var activeSlide = (st.ep && st.shots[st.i]) ? st.shots[st.i].el : null;
  var allowVideo = !!(st.ep && st.mode === 'watch' && !REDUCE && !STILL && !SHEET);
  [].forEach.call(stage.querySelectorAll('video.bg-vid'), function (vid) {
    var onActive = allowVideo && vid.closest('.slide') === activeSlide;
    if (!onActive) {
      try { if (typeof vid.pause === 'function') vid.pause(); } catch (e) { /* ignore */ }
      vid.classList.remove('live');
      return;
    }
    if (!vid.getAttribute('src') && vid.dataset.src) {
      vid.setAttribute('src', vid.dataset.src);
      vid.addEventListener('playing', function () { vid.classList.add('live'); });
      vid.addEventListener('loadeddata', function () { if (st.mode === 'watch') vid.classList.add('live'); });
    }
    if (st.playing) {
      try {
        var pr = typeof vid.play === 'function' ? vid.play() : null;
        if (pr && typeof pr.then === 'function') {
          pr.then(function () { vid.classList.add('live'); }, function () { vid.classList.remove('live'); });
        }
      } catch (e) {
        vid.classList.remove('live');
      }
    } else {
      try { if (typeof vid.pause === 'function') vid.pause(); } catch (e) { /* ignore */ }
    }
  });
}

function setLang(th, save) {
  HTML.classList.toggle('th', !!th);
  HTML.setAttribute('lang', th ? 'th' : 'en');
  if (save) { try { localStorage.setItem('ls-lang', th ? 'th' : 'en'); } catch (e) { /* storage unavailable */ } }
  var b = document.getElementById('hudLang');
  if (b) b.textContent = th ? 'EN' : 'ไทย';
  if (st.ep && st.mode === 'watch' && st.playing && st.shots[st.i]) {
    st.nextAt = now() + beatDur(st.shots[st.i]);
  }
  syncUrl();
  hud();
}

function applyModeClasses() {
  HTML.dataset.mode = st.mode;
  if (document.body) {
    document.body.classList.toggle('mode-present', st.mode === 'present');
    document.body.classList.toggle('mode-watch', st.mode === 'watch');
  }
}

function setMode(mode, save) {
  var nextMode = mode === 'present' ? 'present' : 'watch';
  st.mode = nextMode;
  applyModeClasses();
  if (save) { try { localStorage.setItem('ls-mode', nextMode); } catch (e) { /* storage unavailable */ } }
  if (nextMode === 'present') {
    st.playing = false;
    st.pausedByUser = false;
    st.nextAt = Infinity;
  } else {
    st.pausedByUser = false;
    if (st.ep && !STILL) {
      st.playing = true;
      var sh = st.shots[st.i];
      st.nextAt = now() + (sh ? beatDur(sh) : 2);
    } else {
      st.playing = false;
      st.nextAt = Infinity;
    }
  }
  syncUrl();
  syncMedia();
  hud();
  return st.mode;
}

function setPlaying(on) {
  if (st.mode !== 'watch' || !st.ep) {
    st.playing = false;
    st.nextAt = Infinity;
    syncMedia();
    hud();
    return false;
  }
  st.playing = !!on;
  st.pausedByUser = !st.playing;
  if (st.playing) {
    var sh = st.shots[st.i];
    st.nextAt = now() + (sh ? beatDur(sh) : 2);
  } else {
    st.nextAt = Infinity;
  }
  syncMedia();
  hud();
  return st.playing;
}

function togglePlay() {
  if (st.mode !== 'watch' || !st.ep) return false;
  return setPlaying(!st.playing);
}

/* Unified cursor owner for shot & beat transitions (both forward and backward). */
function seekBeat(shotIdx, beatIdx, animate) {
  if (!st.ep || !st.shots.length) return;
  var t = now();
  var si = Math.max(0, Math.min(shotIdx, st.shots.length - 1));
  var sh = st.shots[si];
  var target = Math.max(0, Math.min(beatIdx != null ? beatIdx : 0, sh.n - 1));
  var old = st.shots[st.i];
  var sameShot = (si === st.i && sh.el.classList.contains('active'));

  if (!sameShot) {
    if (old && old !== sh) old.el.classList.remove('active');
    st.i = si;
    sh.el.classList.add('nt');
    sh.reset();
    sh.el.classList.add('active');
    if (animate && !REDUCE && target === 0) {
      void sh.el.offsetWidth;
      sh.el.classList.remove('nt');
      sh.go(0, false, t);
    } else {
      sh.go(target, true, t);
      sh.settle(t);
      flush(sh);
    }
  } else if (target > sh.beat) {
    if (animate && !REDUCE && target === sh.beat + 1) {
      sh.go(target, false, t);
    } else {
      sh.el.classList.add('nt');
      sh.go(target, true, t);
      sh.settle(t);
      flush(sh);
    }
  } else if (target < sh.beat) {
    sh.el.classList.add('nt');
    sh.reset();
    sh.go(target, true, t);
    sh.settle(t);
    flush(sh);
  }

  sh.aim();
  st.nextAt = (st.mode === 'watch' && st.playing) ? (t + beatDur(sh)) : Infinity;
  syncMedia();
  hud();
  setHash();
}

function show(i, mode) {
  if (!st.ep || !st.shots.length) return;
  var si = Math.max(0, Math.min(i, st.shots.length - 1));
  var sh = st.shots[si];
  if (mode === 'end') seekBeat(si, sh.n - 1, false);
  else seekBeat(si, 0, true);
}

function step(sh, t) {
  if (REDUCE) { sh.el.classList.add('nt'); sh.go(sh.beat + 1, true, t); sh.settle(t); flush(sh); }
  else sh.go(sh.beat + 1, false, t);
  st.nextAt = (st.mode === 'watch' && st.playing) ? (t + beatDur(sh)) : Infinity;
  hud();
}

function advanceEpisodeOrHub(fromAuto) {
  if (!st.ep) return;
  var nx = LS.eps[st.ep.no + 1];
  if (!nx) {
    st.playing = false;
    st.nextAt = Infinity;
  } else if (fromAuto && st.mode === 'watch' && !STILL) {
    st.playing = true;
  }
  location.hash = nx ? '#ep' + nx.no : '#hub';
}

function totalBeats() { var n = 0; st.shots.forEach(function (s) { n += s.n; }); return n; }
function currentGlobalBeat() {
  if (!st.ep || !st.shots.length) return 0;
  var idx = 0;
  for (var k = 0; k < st.i; k++) idx += st.shots[k].n;
  return idx + Math.max(0, st.shots[st.i].beat);
}
function scrubTo(globalIdx) {
  if (!st.ep || !st.shots.length) return;
  var maxIdx = Math.max(0, totalBeats() - 1);
  var rem = Math.max(0, Math.min(maxIdx, Math.round(+globalIdx || 0)));
  var si = 0;
  while (si < st.shots.length - 1 && rem >= st.shots[si].n) {
    rem -= st.shots[si].n;
    si++;
  }
  seekBeat(si, rem, false);
}

function dispatchPlayback(action, arg) {
  if (action === 'hub') { location.hash = '#hub'; return; }
  if (!st.ep || !st.shots.length) return;
  var sh = st.shots[st.i];
  if (action === 'stepNext') {
    if (sh.beat < sh.n - 1) seekBeat(st.i, sh.beat + 1, true);
    else if (st.i < st.shots.length - 1) seekBeat(st.i + 1, 0, true);
    else advanceEpisodeOrHub(false);
  } else if (action === 'stepPrev') {
    if (sh.beat > 0) seekBeat(st.i, sh.beat - 1, false);
    else if (st.i > 0) seekBeat(st.i - 1, st.shots[st.i - 1].n - 1, false);
    else seekBeat(0, 0, false);
  } else if (action === 'shotNext') {
    if (st.i < st.shots.length - 1) seekBeat(st.i + 1, 0, true);
    else advanceEpisodeOrHub(false);
  } else if (action === 'shotPrev') {
    if (st.i > 0) seekBeat(st.i - 1, 0, false);
    else seekBeat(0, 0, false);
  } else if (action === 'scrub') {
    scrubTo(arg);
  } else if (action === 'home') {
    seekBeat(0, 0, false);
  } else if (action === 'end') {
    var last = st.shots.length - 1;
    seekBeat(last, st.shots[last].n - 1, false);
  }
}

function openEp(no, i) {
  var ep = LS.eps[no];
  if (!ep) { openHub(); return; }
  if (st.ep !== ep) {
    stage.innerHTML = ep.shots.map(function (s, k) { return slideHTML(s, ep, k); }).join('');
    st.ep = ep; st.i = 0;
    st.shots = [].map.call(stage.querySelectorAll('.slide'), function (el) { return new Shot(el); });
    if (REDUCE) stage.querySelectorAll('svg').forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });
  }
  document.body.classList.remove('at-hub');
  if (st.mode === 'watch' && !STILL && !st.pausedByUser) st.playing = true;
  if (st.mode === 'present') { st.playing = false; st.nextAt = Infinity; }
  show(Math.max(0, Math.min(i, st.shots.length - 1)), 'start');
}

function openHub() {
  syncMedia();
  st.ep = null; st.shots = []; st.playing = false; st.pausedByUser = false; st.nextAt = Infinity;
  stage.innerHTML = hubHTML();
  document.body.classList.add('at-hub');
  syncUrl('#hub');
  hud();
}

function route() {
  var m = /^#ep(\d+)(?:-(\d+))?$/.exec(location.hash);
  if (m && LS.eps[+m[1]]) openEp(+m[1], m[2] ? +m[2] - 1 : 0); else openHub();
}

function prog() {
  if (!progEl || !st.ep || !st.shots.length) return;
  var tot = Math.max(1, totalBeats());
  var cur = currentGlobalBeat();
  progEl.style.width = (100 * (cur + 1) / tot).toFixed(2) + '%';
  if (scrubEl) {
    scrubEl.max = String(Math.max(0, tot - 1));
    scrubEl.value = String(cur);
  }
}

function hud() {
  if (!hudEl) return;
  var t = document.getElementById('hudT'), n = document.getElementById('hudN'), p = document.getElementById('hudPlay');
  var mw = document.getElementById('hudModeWatch'), mp = document.getElementById('hudModePresent');
  var th = isTh();
  if (mw) {
    mw.classList.toggle('on', st.mode === 'watch');
    mw.setAttribute('aria-pressed', String(st.mode === 'watch'));
    mw.textContent = th ? 'ดูต่อเนื่อง' : 'Watch';
  }
  if (mp) {
    mp.classList.toggle('on', st.mode === 'present');
    mp.setAttribute('aria-pressed', String(st.mode === 'present'));
    mp.textContent = th ? 'บรรยาย' : 'Present';
  }
  if (st.ep && st.shots[st.i]) {
    var sh = st.shots[st.i];
    t.innerHTML = 'EP' + st.ep.no + ' · ' + T(st.ep.title);
    if (st.mode === 'present') {
      n.textContent = (th ? 'ฉาก ' : 'Shot ') + (st.i + 1) + '/' + st.shots.length + ' · ' +
        (th ? 'จังหวะ ' : 'Beat ') + (Math.max(0, sh.beat) + 1) + '/' + sh.n;
    } else {
      n.textContent = (st.i + 1) + ' / ' + st.shots.length;
    }
  } else {
    t.innerHTML = 'Light\u00A0Ops Stories';
    n.textContent = '';
  }
  if (p) {
    p.innerHTML = LS.ic(st.playing ? 'pause' : 'play');
    p.setAttribute('aria-label', st.playing ? 'Pause' : 'Play');
  }
  prog();
}

function fullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (HTML.requestFullscreen) { var r = HTML.requestFullscreen(); if (r && r.catch) r.catch(function () {}); }
  } catch (e) { /* fullscreen unavailable */ }
}
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleT);
  idleT = setTimeout(function () { if (st.ep && st.mode === 'watch' && st.playing) document.body.classList.add('idle'); }, 3000);
}
function loop(ms) {
  var t = ms / 1000;
  if (st.ep) {
    var sh = st.shots[st.i];
    if (sh) { if (!REDUCE) sh.tick(t); sh.aim(); }
    if (sh && st.mode === 'watch' && st.playing && t >= st.nextAt) {
      if (sh.beat < sh.n - 1) step(sh, t);
      else if (st.i < st.shots.length - 1) seekBeat(st.i + 1, 0, true);
      else advanceEpisodeOrHub(true);
    }
  }
  requestAnimationFrame(loop);
}
function buildHud() {
  progEl = document.createElement('div'); progEl.id = 'prog'; progEl.innerHTML = '<i></i>'; document.body.appendChild(progEl); progEl = progEl.firstChild;
  hudEl = document.createElement('nav'); hudEl.className = 'hud'; hudEl.setAttribute('aria-label', 'Presentation controls');
  hudEl.innerHTML =
    '<button type="button" class="hb" data-a="hub" aria-label="All episodes" title="All episodes (H)">' + LS.ic('grid') + '</button>' +
    '<div class="hud-t" id="hudT"></div>' +
    '<div class="hud-sp"></div>' +
    '<input type="range" class="hud-scrub" id="hudScrub" min="0" max="1" value="0" aria-label="Episode timeline">' +
    '<span class="hud-n" id="hudN"></span>' +
    '<div class="hud-mode" role="group" aria-label="Play mode">' +
      '<button type="button" class="hm" data-a="mode-watch" id="hudModeWatch" title="Watch mode: continuous auto-play (M)">Watch</button>' +
      '<button type="button" class="hm" data-a="mode-present" id="hudModePresent" title="Present mode: step 1 beat per click (M)">Present</button>' +
    '</div>' +
    '<button type="button" class="hb" data-a="prev" aria-label="Previous beat" title="Previous beat (Left arrow, Shift+Left for previous shot)">' + LS.ic('chevL') + '</button>' +
    '<button type="button" class="hb" data-a="play" id="hudPlay" title="Play / Pause (P)"></button>' +
    '<button type="button" class="hb" data-a="next" aria-label="Next beat" title="Next beat (Right arrow or Space, Shift+Right for next shot)">' + LS.ic('chevR') + '</button>' +
    '<button type="button" class="hb txt" data-a="lang" id="hudLang" title="Switch language (L)">ไทย</button>' +
    '<button type="button" class="hb" data-a="fs" aria-label="Full screen" title="Full screen (F)">' + LS.ic('fs') + '</button>';
  document.body.appendChild(hudEl);
  scrubEl = document.getElementById('hudScrub');
  if (scrubEl) {
    scrubEl.addEventListener('input', function () { dispatchPlayback('scrub', scrubEl.value); wake(); });
  }
  hudEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var a = b.dataset.a;
    if (a === 'hub') dispatchPlayback('hub');
    else if (a === 'prev') dispatchPlayback(e.shiftKey ? 'shotPrev' : 'stepPrev');
    else if (a === 'next') dispatchPlayback(e.shiftKey ? 'shotNext' : 'stepNext');
    else if (a === 'play') togglePlay();
    else if (a === 'mode-watch') setMode('watch', true);
    else if (a === 'mode-present') setMode('present', true);
    else if (a === 'lang') setLang(!isTh(), true);
    else if (a === 'fs') fullscreen();
    wake();
  });
}
function sheet(ep) {
  HTML.classList.add('sheet', 'still');
  document.body.innerHTML = '<div class="sheet-grid" id="sheet"></div>';
  var g = document.getElementById('sheet');
  ep.shots.forEach(function (s, k) {
    var d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = '<div class="deck-stage">' + slideHTML(s, ep, k) + '</div><span class="lbl">' + ep.no + '.' + (k + 1) + '</span>';
    g.appendChild(d);
    var el = d.querySelector('.slide');
    el.classList.add('active', 'nt');
    var sh = new Shot(el);
    sh.go(sh.n - 1, true, 0); sh.settle(0);
    requestAnimationFrame(function () { sh.aim(); });
  });
}
LS.boot = function () {
  LS.list = Object.keys(LS.eps).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return LS.eps[k]; });
  var opts = readOptions();
  HTML.classList.toggle('th', opts.th);
  HTML.setAttribute('lang', opts.th ? 'th' : 'en');
  st.mode = opts.mode;
  applyModeClasses();
  if (SHEET_MATCH && LS.eps[+SHEET_MATCH[1]]) { sheet(LS.eps[+SHEET_MATCH[1]]); return; }
  stage = document.getElementById('stage'); vp = document.getElementById('vp');
  buildHud();
  setLang(opts.th, false);
  fit(); window.addEventListener('resize', fit);
  route(); window.addEventListener('hashchange', route);
  vp.addEventListener('click', function (e) {
    if (e.target.closest('a,button,input,select,textarea')) return;
    if (!st.ep) return;
    dispatchPlayback(e.shiftKey ? 'shotNext' : 'stepNext');
    wake();
  });
  var tx = null;
  vp.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  vp.addEventListener('touchend', function (e) {
    if (tx == null || !st.ep) return;
    var dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) dispatchPlayback(dx < 0 ? 'stepNext' : 'stepPrev');
  }, { passive: true });
  document.addEventListener('mousemove', wake);
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.repeat) return;
    var tgt = e.target;
    if (tgt && tgt.closest && tgt.closest('input,select,textarea,[contenteditable=""],[contenteditable="true"]')) return;
    var k = e.key, onCtl = tgt && tgt.closest && tgt.closest('a,button');
    if (onCtl && (k === ' ' || k === 'Enter')) return;
    if (e.shiftKey && k === 'ArrowRight') { e.preventDefault(); dispatchPlayback('shotNext'); }
    else if (e.shiftKey && k === 'ArrowLeft') { e.preventDefault(); dispatchPlayback('shotPrev'); }
    else if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'Enter') { if (!st.ep) return; e.preventDefault(); dispatchPlayback('stepNext'); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { if (!st.ep) return; e.preventDefault(); dispatchPlayback('stepPrev'); }
    else if (k === 'p' || k === 'P') togglePlay();
    else if (k === 'm' || k === 'M') setMode(st.mode === 'watch' ? 'present' : 'watch', true);
    else if (k === 'l' || k === 'L') setLang(!isTh(), true);
    else if (k === 'h' || k === 'H') dispatchPlayback('hub');
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 'Home' && st.ep) { e.preventDefault(); dispatchPlayback('home'); }
    else if (k === 'End' && st.ep) { e.preventDefault(); dispatchPlayback('end'); }
    wake();
  });
  requestAnimationFrame(loop);
};
/* Measurement & control hooks for tests and tooling. */
LS.state = st;
LS.goto = function (i, mode) { if (st.ep) show(i, mode || 'end'); return st.shots.length; };
LS.seekBeat = seekBeat;
LS.setMode = setMode;
LS.setPlaying = setPlaying;
LS.dispatch = dispatchPlayback;
LS.beatDur = beatDur;
/* Full Watch-mode autoplay time in seconds (every beat of every shot, in 'en' or 'th'), built off-page. */
LS.runtime = function (lang) {
  var was = isTh(), out = { total: 0, eps: {}, shots: {} };
  HTML.classList.toggle('th', lang === 'th');
  try {
    LS.list.forEach(function (ep) {
      var box = document.createElement('div'), sec = 0;
      box.innerHTML = ep.shots.map(function (s, k) { return slideHTML(s, ep, k); }).join('');
      [].forEach.call(box.querySelectorAll('.slide'), function (el) {
        var sh = new Shot(el);
        for (var b = 0; b < sh.n; b++) { sh.beat = b; sec += beatDur(sh); }
      });
      out.eps[ep.no] = Math.round(sec); out.shots[ep.no] = ep.shots.length; out.total += sec;
    });
  } finally { HTML.classList.toggle('th', was); }
  out.total = Math.round(out.total);
  return out;
};
})();
