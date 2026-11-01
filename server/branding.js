import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  BRAND_LOGO_MAX_BYTES,
  BRAND_NAME_MAX_LENGTH,
  DEFAULT_BRANDING,
} from "../src/brand.js";
import { getSetting, setSetting, transaction } from "./db.js";

const KEYS = {
  name: "site_brand_name",
  revision: "site_brand_revision",
  bundle: "site_brand_bundle",
  previousBundle: "site_brand_previous_bundle",
  customLogo: "site_brand_custom_logo",
};
const ID = /^[a-f0-9]{32}$/;
export const BRAND_ASSET_NAMES = Object.freeze([
  "logo.png",
  "logo-192.png",
  "favicon.png",
  "apple-touch-icon.png",
  "social-card.jpg",
]);

class BrandingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validName(input) {
  if (
    typeof input !== "string" ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/u.test(
      input,
    )
  ) {
    throw new BrandingError(
      400,
      "Enter a valid website name without control characters.",
    );
  }
  const name = input.trim().replace(/\s+/gu, " ");
  if (!name || Array.from(name).length > BRAND_NAME_MAX_LENGTH) {
    throw new BrandingError(
      400,
      `Website name must be between 1 and ${BRAND_NAME_MAX_LENGTH} characters.`,
    );
  }
  return name;
}

function bundleAvailable(directory, id) {
  return (
    ID.test(id) &&
    BRAND_ASSET_NAMES.every((file) =>
      fs.existsSync(path.join(directory, id, file)),
    )
  );
}

// Only derived public images are exposed. Payment uploads and the database live
// elsewhere in DATA_DIR and are never reachable through the brand asset route.
export function getBranding(db, directory) {
  // Read these together so a request cannot mix values from before and after
  // an update made by a different server process.
  const values = Object.fromEntries(
    db
      .prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)")
      .all(KEYS.name, KEYS.revision, KEYS.bundle, KEYS.customLogo)
      .map(({ key, value }) => [key, value]),
  );
  let name = DEFAULT_BRANDING.name;
  try {
    name = validName(values[KEYS.name] || name);
  } catch {
    // A damaged/legacy setting should never prevent visitors loading the site.
  }
  const savedRevision = values[KEYS.revision] || "";
  const revision = ID.test(savedRevision) ? savedRevision : "0";
  const bundle = values[KEYS.bundle] || "";
  if (!bundle) return { ...DEFAULT_BRANDING, name, revision };
  if (!bundleAvailable(directory, bundle)) {
    return { ...DEFAULT_BRANDING, name, revision, assetsMissing: true };
  }
  const base = `/api/brand-assets/${bundle}`;
  return {
    name,
    revision,
    logoUrl: `${base}/logo-192.png`,
    largeLogoUrl: `${base}/logo.png`,
    faviconUrl: `${base}/favicon.png`,
    appleIconUrl: `${base}/apple-touch-icon.png`,
    socialImageUrl: `${base}/social-card.jpg`,
    customLogo: values[KEYS.customLogo] === "1",
    assetsMissing: false,
  };
}

function escapeXml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character],
  );
}

async function decodeLogo(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0 ||
    buffer.length > BRAND_LOGO_MAX_BYTES
  ) {
    throw new BrandingError(
      400,
      "Choose a PNG, JPEG or WebP logo no larger than 5 MB.",
    );
  }
  try {
    const input = sharp(buffer, {
      limitInputPixels: 16_777_216,
      failOn: "error",
      animated: true,
    });
    const info = await input.metadata();
    if (
      !["png", "jpeg", "webp"].includes(info.format) ||
      !info.width ||
      !info.height ||
      info.width < 16 ||
      info.height < 16 ||
      info.width > 4096 ||
      info.height > 4096 ||
      (info.pages || 1) !== 1
    ) {
      throw new Error("unsupported format, dimensions or animation");
    }
    // Re-encode to strip metadata and trailing content; never publish the upload itself.
    return await sharp(buffer, {
      limitInputPixels: 16_777_216,
      failOn: "error",
    })
      .rotate()
      .resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    throw new BrandingError(
      400,
      "Invalid logo. Use a non-animated PNG, JPEG or WebP image between 16 and 4096 pixels per side.",
    );
  }
}

// Register the licensed bundled fonts with Pango so social cards still have
// Latin and Devanagari text on VPS installations without system fonts.
let socialFontRegistration;
function registerSocialFont(assetRoot) {
  socialFontRegistration ||= (async () => {
    for (const [font, file] of [
      ["Manrope 12", "Manrope.ttf"],
      ["Noto Sans Devanagari 12", "NotoSansDevanagari.ttf"],
    ]) {
      await sharp({
        text: {
          text: "A",
          font,
          fontfile: path.join(assetRoot, "server/assets", file),
        },
      })
        .png()
        .toBuffer();
    }
  })();
  return socialFontRegistration;
}

