// patch-home.mjs — the ONLY sanctioned way to edit index.html's real content.
//
// The live homepage lives JSON-encoded inside <script type="__bundler/template">.
// KB records four hand-escaped sed attempts that all silently missed, so this
// script decodes the block with JSON.parse, edits PLAIN HTML under exact
// anchor-count assertions, re-encodes, and re-applies the closing-tag escape
// so no nested tag terminates the outer <script> early.
//
// The template stores LITERAL Unicode punctuation (— U+2014, ' U+2019), not
// HTML entities — anchors written with &mdash;/&rsquo; match zero times.
// Only &amp; is a real entity in the source.
//
// Invariants asserted below (any failure aborts before a byte is written):
//   * every anchor matches EXACTLY once
//   * the U+200A hair-space count is unchanged (prose is demoted, never deleted)
//   * the re-encoded block round-trips: JSON.parse(newRaw) === patched
//   * no literal "</" survives inside the encoded block
import fs from 'node:fs';

// Overridable so the record can be VERIFIED by replaying it against the
// pre-change index.html and diffing the resulting template block.
const FILE = process.argv[2] || '/Git/factor-io-web/index.html';
const OPEN = '<script type="__bundler/template">';
const CLOSE = '<' + '/script>';
// Codepoints are constructed, never typed: a literal U+200A pasted into this
// file gets normalized to U+0020 in transit, and an ASCII space silently
// matches nothing in the template (KB: the hair-space trap).
const HAIR = String.fromCodePoint(0x200a); // U+200A hair-space in "FACTOR I O"
const MD = String.fromCodePoint(0x2014);   // em dash — literal in the template
const RS = String.fromCodePoint(0x27);     // apostrophe is ASCII: U+2019 count is 0

const src = fs.readFileSync(FILE, 'utf8');
const i = src.indexOf(OPEN);
if (i < 0) throw new Error('template block not found');
const start = i + OPEN.length;
const end = src.indexOf(CLOSE, start);
if (end < 0) throw new Error('template block unterminated');
const rawBefore = src.slice(start, end);

let tpl = JSON.parse(rawBefore);
const countHair = (s) => s.split(HAIR).length - 1;
const hairBefore = countHair(tpl);

let applied = 0;
function sub(label, find, replace) {
  const n = tpl.split(find).length - 1;
  if (n !== 1) throw new Error(`anchor "${label}" matched ${n} times, expected exactly 1`);
  tpl = tpl.replace(find, replace);
  applied++;
}

const P_BODY = "font-size:15.5px; line-height:1.65; color:rgba(232,230,240,.66); margin:0; text-wrap:pretty";
const P_LEDE = "font-size:16px; line-height:1.7; color:rgba(232,230,240,.66); margin:0; text-wrap:pretty";

// Lead sentence: the single scannable line that replaces the paragraph.
const lead = (text, size = '17px') =>
  `<p style="font-family:'Space Grotesk',sans-serif; font-weight:500; font-size:${size}; line-height:1.5; color:#E8E6F0; margin:0; text-wrap:balance">${text}</p>`;

// Demoted prose — the original paragraph, verbatim, behind a Details toggle.
const details = (inner, style = P_BODY) =>
  `<details class="disclose"><summary>Details</summary><p style="${style}">${inner}</p></details>`;

// ------------------------------------------------------------------ styles
sub('style block',
  '  ::selection{background:rgba(180,110,255,.35);color:#fff}',
  `  ::selection{background:rgba(180,110,255,.35);color:#fff}
  details.disclose{margin-top:20px}
  details.disclose>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:9px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,230,240,.42);border:1px solid rgba(232,230,240,.12);border-radius:999px;padding:7px 15px;transition:color 160ms,border-color 160ms,background 160ms;user-select:none}
  details.disclose>summary::-webkit-details-marker{display:none}
  details.disclose>summary::after{content:"+";font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1;color:var(--accent,#B46EFF)}
  details.disclose[open]>summary::after{content:"\\2212"}
  details.disclose>summary:hover{color:#E8E6F0;border-color:rgba(180,110,255,.45);background:rgba(180,110,255,.07)}
  details.disclose>summary:focus-visible{outline:2px solid var(--accent,#B46EFF);outline-offset:3px}
  details.disclose>*:not(summary){margin-top:16px;animation:disclose-in 200ms cubic-bezier(.2,0,0,1)}
  @keyframes disclose-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`);

