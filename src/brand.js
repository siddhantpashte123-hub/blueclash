// Defaults remain available for existing installations without saved settings.
export const DEFAULT_BRANDING = Object.freeze({
  name: "BlueClash",
  revision: "0",
  logoUrl: "/brand/logo-192.png",
  largeLogoUrl: "/brand/logo-512.png",
  faviconUrl: "/favicon-48.png",
  appleIconUrl: "/apple-touch-icon.png",
  socialImageUrl: "/brand/social-card.jpg",
  customLogo: false,
  assetsMissing: false,
});

export const BRAND_NAME_MAX_LENGTH = 40;
export const BRAND_LOGO_MAX_BYTES = 5 * 1024 * 1024;

// Server-rendered meta tags prevent a flash of the default brand on first load.
export function brandingFromDocument() {
  if (typeof document === "undefined") return { ...DEFAULT_BRANDING };
  const meta = (name) =>
    document.head.querySelector(`meta[name="blueclash:brand-${name}"]`)
      ?.content;
  return {
    name: meta("name") || DEFAULT_BRANDING.name,
    revision: meta("revision") || DEFAULT_BRANDING.revision,
    logoUrl: meta("logo") || DEFAULT_BRANDING.logoUrl,
    largeLogoUrl: meta("logo-large") || DEFAULT_BRANDING.largeLogoUrl,
    faviconUrl: meta("favicon") || DEFAULT_BRANDING.faviconUrl,
    appleIconUrl: meta("apple-icon") || DEFAULT_BRANDING.appleIconUrl,
    socialImageUrl: meta("social-image") || DEFAULT_BRANDING.socialImageUrl,
    customLogo: meta("custom-logo") === "true",
    assetsMissing: meta("assets-missing") === "true",
  };
}
