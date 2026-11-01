import crypto from "node:crypto";
import { DEFAULT_BRANDING } from "../src/brand.js";
import {
  homeSeo,
  privatePageLabel,
  privateSeo,
  tournamentSeo,
} from "../src/seo.js";

const HEAD_START = "<!-- SEO_HEAD_START -->";
const HEAD_END = "<!-- SEO_HEAD_END -->";
const BODY_START = "<!-- SEO_BODY_START -->";
const BODY_END = "<!-- SEO_BODY_END -->";

// The same escaping is valid for HTML text, attributes and XML text.
function escapeText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function websiteStructuredData(siteUrl, brand = DEFAULT_BRANDING) {
  // Prevent a brand name from ending the script element. The exact JSON bytes
  // are hashed per request for CSP; no unsafe-inline permission is needed.
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: brand.name, url: `${siteUrl}/` },
      {
        "@type": "Organization",
        name: brand.name,
        url: `${siteUrl}/`,
        logo: `${siteUrl}${brand.largeLogoUrl}`,
      },
    ],
  }).replace(/</g, "\\u003c");
}

export function structuredDataCspHash(json) {
  return `'sha256-${crypto.createHash("sha256").update(json).digest("base64")}'`;
}

function renderHead(page, siteUrl, brand, structuredData) {
  const meta = (attribute, key, value) =>
    `<meta ${attribute}="${escapeText(key)}" content="${escapeText(value)}" />`;
  return [
    `<title>${escapeText(page.title)}</title>`,
    `<link rel="icon" type="image/png" sizes="48x48" href="${escapeText(brand.faviconUrl)}" />`,
    `<link rel="apple-touch-icon" href="${escapeText(brand.appleIconUrl)}" />`,
    meta("name", "description", page.description),
    meta("name", "robots", page.robots),
    meta("name", "blueclash:site-url", siteUrl),
    meta("name", "blueclash:brand-name", brand.name),
    meta("name", "blueclash:brand-revision", brand.revision),
    meta("name", "blueclash:brand-logo", brand.logoUrl),
    meta("name", "blueclash:brand-logo-large", brand.largeLogoUrl),
    meta("name", "blueclash:brand-favicon", brand.faviconUrl),
    meta("name", "blueclash:brand-apple-icon", brand.appleIconUrl),
    meta("name", "blueclash:brand-social-image", brand.socialImageUrl),
    meta("name", "blueclash:brand-custom-logo", String(brand.customLogo)),
    meta("name", "blueclash:brand-assets-missing", String(brand.assetsMissing)),
    page.canonical
      ? `<link rel="canonical" href="${escapeText(page.canonical)}" />`
      : "",
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", brand.name),
    meta("property", "og:title", page.title),
    meta("property", "og:description", page.description),
    meta("property", "og:url", page.url),
    meta("property", "og:image", page.image),
    meta("property", "og:image:type", "image/jpeg"),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", page.imageAlt),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", page.title),
    meta("name", "twitter:description", page.description),
    meta("name", "twitter:image", page.image),
    meta("name", "twitter:image:alt", page.imageAlt),
    structuredData
      ? `<script id="seo-structured-data" type="application/ld+json">${structuredData}</script>`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");
}

function homeBody(events, brand) {
  const list = events.length
    ? `<ul>${events
        .map(
          (event) =>
            `<li><a href="/tournaments/${event.id}">${escapeText(event.title)}</a> — ${escapeText(event.game)}</li>`,
        )
        .join("")}</ul>`
    : "<p>Check back for upcoming community tournaments.</p>";
  return `<main class="seo-fallback">
    <a href="/"><img src="${escapeText(brand.logoUrl)}" width="64" height="64" alt="${escapeText(brand.name)}" /></a>
    <h1>${escapeText(brand.name)} gaming tournaments</h1>
    <p>Discover community tournaments for Minecraft, Free Fire and more. Browse events and their rules before signing in to enter.</p>
    <section id="tournaments"><h2>Explore tournaments</h2>${list}</section>
    <p>JavaScript is required to sign in and enter a tournament.</p>
  </main>`;
}