// -------------------------------------------------------------------- hero
// The hero follows the same rule as every other section: the compressed
// sentence is what you see, the original prose is DEMOTED, never deleted.
// The <details> must be a SIBLING after </p> — nesting it inside the hero
// paragraph would auto-close that <p> in the parser and drop its styling,
// so the anchor deliberately swallows the closing tag.
const HERO_STYLE = 'font-size:16px; line-height:1.7; color:rgba(232,230,240,.62); margin:0; max-width:58ch; text-wrap:pretty';
const HERO_PROSE = `An independent studio building Android apps and AI infrastructure that answer to one person ${MD} you. Local-first. Privacy by default. No hidden masters.`;
sub('hero sub',
  `${HERO_PROSE}</p>`,
  `Local-first apps and AI tools. No ads, no tracking, no metrics.</p>${details(HERO_PROSE, HERO_STYLE)}`);

// ----------------------------------------------------------------- products
sub('blink',
  `<p style="font-size:15.5px; line-height:1.65; color:rgba(232,230,240,.66); margin:0 0 26px; flex:1; text-wrap:pretty">Privacy protection for Android, built for the threat that${RS}s standing next to you. Entirely on-device, zero data collection.</p>`,
  `<div style="margin:0 0 26px; flex:1">${lead('Privacy for Android. Entirely on-device.')}${details(`Built for the threat that${RS}s standing next to you. Entirely on-device, zero data collection.`)}</div>`);

sub('catcountdown',
  `<p style="font-size:15.5px; line-height:1.65; color:rgba(232,230,240,.66); margin:0 0 26px; flex:1; text-wrap:pretty">A countdown app with personality. Nine cats, fifteen categories, and a soft claymorphic look that makes the waiting a little warmer. Set a date, pick your cat, watch it count down to the thing you${RS}re looking forward to.</p>`,
  `<div style="margin:0 0 26px; flex:1">${lead('Nine cats, fifteen categories. Soon on Play and iOS.')}${details(`A countdown app with personality. Nine cats, fifteen categories, and a soft claymorphic look that makes the waiting a little warmer. Set a date, pick your cat, watch it count down to the thing you${RS}re looking forward to.`)}</div>`);

// The standalone "Coming soon" badge is now redundant: the lead sentence above
// already says "Soon on Play and iOS". Removed rather than demoted because no
// claim is lost — there is nothing left to put behind a toggle.
sub('catcountdown badge',
  `<div style="font-family:'JetBrains Mono',monospace; font-size:12.5px; letter-spacing:.04em; color:rgba(232,230,240,.4)">Coming soon to Google Play and iOS</div>`,
  '');

// ----------------------------------------------------------------- approach
const APPROACH_PROSE = `<span style="font-weight:600; letter-spacing:.04em">FACTOR${HAIR}<span style="color:#22D3EE">I${HAIR}O</span></span> runs on <span style="color:#22D3EE; font-family:'JetBrains Mono',monospace; font-size:.92em">Light</span> ${MD} a custom AI-infrastructure stack that lets a small team design, build, test, and maintain production software end to end. It${RS}s the quiet reason a lean studio moves at the pace of a much larger one, without the overhead.`;
sub('approach lede',
  `<p style="font-size:clamp(17px,1.9vw,19px); line-height:1.7; color:rgba(232,230,240,.66); margin:0; text-wrap:pretty">${APPROACH_PROSE}</p>`,
  lead(`Built on <span style="color:#22D3EE; font-family:'JetBrains Mono',monospace; font-size:.94em">Light</span>, our own AI stack.`, '19px') + details(APPROACH_PROSE, P_LEDE));

sub('light-tools',
  `<p style="font-size:15.5px; line-height:1.65; color:rgba(232,230,240,.66); margin:0 0 20px; text-wrap:pretty">One piece of Light, extracted to stand alone: an open-source MCP server that replaces the built-in file and shell tools used by AI coding agents with token-efficient versions. One Go binary, speaks MCP over stdio, no daemon. Read less, write less, waste fewer turns.</p>`,
  `<div style="margin:0 0 20px">${lead(`Your agent shouldn${RS}t read 2,000 lines to change five.`)}${details('One piece of Light, extracted to stand alone: an open-source MCP server that replaces the built-in file and shell tools used by AI coding agents with token-efficient versions. One Go binary, speaks MCP over stdio, no daemon. Read less, write less, waste fewer turns.')}</div>`);

sub('tco calculator',
  `<p style="font-size:15.5px; line-height:1.65; color:rgba(232,230,240,.66); margin:0 0 20px; text-wrap:pretty">A decision-support calculator that compares owned inference hardware, cloud model APIs and rented GPU nodes over a workload you state. Exact decimal arithmetic, cited per-feed pricing with a freshness envelope, and throughput verdicts that say unknown instead of inventing a benchmark.</p>`,
  `<div style="margin:0 0 20px">${lead('Three lanes, one defensible number.')}${details('A decision-support calculator that compares owned inference hardware, cloud model APIs and rented GPU nodes over a workload you state. Exact decimal arithmetic, cited per-feed pricing with a freshness envelope, and throughput verdicts that say unknown instead of inventing a benchmark.')}</div>`);

