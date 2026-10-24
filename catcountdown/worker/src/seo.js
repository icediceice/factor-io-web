// robots.txt and sitemap.xml for catcountdown.factor-io.com.
//
// They answer at the edge because the GitHub Pages origin's own robots/sitemap describe
// studio.factor-io.com, and this subdomain serves only the landing page and its assets.
// Nothing is disallowed: the giveaway and /iphone pages carry their own noindex, which a
// crawler can only read if robots.txt lets it fetch them.

export const SITE = "https://catcountdown.factor-io.com";
// Bump when cat-countdown.html or assets/cat-countdown/ change.
export const LASTMOD = "2026-10-24";

const ART = `${SITE}/assets/cat-countdown`;
// scripts/cat-countdown-assets.py names: the nine cats and the category slugs, in app order.
const CATS = ["sakura", "nimbus", "luna", "nori", "tangerine", "chai", "coco", "mallow", "yuki"];
const CATEGORIES = ["anniversary", "birthday", "trip", "exam", "pregnancy", "baby", "me-time",
  "medical", "work", "family", "festival", "shopping", "others"];
const CAPTURES = ["tour", "wizard", "notes", "tasks", "alarm", "widget", "bg-weather", "bg-season", "bg-heart",
  "bg-flower", "bg-glitter", "bg-starlight", "bg-fireflies", "bg-ember"];

export function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
}

export function sitemapImages() {
  return [
    `${ART}/og.jpg`,
    ...CAPTURES.map(name => `${ART}/captures/${name}.jpg`),
    ...CATS.map(cat => `${ART}/cats/${cat}-still.webp`),
    ...CATS.flatMap(cat => CATEGORIES.map(cg => `${ART}/scenes/${cat}-${cg}.webp`)),
  ];
}

export function sitemapXml() {
  const images = sitemapImages().map(loc => `    <image:image><image:loc>${loc}</image:loc></image:image>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${LASTMOD}</lastmod>
${images}
  </url>
</urlset>
`;
}
