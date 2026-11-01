import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../server/app.js";
import { setSetting } from "../server/db.js";
import { hashPassword } from "../server/security.js";
import { DEFAULT_BRANDING } from "../src/brand.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const ONE_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK0cAAAAASUVORK5CYII=",
  "base64",
);

function upload(name, revision, file, options = {}) {
  const body = new FormData();
  body.append("name", name);
  body.append("revision", revision);
  body.append("removeLogo", String(options.removeLogo || false));
  if (file)
    body.append(
      "logo",
      new Blob([file], { type: options.type || "image/png" }),
      options.filename || "logo.png",
    );
  return body;
}

test("site branding is secure, persistent, and separate from payment data", async (t) => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "blueclash-branding-test-"),
  );
  const dataDir = path.join(dir, "data");
  const distDir = path.join(dir, "dist");
  fs.mkdirSync(distDir);
  fs.copyFileSync(
    path.join(ROOT, "index.html"),
    path.join(distDir, "index.html"),
  );
  fs.cpSync(path.join(ROOT, "public/brand"), path.join(distDir, "brand"), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(ROOT, "public/favicon-48.png"),
    path.join(distDir, "favicon-48.png"),
  );
  fs.copyFileSync(
    path.join(ROOT, "public/apple-touch-icon.png"),
    path.join(distDir, "apple-touch-icon.png"),
  );
  let app, server, base;
  async function start() {
    app = createApp({
      dataDir,
      distDir,
      siteUrl: "https://games.example.test",
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    app.locals.db.close();
  }
  await start();
  t.after(async () => {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  async function request(
    url,
    { method = "GET", body, cookie, csrf = true, headers = {} } = {},
  ) {
    if (method !== "GET" && csrf) headers["X-Requested-With"] = "BlueClash";
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${url}`, { method, body, headers });
    const type = response.headers.get("content-type") || "";
    const data = type.includes("application/json")
      ? await response.json()
      : type.includes("text/html")
        ? await response.text()
        : Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      headers: response.headers,
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const api = (url, options) => request(`/api${url}`, options);
  const put = (body, cookie, options = {}) =>
    api("/admin/branding", { method: "PUT", body, cookie, ...options });
  app.locals.db
    .prepare(
      "INSERT INTO users (name,email,password_hash,is_admin,created_at) VALUES (?,?,?,?,?)",
    )
    .run(
      "Admin",
      "admin@brand.test",
      await hashPassword("admin-password-123"),
      1,
      new Date().toISOString(),
    );
  const admin = await api("/auth/login", {
    method: "POST",
    body: { email: "admin@brand.test", password: "admin-password-123" },
  });
  const player = await api("/auth/register", {
    method: "POST",
    body: {
      name: "Player One",
      email: "player@brand.test",
      password: "player-password-123",
    },
  });
  assert.equal(admin.status, 200);
  assert.equal(player.status, 201);
  const adminCookie = admin.cookie,
    playerCookie = player.cookie;
  const privateFile = `${"e".repeat(48)}.png`;
  const privateData = Buffer.from("PRIVATE PAYMENT QR");
  const proofFile = `${"f".repeat(48)}.png`;
  const proofData = Buffer.from("PRIVATE PLAYER PAYMENT SCREENSHOT");
  fs.writeFileSync(path.join(dataDir, "uploads", privateFile), privateData);
  fs.writeFileSync(path.join(dataDir, "uploads", proofFile), proofData);
  setSetting(app.locals.db, "payment_qr_filename", privateFile);
  setSetting(app.locals.db, "payment_mode", "qr");
  setSetting(app.locals.db, "support_email", "help@example.test");

  let branding, firstLogo, firstSocial, ticketCode, entryId;
  const sourceLogo = await sharp({
    create: { width: 640, height: 320, channels: 4, background: "#e84040" },
  })
    .withMetadata({ density: 144 })
    .png()
    .toBuffer();

  await t.test(
    "defaults work publicly; only an authenticated admin can write",
    async () => {
      const me = await api("/me");
      assert.equal(me.data.user, null);
      assert.deepEqual(me.data.branding, DEFAULT_BRANDING);
      assert.equal((await api("/admin/branding")).status, 401);
      assert.equal(
        (await api("/admin/branding", { cookie: playerCookie })).status,
        403,
      );
      assert.equal(
        (await put({ name: "Unauthorized", revision: "0" })).status,
        401,
      );
      assert.equal(
        (await put({ name: "Unauthorized", revision: "0" }, playerCookie))
          .status,
        403,
      );
      assert.equal(
        (
          await put({ name: "Unauthorized", revision: "0" }, adminCookie, {
            csrf: false,
          })
        ).status,
        403,
      );
      assert.equal((await api("/admin/payment-qr")).status, 401);
      assert.deepEqual(
        (await api("/admin/payment-qr", { cookie: adminCookie })).data,
        privateData,
      );
      assert.equal((await request(`/uploads/${privateFile}`)).status, 404);
    },
  );

  await t.test(
    "name, image format, dimensions, size and revision are validated",
    async () => {
      for (const badName of [
        "",
        " ",
        "x".repeat(41),
        "bad\nname",
        "bad\u202ename",
        "bad\ufffe",
      ]) {
        assert.equal(
          (await put({ name: badName, revision: "0" }, adminCookie)).status,
          400,
          JSON.stringify(badName),
        );
      }
      assert.equal((await put({ name: "Okay" }, adminCookie)).status, 400);
      assert.equal(
        (await put({ name: "Okay", revision: "f".repeat(32) }, adminCookie))
          .status,
        409,
      );
      assert.equal(
        (
          await put(
            upload(
              "Okay",
              "0",
              Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
              { type: "image/png" },
            ),
            adminCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await put(
            upload("Okay", "0", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])),
            adminCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (await put(upload("Okay", "0", ONE_PIXEL), adminCookie)).status,
        400,
      );
      const gif = await sharp(sourceLogo).gif().toBuffer();
      assert.equal(
        (
          await put(
            upload("Okay", "0", gif, { type: "image/gif" }),
            adminCookie,
          )
        ).status,
        400,
      );
      const frames = Buffer.alloc(32 * 64 * 3);
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 32; x++) {
          frames[(y * 32 + x) * 3] = y < 32 ? 255 : 0;
          frames[(y * 32 + x) * 3 + 2] = y < 32 ? 0 : 255;
        }
      const animated = await sharp(frames, {
        raw: { width: 32, height: 64, channels: 3, pageHeight: 32 },
      })
        .webp({ loop: 0, delay: [200, 200] })
        .toBuffer();
      assert.equal(
        (await sharp(animated, { animated: true }).metadata()).pages,
        2,
      );
      assert.equal(
        (
          await put(
            upload("Okay", "0", animated, { type: "image/webp" }),
            adminCookie,
          )
        ).status,
        400,
      );
      const tooWide = await sharp({
        create: { width: 4097, height: 16, channels: 3, background: "red" },
      })
        .png()
        .toBuffer();
      assert.equal(
        (await put(upload("Okay", "0", tooWide), adminCookie)).status,
        400,
      );
      assert.equal(
        (
          await put(
            upload("Okay", "0", Buffer.alloc(5 * 1024 * 1024 + 1)),
            adminCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await put(
            upload("Okay", "0", sourceLogo, { removeLogo: true }),
            adminCookie,
          )
        ).status,
        400,
      );
      assert.equal((await api("/me")).data.branding.revision, "0");
    },
  );

  await t.test(
    "social cards can use bundled Latin and Devanagari fonts without system fonts",
    () => {
      const emptyFonts = path.join(dir, "empty-fonts");
      const fontConfig = path.join(dir, "fontconfig.xml");
      fs.mkdirSync(emptyFonts);
      fs.writeFileSync(
        fontConfig,
        `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${emptyFonts}</dir><cachedir>${emptyFonts}</cachedir></fontconfig>`,
      );
      const child = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
      import sharp from 'sharp';
      import path from 'node:path';
      import { openDatabase } from './server/db.js';
      import { saveBranding } from './server/branding.js';
      const data = ${JSON.stringify(path.join(dir, "font-test-data"))};
      const db = openDatabase(data);
      await saveBranding(db, path.join(data, 'branding'), process.cwd(), { name: 'गेमिंग अखाड़ा', revision: '0' });
      const latin = await sharp({ text: { text: 'MMMMMMMMMM', font: 'Manrope 52' } }).png().toBuffer({ resolveWithObject: true });
      const hindi = await sharp({ text: { text: 'गेमिंग अखाड़ा', font: 'Noto Sans Devanagari 52' } }).png().toBuffer({ resolveWithObject: true });
      process.stdout.write(JSON.stringify([latin.info.width, hindi.info.width]));
      db.close();
    `,
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            FONTCONFIG_FILE: fontConfig,
            FONTCONFIG_PATH: dir,
          },
        },
      );
      assert.equal(child.status, 0, child.stderr);
      // Missing-glyph boxes are much narrower than the registered fonts.
      const [latinWidth, hindiWidth] = JSON.parse(child.stdout);
      assert.ok(latinWidth > 300, child.stdout);
      assert.ok(hindiWidth > 150, child.stdout);
    },
  );

  await t.test(
    "a custom name and sanitized images appear in HTML, SEO, CSP and public assets",
    async () => {
      const name = `Arena </script><img src=x>&"`;
      const payload = Buffer.concat([
        sourceLogo,
        Buffer.from("<script>EXTRA_PRIVATE_DATA</script>"),
      ]);
      const result = await put(upload(name, "0", payload), adminCookie);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      branding = result.data.branding;
      assert.equal(branding.name, name);
      assert.equal(branding.customLogo, true);
      assert.match(branding.revision, /^[a-f0-9]{32}$/);
      assert.deepEqual((await api("/me")).data.branding, branding);

      const image = await request(branding.largeLogoUrl);
      assert.equal(image.status, 200);
      assert.match(image.headers.get("content-type"), /^image\/png/);
      assert.match(image.headers.get("cache-control"), /public.*immutable/);
      assert.equal(
        image.headers.get("cross-origin-resource-policy"),
        "cross-origin",
      );
      assert.equal(image.headers.get("x-robots-tag"), null);
      assert.equal(
        image.data.includes(Buffer.from("EXTRA_PRIVATE_DATA")),
        false,
      );
      const meta = await sharp(image.data).metadata();
      assert.equal(meta.width, 512);
      assert.equal(meta.height, 512);
      assert.equal(meta.exif, undefined);
      firstLogo = image.data;
      const favicon = await request(branding.faviconUrl);
      assert.equal((await sharp(favicon.data).metadata()).width, 48);
      const apple = await request(branding.appleIconUrl);
      assert.equal((await sharp(apple.data).metadata()).width, 180);
      const social = await request(branding.socialImageUrl);
      const socialMeta = await sharp(social.data).metadata();
      assert.equal(socialMeta.format, "jpeg");
      assert.equal(socialMeta.width, 1200);
      assert.equal(socialMeta.height, 630);
      firstSocial = social.data;
      const id = branding.revision;
      assert.equal(
        (await request(`/api/brand-assets/${id}/${privateFile}`)).status,
        404,
      );
      assert.equal(
        (await request(`/api/brand-assets/${id}/blueclash.sqlite`)).status,
        404,
      );
      assert.equal(
        (
          await request(
            `/api/brand-assets/${id}/..%2f..%2fuploads%2f${privateFile}`,
          )
        ).status,
        404,
      );
      assert.equal(
        (await request(`/api/brand-assets/${"g".repeat(32)}/logo.png`)).status,
        404,
      );

      const html = await request("/", {
        headers: {
          Host: "attacker.invalid",
          "X-Forwarded-Host": "attacker.invalid",
        },
      });
      assert.equal(html.status, 200);
      assert.equal(html.headers.get("cache-control"), "no-store");
      assert.match(
        html.data,
        /Arena &lt;\/script&gt;&lt;img src=x&gt;&amp;&quot;/,
      );
      assert.doesNotMatch(html.data, /Arena <\/script>|attacker\.invalid/);
      assert.ok(html.data.includes(`href="${branding.faviconUrl}"`));
      assert.ok(
        html.data.includes(
          `content="https://games.example.test${branding.socialImageUrl}"`,
        ),
      );
      const json = html.data.match(
        /<script id="seo-structured-data" type="application\/ld\+json">(.*?)<\/script>/,
      )?.[1];
      assert.ok(json);
      assert.equal(JSON.parse(json)["@graph"][0].name, name);
      assert.equal(
        JSON.parse(json)["@graph"][1].logo,
        `https://games.example.test${branding.largeLogoUrl}`,
      );
      assert.ok(json.includes("\\u003c"));
      const digest = crypto.createHash("sha256").update(json).digest("base64");
      const scriptSrc = html.headers
        .get("content-security-policy")
        .match(/script-src [^;]+/)[0];
      assert.ok(scriptSrc.includes(`'sha256-${digest}'`));
      assert.doesNotMatch(scriptSrc, /unsafe-inline/);
      const privatePage = await request("/admin");
      assert.match(privatePage.data, /noindex, nofollow/);
      assert.match(privatePage.data, /Arena &lt;\/script&gt;/);
    },
  );

  await t.test(
    "real tickets and payment data remain intact while branding changes",
    async () => {
      const event = await api("/admin/tournaments", {
        method: "POST",
        cookie: adminCookie,
        body: {
          title: "Free Match",
          game: "Minecraft",
          category: "minecraft",
          tagline: "PLAY TOGETHER",
          description: "A real community gaming tournament.",
          startsAt: new Date(Date.now() + 86400000 * 10).toISOString(),
          mode: "Solo",
          totalSlots: 10,
          entryFee: "0",
          prizePool: "100",
          cover: "minecraft",
          rules: "Play fairly and be kind.",
          terms: "I agree to the tournament rules.",
          status: "published",
        },
      });
      assert.equal(event.status, 201, JSON.stringify(event.data));
      const joined = await api(
        `/tournaments/${event.data.tournament.id}/entries`,
        {
          method: "POST",
          cookie: playerCookie,
          body: {
            firstName: "Player",
            lastName: "One",
            gameId: "1234",
            uid: "",
            gameName: "Champion",
            acceptTerms: true,
            termsVersion: event.data.tournament.termsVersion,
          },
        },
      );
      assert.equal(joined.status, 201);
      entryId = joined.data.entry.id;
      app.locals.db
        .prepare(
          "UPDATE entries SET proof_filename = ?, proof_mime = 'image/png' WHERE id = ?",
        )
        .run(proofFile, entryId);
      assert.deepEqual(
        (await api(`/admin/entries/${entryId}/proof`, { cookie: adminCookie }))
          .data,
        proofData,
      );
      assert.equal((await api(`/admin/entries/${entryId}/proof`)).status, 401);
      assert.equal(
        (await api(`/admin/entries/${entryId}/proof`, { cookie: playerCookie }))
          .status,
        403,
      );
      assert.equal(
        (await request(`/api/brand-assets/${branding.revision}/${proofFile}`))
          .status,
        404,
      );
      const ticket = await api(`/entries/${entryId}/ticket`, {
        cookie: playerCookie,
      });
      ticketCode = ticket.data.ticket.ticketCode;
      assert.match(ticketCode, /^BC-[A-F0-9]{24}$/);
      assert.equal(
        (await api(`/admin/tickets/${ticketCode}`, { cookie: adminCookie }))
          .status,
        200,
      );
      const page = await request(`/tournaments/${event.data.tournament.id}`);
      assert.ok(page.data.includes("Arena &lt;/script&gt;"));
      assert.ok(
        page.data.includes(
          `https://games.example.test${branding.socialImageUrl}`,
        ),
      );
      assert.equal(
        (await api("/admin/settings", { cookie: adminCookie })).data.settings
          .supportEmail,
        "help@example.test",
      );
      assert.deepEqual(
        (await api("/admin/payment-qr", { cookie: adminCookie })).data,
        privateData,
      );
    },
  );

  await t.test(
    "name-only edits retain the logo, version assets, and reject stale concurrent saves",
    async () => {
      const prior = branding;
      const result = await put(
        { name: "Night Owls Gaming", revision: prior.revision },
        adminCookie,
      );
      assert.equal(result.status, 200);
      branding = result.data.branding;
      assert.notEqual(branding.logoUrl, prior.logoUrl);
      assert.deepEqual((await request(branding.largeLogoUrl)).data, firstLogo);
      assert.notDeepEqual(
        (await request(branding.socialImageUrl)).data,
        firstSocial,
      );
      assert.equal((await request(prior.logoUrl)).status, 200);
      const saves = await Promise.all([
        put({ name: "Version One", revision: branding.revision }, adminCookie),
        put({ name: "Version Two", revision: branding.revision }, adminCookie),
      ]);
      assert.deepEqual(saves.map((item) => item.status).sort(), [200, 409]);
      assert.equal((await request(branding.logoUrl)).status, 200);
      branding = saves.find((item) => item.status === 200).data.branding;
      assert.equal(
        (await put({ name: "Stale", revision: prior.revision }, adminCookie))
          .status,
        409,
      );
    },
  );

  await t.test(
    "JPEG/WebP replacements are sanitized, and missing assets fall back safely",
    async () => {
      for (const [format, mime] of [
        ["jpeg", "image/jpeg"],
        ["webp", "image/webp"],
      ]) {
        const replacement = await sharp(sourceLogo)[format]().toBuffer();
        const priorLogo = branding.logoUrl;
        const result = await put(
          upload("Format Test", branding.revision, replacement, { type: mime }),
          adminCookie,
        );
        assert.equal(result.status, 200, JSON.stringify(result.data));
        branding = result.data.branding;
        assert.equal(branding.customLogo, true);
        assert.equal(
          (await sharp((await request(branding.largeLogoUrl)).data).metadata())
            .format,
          "png",
        );
        assert.equal((await request(priorLogo)).status, 200);
      }
      fs.unlinkSync(
        path.join(dataDir, "branding", branding.revision, "favicon.png"),
      );
      const fallback = (await api("/me")).data.branding;
      assert.equal(fallback.name, "Format Test");
      assert.equal(fallback.logoUrl, DEFAULT_BRANDING.logoUrl);
      assert.equal(fallback.assetsMissing, true);
      const repaired = await put(
        { name: fallback.name, revision: fallback.revision, removeLogo: true },
        adminCookie,
      );
      assert.equal(repaired.status, 200);
      branding = repaired.data.branding;
      assert.equal(branding.customLogo, false);
      assert.equal(branding.assetsMissing, false);
      assert.notEqual(branding.socialImageUrl, DEFAULT_BRANDING.socialImageUrl);
      assert.deepEqual(
        (await api(`/admin/entries/${entryId}/proof`, { cookie: adminCookie }))
          .data,
        proofData,
      );
    },
  );

  await t.test(
    "settings survive a restart, reset safely, and do not change ticket codes or payment settings",
    async () => {
      await stop();
      await start();
      assert.deepEqual((await api("/me")).data.branding, branding);
      assert.equal(
        (await api(`/entries/${entryId}/ticket`, { cookie: playerCookie })).data
          .ticket.ticketCode,
        ticketCode,
      );
      assert.equal(
        (await api(`/admin/tickets/${ticketCode}`, { cookie: adminCookie }))
          .status,
        200,
      );
      const previousLogo = branding.logoUrl;
      const result = await put(
        { name: "BlueClash", revision: branding.revision, removeLogo: true },
        adminCookie,
      );
      assert.equal(result.status, 200);
      branding = result.data.branding;
      assert.equal(branding.name, "BlueClash");
      assert.equal(branding.customLogo, false);
      assert.equal(branding.logoUrl, DEFAULT_BRANDING.logoUrl);
      assert.equal(branding.socialImageUrl, DEFAULT_BRANDING.socialImageUrl);
      assert.equal((await request(previousLogo)).status, 200);
      assert.equal(
        (await api(`/entries/${entryId}/ticket`, { cookie: playerCookie })).data
          .ticket.ticketCode,
        ticketCode,
      );
      assert.deepEqual(
        (await api("/admin/payment-qr", { cookie: adminCookie })).data,
        privateData,
      );
      assert.deepEqual(
        (await api(`/admin/entries/${entryId}/proof`, { cookie: adminCookie }))
          .data,
        proofData,
      );
      assert.equal(
        (await api("/admin/settings", { cookie: adminCookie })).data.settings
          .supportEmail,
        "help@example.test",
      );
      assert.equal((await request("/favicon-48.png")).status, 200);
    },
  );
});