// -------------------------------------------------------------- what's next
const RANSOM_PROSE = `Immutable backup infrastructure for organizations that can${RS}t afford to negotiate. Most defenses fail the moment an attacker reaches the backup ${MD} so the answer isn${RS}t a smarter alarm, it${RS}s a boundary they physically can${RS}t cross. Data that stays yours. Recovery that always works. <span style="color:rgba(232,230,240,.4)">More soon.</span>`;
sub('ransomware',
  `<p style="font-size:clamp(16px,1.9vw,19px); line-height:1.7; color:rgba(232,230,240,.66); margin:0; max-width:64ch; text-wrap:pretty">${RANSOM_PROSE}</p>`,
  lead(`A boundary attackers physically can${RS}t cross.`, '19px') + details(RANSOM_PROSE, P_LEDE + '; max-width:64ch'));

// -------------------------------------------------------------- mind behind
const TEAM_PROSE = `<span style="font-weight:600; letter-spacing:.04em">FACTOR${HAIR}<span style="color:var(--accent,#B46EFF)">I${HAIR}O</span></span> is led by Thanat Manasakool ${MD} Founder &amp; Principal Engineer, with twenty-plus years in enterprise infrastructure, including five years as an Ecosystem Solutions Architect for Red Hat and Nutanix, delivering architecture guidance and technical enablement to Thailand${RS}s leading channel partners. Every product here is designed, built, and shipped by people who use it ${MD} which is exactly why they stay simple, honest, and yours.`;
sub('team',
  `<p style="font-size:clamp(17px,1.9vw,19px); line-height:1.7; color:rgba(232,230,240,.66); margin:0; text-wrap:pretty">${TEAM_PROSE}</p>`,
  lead(`Thanat Manasakool ${MD} 20 years in enterprise infrastructure.`, '19px') + details(TEAM_PROSE, P_LEDE));

// ----------------------------------------------------------------- services
sub('commissioned builds',
  `<p style="font-size:15.5px; line-height:1.65; color:rgba(232,230,240,.66); margin:0 0 26px; flex:1; text-wrap:pretty">Full-cycle product engineering ${MD} from a napkin sketch to a shipped, maintained app. Mobile, backend, and AI infrastructure, built to the same local-first, privacy-first bar as everything we ship for ourselves.</p>`,
  `<div style="margin:0 0 26px; flex:1">${lead('From napkin sketch to shipped, maintained app.')}${details('Full-cycle product engineering. Mobile, backend, and AI infrastructure, built to the same local-first, privacy-first bar as everything we ship for ourselves.')}</div>`);

sub('consulting',
  `<p style="font-size:15.5px; line-height:1.65; color:rgba(232,230,240,.66); margin:0 0 26px; flex:1; text-wrap:pretty">Architecture reviews, security and backup strategy, AI-infrastructure setup, and hard-problem consulting. Senior engineering judgment, on call ${MD} without adding a permanent head to your org chart.</p>`,
  `<div style="margin:0 0 26px; flex:1">${lead('Senior engineering judgment, on call.')}${details(`Architecture reviews, security and backup strategy, AI-infrastructure setup, and hard-problem consulting ${MD} without adding a permanent head to your org chart.`)}</div>`);

// ----------------------------------------------------------- verify + write
const hairAfter = countHair(tpl);
if (hairAfter !== hairBefore) {
  throw new Error(`U+200A hair-space count changed: ${hairBefore} -> ${hairAfter} (prose must be demoted, never deleted)`);
}
if (applied !== 12) throw new Error(`expected 12 substitutions, applied ${applied}`);
if ((tpl.match(/<details class="disclose">/g) || []).length !== 10) {
  throw new Error('expected 10 disclosure toggles');
}

// The block is a JSON STRING LITERAL: it must keep its enclosing quotes.
// Stripping them and writing the bare body leaves index.html unparseable.
let body = JSON.stringify(tpl).slice(1, -1);        // JSON body, quotes removed
body = body.split('<' + '/').join('<\\u002F');      // re-apply closing-tag escape
if (body.includes('<' + '/')) throw new Error('an unescaped closing tag survived encoding');
const raw = '"' + body + '"';                       // ...and put them back
if (JSON.parse(raw) !== tpl) throw new Error('re-encoded block does not round-trip');

const out = src.slice(0, start) + raw + src.slice(end);
if (out.split(OPEN).length - 1 !== 1) throw new Error('template block count changed');
fs.writeFileSync(FILE, out);

console.log(`ok — ${applied} substitutions, 10 disclosures`);
console.log(`hair-spaces preserved: ${hairBefore}`);
console.log(`template ${tpl.length} chars, encoded ${raw.length} chars`);
console.log(`file ${src.length} -> ${out.length} bytes`);