function tournamentBody(event, brand) {
  const date = new Date(event.starts_at);
  const time = Number.isNaN(date.getTime())
    ? "To be announced"
    : `<time datetime="${escapeText(date.toISOString())}">${escapeText(date.toUTCString())}</time>`;
  return `<main class="seo-fallback">
    <p><a href="/">${escapeText(brand.name)}</a> / <a href="/#tournaments">Tournaments</a></p>
    <h1>${escapeText(event.title)}</h1>
    <p>${escapeText(event.tagline)}</p>
    <h2>About this tournament</h2>
    <p>${escapeText(event.description)}</p>
    <dl><dt>Game</dt><dd>${escapeText(event.game)}</dd>
      <dt>Mode</dt><dd>${escapeText(event.mode)}</dd>
      <dt>Starts</dt><dd>${time}</dd></dl>
    <p>Visit this page with JavaScript enabled to read the rules and enter.</p>
  </main>`;
}

function privateBody(brand) {
  return `<main class="seo-fallback"><h1>${escapeText(brand.name)}</h1>
    <p>JavaScript is required to use this page.</p>
    <p><a href="/">Browse ${escapeText(brand.name)} tournaments</a></p></main>`;
}

function replaceSection(template, start, end, value) {
  const from = template.indexOf(start);
  const to = template.indexOf(end, from + start.length);
  if (from < 0 || to < 0) {
    throw new Error(
      "The built index.html is missing SEO template markers. Rebuild the app.",
    );
  }
  return `${template.slice(0, from + start.length)}\n    ${value}\n    ${template.slice(to)}`;
}

export function assertSeoTemplate(template) {
  // Fail on startup, rather than quietly serving incorrect metadata, if a stale
  // or incompatible build is deployed alongside the server.
  replaceSection(template, HEAD_START, HEAD_END, "");
  replaceSection(template, BODY_START, BODY_END, "");
}

export function createSeo(db, siteUrl) {
  const publicEvent =
    db.prepare(`SELECT id, title, game, tagline, description, starts_at, mode
    FROM tournaments WHERE id = ? AND is_demo = 0 AND status IN ('published', 'completed')`);
  const publicDemo = db.prepare(`SELECT 1 FROM tournaments
    WHERE id = ? AND is_demo = 1 AND status IN ('published', 'completed')`);
  const homeEvents = db.prepare(`SELECT id, title, game FROM tournaments
    WHERE is_demo = 0 AND status IN ('published', 'completed')
    ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END, starts_at ASC, id ASC LIMIT 50`);
  // A sitemap may contain at most 50,000 URLs, including the homepage.
  const sitemapEvents = db.prepare(`SELECT id, updated_at FROM tournaments
    WHERE is_demo = 0 AND status IN ('published', 'completed') ORDER BY id ASC LIMIT 49999`);

  function render(pathname, template, brand = DEFAULT_BRANDING) {
    let page,
      body,
      status = 200,
      includeSchema = false;
    if (pathname === "/") {
      page = homeSeo(siteUrl, brand);
      body = homeBody(homeEvents.all(), brand);
      includeSchema = true;
    } else {
      const match = /^\/tournaments\/([^/]+)\/?$/i.exec(pathname);
      if (match) {
        const id = Number(match[1]);
        const valid =
          /^\d+$/.test(match[1]) && Number.isSafeInteger(id) && id > 0;
        const event = valid ? publicEvent.get(id) : null;
        if (event) {
          page = tournamentSeo(siteUrl, event, brand);
          body = tournamentBody(event, brand);
        } else {
          // A sample remains browseable but is never advertised to crawlers.
          const sample = valid && publicDemo.get(id);
          page = privateSeo(
            siteUrl,
            sample ? "Sample tournament" : "Tournament not found",
            brand,
          );
          body = privateBody(brand);
          if (!sample) status = 404;
        }
      } else {
        const label = privatePageLabel(pathname);
        page = privateSeo(siteUrl, label || "Page not found", brand);
        body = privateBody(brand);
        if (!label) status = 404;
      }
    }
    let html = replaceSection(
      template,
      HEAD_START,
      HEAD_END,
      renderHead(
        page,
        siteUrl,
        brand,
        includeSchema ? websiteStructuredData(siteUrl, brand) : null,
      ),
    );
    html = replaceSection(html, BODY_START, BODY_END, body);
    return { html, page, status };
  }

  function robots() {
    return `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
  }

  function sitemap() {
    const urls = [`<url><loc>${escapeText(`${siteUrl}/`)}</loc></url>`];
    for (const event of sitemapEvents.all()) {
      const updated = new Date(event.updated_at);
      const lastmod = Number.isNaN(updated.getTime())
        ? ""
        : `<lastmod>${escapeText(updated.toISOString())}</lastmod>`;
      urls.push(
        `<url><loc>${escapeText(`${siteUrl}/tournaments/${event.id}`)}</loc>${lastmod}</url>`,
      );
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }

  return { render, robots, sitemap };
}
