import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { api, useAuth } from "../shared.jsx";
import {
  DEFAULT_SITE_URL,
  homeSeo,
  isPublicTournament,
  normalizeSiteUrl,
  privatePageLabel,
  privateSeo,
  tournamentSeo,
} from "../seo.js";

function setMeta(attribute, name, value) {
  let element = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", value);
}

function applySeo(page) {
  document.title = page.title;
  setMeta("name", "description", page.description);
  setMeta("name", "robots", page.robots);
  setMeta("property", "og:site_name", page.siteName);
  setMeta("property", "og:title", page.title);
  setMeta("property", "og:description", page.description);
  setMeta("property", "og:url", page.url);
  setMeta("property", "og:image", page.image);
  setMeta("property", "og:image:alt", page.imageAlt);
  setMeta("name", "twitter:title", page.title);
  setMeta("name", "twitter:description", page.description);
  setMeta("name", "twitter:image", page.image);
  setMeta("name", "twitter:image:alt", page.imageAlt);
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!page.canonical) canonical?.remove();
  else {
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = page.canonical;
  }
}

function configuredSiteUrl() {
  const value = document.head.querySelector(
    'meta[name="blueclash:site-url"]',
  )?.content;
  try {
    return normalizeSiteUrl(value || DEFAULT_SITE_URL);
  } catch {
    return DEFAULT_SITE_URL;
  }
}

// The server renders metadata for crawlers before JavaScript runs. This keeps
// the browser title and metadata in sync when React Router changes pages.
export default function RouteSeo() {
  const { pathname } = useLocation();
  const { branding } = useAuth();
  useEffect(() => {
    const icon = document.head.querySelector('link[rel="icon"]');
    const apple = document.head.querySelector('link[rel="apple-touch-icon"]');
    if (icon) icon.setAttribute("href", branding.faviconUrl);
    if (apple) apple.setAttribute("href", branding.appleIconUrl);
    const siteUrl = configuredSiteUrl();
    if (pathname === "/") {
      applySeo(homeSeo(siteUrl, branding));
      return;
    }
    const match = /^\/tournaments\/(\d+)\/?$/i.exec(pathname);
    if (!match) {
      applySeo(
        privateSeo(
          siteUrl,
          privatePageLabel(pathname) || "Page not found",
          branding,
        ),
      );
      return;
    }

    // Preserve correct server-rendered metadata during the first fetch. On a
    // client-side transition, avoid briefly advertising the previous page.
    const expected = `${siteUrl}/tournaments/${match[1]}`;
    const current = document.head.querySelector('link[rel="canonical"]')?.href;
    if (current !== expected)
      applySeo(privateSeo(siteUrl, "Tournament", branding));
    const controller = new AbortController();
    api(`/tournaments/${encodeURIComponent(match[1])}`, {
      signal: controller.signal,
    })
      .then(({ tournament }) => {
        if (isPublicTournament(tournament))
          applySeo(tournamentSeo(siteUrl, tournament, branding));
        else
          applySeo(
            privateSeo(
              siteUrl,
              tournament?.isDemo ? "Sample tournament" : "Tournament",
              branding,
            ),
          );
      })
      .catch((error) => {
        if (error.name !== "AbortError" && error.status === 404)
          applySeo(privateSeo(siteUrl, "Tournament not found", branding));
      });
    return () => controller.abort();
  }, [pathname, branding]);
  return null;
}
