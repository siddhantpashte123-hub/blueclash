// This origin is configurable on the server with SITE_URL. Never construct
// canonical/share URLs from an incoming Host or X-Forwarded-Host header.
export const DEFAULT_SITE_URL = "https://www.blueclash.bond";
export const HOME_TITLE = "BlueClash | Minecraft & Free Fire Tournaments";
export const HOME_DESCRIPTION =
  "Discover Minecraft, Free Fire and more gaming tournaments on BlueClash. Browse events, view the rules and find your next community clash.";
export const SOCIAL_IMAGE_PATH = "/brand/social-card.jpg";
export const SOCIAL_IMAGE_ALT =
  "BlueClash gaming arena: tournaments for Minecraft, Free Fire and more";

export function normalizeSiteUrl(value = DEFAULT_SITE_URL) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error("SITE_URL must be a full http:// or https:// origin.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "SITE_URL must be a full http:// or https:// origin without credentials, a path, query or fragment.",
    );
  }
  return url.origin;
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function shorten(value, length) {
  const chars = Array.from(cleanText(value));
  if (chars.length <= length) return chars.join("");
  return `${chars
    .slice(0, length - 1)
    .join("")
    .trimEnd()}…`;
}

function common(siteUrl, title, description, url, indexable) {
  return {
    title,
    description,
    url,
    canonical: indexable ? url : null,
    robots: indexable
      ? "index, follow, max-image-preview:large"
      : "noindex, nofollow",
    image: `${siteUrl}${SOCIAL_IMAGE_PATH}`,
    imageAlt: SOCIAL_IMAGE_ALT,
  };
}

export function homeSeo(siteUrl) {
  return common(siteUrl, HOME_TITLE, HOME_DESCRIPTION, `${siteUrl}/`, true);
}

export function tournamentSeo(siteUrl, tournament) {
  const suffix = ` | ${shorten(tournament.game, 20)} Tournament | BlueClash`;
  const title = `${shorten(tournament.title, Math.max(18, 70 - Array.from(suffix).length))}${suffix}`;
  const description = shorten(
    `${tournament.game} tournament on BlueClash. ${tournament.tagline} ${tournament.description}`,
    160,
  );
  return common(
    siteUrl,
    title,
    description,
    `${siteUrl}/tournaments/${encodeURIComponent(String(tournament.id))}`,
    true,
  );
}

export function privateSeo(siteUrl, label = "BlueClash") {
  const title = label === "BlueClash" ? label : `${label} | BlueClash`;
  return common(siteUrl, title, HOME_DESCRIPTION, `${siteUrl}/`, false);
}

export function privatePageLabel(pathname) {
  if (/^\/auth\/?$/i.test(pathname)) return "Sign in";
  if (/^\/admin\/?$/i.test(pathname)) return "Organizer panel";
  if (/^\/my-entries\/?$/i.test(pathname)) return "My entries";
  if (/^\/entries\/[^/]+\/ticket\/?$/i.test(pathname)) return "My ticket";
  if (/^\/entries\/[^/]+\/chat\/?$/i.test(pathname)) return "Private chat";
  if (/^\/entries\/[^/]+\/?$/i.test(pathname)) return "My entry";
  if (/^\/tournaments\/[^/]+\/join\/?$/i.test(pathname))
    return "Enter tournament";
  return null;
}

export function isPublicTournament(tournament) {
  return (
    tournament &&
    !tournament.isDemo &&
    ["published", "completed"].includes(tournament.status)
  );
}