async function makeAssets(name, logo, assetRoot) {
  await registerSocialFont(assetRoot);
  // SVG contains only our own layout plus XML-escaped plain text, not uploaded SVG.
  const fontSize = Math.min(
    62,
    Math.max(
      18,
      Math.floor(760 / (Math.max(1, Array.from(name).length) * 0.95)),
    ),
  );
  const overlay =
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#050b18" fill-opacity=".82"/>
    <rect x="0" y="0" width="13" height="630" fill="#4987ff"/>
    <rect x="48" y="157" width="306" height="306" rx="30" fill="#101d35" stroke="#5579be" stroke-width="2"/>
    <text x="400" y="194" fill="#87aaff" font-family="Manrope, Noto Sans Devanagari, sans-serif" font-size="20" font-weight="bold" letter-spacing="4">TOURNAMENT PLATFORM</text>
    <text x="400" y="278" fill="#ffffff" font-family="Manrope, Noto Sans Devanagari, sans-serif" font-size="${fontSize}" font-weight="bold">${escapeXml(name)}</text>
    <text x="400" y="347" fill="#e6edff" font-family="Manrope, Noto Sans Devanagari, sans-serif" font-size="31" font-weight="bold">FIND YOUR NEXT BATTLE.</text>
    <text x="400" y="395" fill="#aabbd9" font-family="Manrope, Noto Sans Devanagari, sans-serif" font-size="22">Discover tournaments. Join the clash.</text>
    <text x="400" y="448" fill="#80a9ff" font-family="Manrope, Noto Sans Devanagari, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">MINECRAFT  •  FREE FIRE  •  MORE</text>
  </svg>`);
  const [logo192, favicon, appleIcon, socialLogo] = await Promise.all([
    sharp(logo).resize(192, 192).png().toBuffer(),
    sharp(logo).resize(48, 48).png().toBuffer(),
    sharp(logo).resize(180, 180).png().toBuffer(),
    sharp(logo).resize(276, 276).png().toBuffer(),
  ]);
  const social = await sharp(
    path.join(assetRoot, "public/images/hero-arena.webp"),
  )
    .resize(1200, 630, { fit: "cover" })
    .composite([
      { input: overlay, top: 0, left: 0 },
      { input: socialLogo, top: 172, left: 63 },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  return {
    "logo.png": logo,
    "logo-192.png": logo192,
    "favicon.png": favicon,
    "apple-touch-icon.png": appleIcon,
    "social-card.jpg": social,
  };
}

function safeRemoveBundle(directory, id) {
  if (!ID.test(id)) return;
  try {
    fs.rmSync(path.join(directory, id), { recursive: true, force: true });
  } catch (error) {
    console.warn("Could not remove old brand assets:", error.message);
  }
}

export async function saveBranding(db, directory, assetRoot, input) {
  const name = validName(input.name);
  if (
    typeof input.revision !== "string" ||
    !(input.revision === "0" || ID.test(input.revision))
  ) {
    throw new BrandingError(400, "Reload the branding settings before saving.");
  }
  if (input.removeLogo && input.logo) {
    throw new BrandingError(
      400,
      "Choose either a new logo or the default logo, not both.",
    );
  }
  const current = getBranding(db, directory);
  if (input.revision !== current.revision) {
    throw new BrandingError(
      409,
      "Branding changed in another session. Reload the settings and try again.",
    );
  }
  if (
    name === current.name &&
    !input.logo &&
    (!input.removeLogo || !current.customLogo) &&
    !current.assetsMissing
  ) {
    return current;
  }

  const customLogo = !!input.logo || (!input.removeLogo && current.customLogo);
  let logo;
  if (input.logo) {
    logo = await decodeLogo(input.logo);
  } else if (customLogo) {
    const bundle = getSetting(db, KEYS.bundle);
    if (!bundleAvailable(directory, bundle)) {
      throw new BrandingError(
        409,
        "The saved logo is missing. Upload it again or restore the default logo.",
      );
    }
    logo = fs.readFileSync(path.join(directory, bundle, "logo.png"));
  } else {
    logo = fs.readFileSync(path.join(assetRoot, "public/brand/logo-512.png"));
  }

  const revision = crypto.randomBytes(16).toString("hex");
  // Exact defaults use the original built-in artwork. Otherwise all derivatives
  // share a versioned URL, including a name-specific social card.
  const bundle = !customLogo && name === DEFAULT_BRANDING.name ? "" : revision;
  let finalDirectory = "";
  if (bundle) {
    const assets = await makeAssets(name, logo, assetRoot);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.pending-${revision}`);
    finalDirectory = path.join(directory, revision);
    try {
      fs.mkdirSync(temporary, { mode: 0o700 });
      for (const [file, bytes] of Object.entries(assets)) {
        fs.writeFileSync(path.join(temporary, file), bytes, {
          mode: 0o600,
          flag: "wx",
        });
      }
      fs.renameSync(temporary, finalDirectory);
    } catch (error) {
      fs.rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  let obsolete = "";
  try {
    transaction(db, () => {
      const latest = getBranding(db, directory);
      if (input.revision !== latest.revision) {
        throw new BrandingError(
          409,
          "Branding changed in another session. Reload the settings and try again.",
        );
      }
      obsolete = getSetting(db, KEYS.previousBundle);
      setSetting(db, KEYS.name, name);
      setSetting(db, KEYS.revision, revision);
      setSetting(db, KEYS.previousBundle, getSetting(db, KEYS.bundle));
      setSetting(db, KEYS.bundle, bundle);
      setSetting(db, KEYS.customLogo, customLogo ? "1" : "0");
    });
  } catch (error) {
    if (finalDirectory) safeRemoveBundle(directory, revision);
    throw error;
  }
  // Retain the preceding version so an already-open page doesn't immediately
  // lose its image after a save. Older versions can be discarded safely.
  const previous = getSetting(db, KEYS.previousBundle);
  if (obsolete !== previous && obsolete !== bundle)
    safeRemoveBundle(directory, obsolete);
  return getBranding(db, directory);
}
