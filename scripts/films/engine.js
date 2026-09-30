// engine.js: boots one film on the stage. Copy comes from the same content JSON the
// site is built from, timing from site/media.mjs, and the scene from ./<film>.js.
// The renderer drives window.__seek(t); nothing advances on its own clock.
import { films } from '/site/media.mjs';

const params = new URLSearchParams(location.search);
const film = params.get('film');
const lang = params.get('lang') ?? 'en';
document.documentElement.lang = lang;

const content = await (await fetch(`/content/${lang}/site.json`)).json();
const spec = films[film];
if (!spec || !content.films?.[film]) throw new Error(`Unknown film ${film}`);
// Load every face the scenes use before the first frame, so frame 0 is never a fallback font.
await Promise.all(['600 78px Geist', '500 26px Geist', '400 30px Geist', '500 20px "Geist Mono"', '600 70px "IBM Plex Sans Thai"', '500 26px "IBM Plex Sans Thai"', '400 29px "IBM Plex Sans Thai"']
  .map(font => document.fonts.load(font, 'Aa กข')));

const { build } = await import(`./${film}.js`);
const render = build({ stage: document.getElementById('stage'), copy: content.films[film], content, spec, lang });
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
window.__film = { duration: spec.duration };
window.__seek = t => { render(t); return frame(); };
render(Number(params.get('t') ?? 0));
window.__ready = true;