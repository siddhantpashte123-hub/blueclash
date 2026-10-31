import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { sha256 } from "../server/security.js";
import { DEFAULT_SITE_URL, normalizeSiteUrl } from "../src/seo.js";

const ROOT = path.resolve(import.meta.dirname, "..");

test("SITE_URL is a trusted, validated origin", () => {
  assert.equal(normalizeSiteUrl(), DEFAULT_SITE_URL);
  assert.equal(
    normalizeSiteUrl("https://games.example.test/"),
    "https://games.example.test",
  );
  assert.equal(
    normalizeSiteUrl("http://example.test:8989"),
    "http://example.test:8989",
  );
  for (const invalid of [
    "",
    "example.test",
    "javascript:alert(1)",
    "https://user:password@example.test",
    "https://example.test/a",
    "https://example.test/?ticket=secret",
    "https://example.test/#fragment",
  ])
    assert.throws(() => normalizeSiteUrl(invalid), /SITE_URL/);
});

test("public SEO is server-rendered, private data is excluded, and share assets are available", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blueclash-seo-"));
  const dist = path.join(dir, "dist");
  fs.mkdirSync(dist);
  fs.copyFileSync(path.join(ROOT, "index.html"), path.join(dist, "index.html"));
  fs.cpSync(path.join(ROOT, "public", "brand"), path.join(dist, "brand"), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(ROOT, "public", "favicon-48.png"),
    path.join(dist, "favicon-48.png"),
  );
  const app = createApp({
    dataDir: path.join(dir, "data"),
    distDir: dist,
    siteUrl: "https://games.example.test",
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const stamp = "2026-10-31T10:00:00.000Z";
  const insert = app.locals.db.prepare(`INSERT INTO tournaments
    (title, game, category, tagline, description, starts_at, mode, total_slots,
     entry_fee_paise, prize_pool_paise, cover, rules, terms, status, is_demo, created_at, updated_at)
    VALUES (?, ?, 'minecraft', ?, ?, ?, 'Solo', 16, 0, 0, 'minecraft', 'Rules here', 'Terms here', ?, ?, ?, ?)`);
  const add = (title, status, demo = 0) =>
    Number(
      insert.run(
        title,
        "Minecraft & friends",
        'Join "the" arena & play',
        'A real event. <img src=x onerror="alert(1)"> Special $& text.',
        "2027-01-02T12:00:00.000Z",
        status,
        demo,
        stamp,
        stamp,
      ).lastInsertRowid,
    );
  const published = add('Clash & "<script>alert(1)</script>" $&', "published");
  const completed = add("A completed event", "completed");
  const draft = add("SECRET DRAFT TITLE", "draft");
  const demo = add("SAMPLE ONLY TITLE", "published", 1);

  const get = async (url, options = {}) => {
    const response = await fetch(`${base}${url}`, options);
    return { response, text: await response.text() };
  };

  await t.test(
    "homepage, structured data, and metadata do not depend on an untrusted Host",
    async () => {
      const { response, text } = await get("/", {
        headers: { Host: "evil.example", "X-Forwarded-Host": "evil.example" },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(
        text,
        /<title>BlueClash \| Minecraft &amp; Free Fire Tournaments<\/title>/,
      );
      assert.match(text, /<h1>BlueClash gaming tournaments<\/h1>/);
      assert.match(
        text,
        /rel="canonical" href="https:\/\/games\.example\.test\/"/,
      );
      assert.match(
        text,
        /property="og:image" content="https:\/\/games\.example\.test\/brand\/social-card\.jpg"/,
      );
      assert.match(text, /name="twitter:card" content="summary_large_image"/);
      assert.match(text, new RegExp(`href="/tournaments/${published}"`));
      assert.match(text, new RegExp(`href="/tournaments/${completed}"`));
      assert.doesNotMatch(
        text,
        /evil\.example|SECRET DRAFT TITLE|SAMPLE ONLY TITLE|<script>alert\(1\)<\/script>/,
      );
      assert.match(text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      const json = text.match(
        /<script id="seo-structured-data" type="application\/ld\+json">(.*?)<\/script>/,
      )?.[1];
      assert.ok(json);
      assert.equal(
        JSON.parse(json)["@graph"][1].logo,
        "https://games.example.test/brand/logo-512.png",
      );
      const digest = crypto.createHash("sha256").update(json).digest("base64");
      const csp = response.headers.get("content-security-policy");
      assert.ok(csp.includes(`'sha256-${digest}'`));
      assert.doesNotMatch(csp.match(/script-src [^;]+/)[0], /unsafe-inline/);
    },
  );

  await t.test(
    "event previews are specific and safely escaped in metadata and crawlable content",
    async () => {
      const { response, text } = await get(
        `/tournaments/${published}?ref=tracking`,
      );
      assert.equal(response.status, 200);
      assert.match(
        text,
        /<h1>Clash &amp; &quot;&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot; \$&amp;<\/h1>/,
      );
      assert.match(text, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
      assert.match(text, /Special \$&amp; text/);
      assert.doesNotMatch(
        text,
        /<img src=x onerror=|<script>alert\(1\)<\/script>/,
      );
      assert.match(
        text,
        new RegExp(
          `rel="canonical" href="https://games\\.example\\.test/tournaments/${published}"`,
        ),
      );
      assert.match(
        text,
        new RegExp(
          `property="og:url" content="https://games\\.example\\.test/tournaments/${published}"`,
        ),
      );
      assert.doesNotMatch(text, /ref=tracking|seo-structured-data/);
      assert.equal(response.headers.get("x-robots-tag"), null);
      const head = await fetch(`${base}/tournaments/${published}`, {
        method: "HEAD",
      });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), "");
    },
  );

  await t.test(
    "drafts, samples, private pages, API and unknown pages are not indexed",
    async () => {
      for (const [url, status] of [
        [`/tournaments/${draft}`, 404],
        [`/tournaments/${demo}`, 200],
        ["/tournaments/999999", 404],
        ["/auth?token=private-secret", 200],
        ["/admin?ticket=private-secret", 200],
        ["/my-entries", 200],
        ["/entries/12", 200],
        ["/entries/12/ticket", 200],
        ["/entries/12/chat", 200],
        [`/tournaments/${published}/join`, 200],
        ["/a-missing-page", 404],
      ]) {
        const { response, text } = await get(url);
        assert.equal(response.status, status, url);
        assert.equal(
          response.headers.get("x-robots-tag"),
          "noindex, nofollow",
          url,
        );
        assert.match(text, /name="robots" content="noindex, nofollow"/, url);
        assert.doesNotMatch(
          text,
          /rel="canonical"|SECRET DRAFT TITLE|SAMPLE ONLY TITLE|private-secret/,
          url,
        );
      }
      const api = await get("/api/health");
      assert.equal(
        api.response.headers.get("x-robots-tag"),
        "noindex, nofollow",
      );
      const index = await fetch(`${base}/index.html`, { redirect: "manual" });
      assert.equal(index.status, 301);
      assert.equal(index.headers.get("location"), "/");
    },
  );

  await t.test(
    "an authenticated admin can reload a draft without exposing it in HTML",
    async () => {
      const adminId = Number(
        app.locals.db
          .prepare(
            "INSERT INTO users (name, email, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)",
          )
          .run("Admin", "admin@example.test", "not-used", stamp)
          .lastInsertRowid,
      );
      const token = "a".repeat(64);
      app.locals.db
        .prepare(
          "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        )
        .run(sha256(token), adminId, "2099-01-01T00:00:00.000Z");
      const event = await get(`/tournaments/${draft}`, {
        headers: { Cookie: `blueclash_session=${token}` },
      });
      assert.equal(event.response.status, 200);
      assert.equal(
        event.response.headers.get("x-robots-tag"),
        "noindex, nofollow",
      );
      assert.doesNotMatch(event.text, /SECRET DRAFT TITLE|rel="canonical"/);
      assert.equal((await get(`/tournaments/${draft}`)).response.status, 404);
      assert.equal(
        (
          await get("/tournaments/999999", {
            headers: { Cookie: `blueclash_session=${token}` },
          })
        ).response.status,
        404,
      );
    },
  );

  await t.test(
    "robots and sitemap include only the configured origin and real public events",
    async () => {
      const robots = await get("/robots.txt");
      assert.equal(robots.response.status, 200);
      assert.match(robots.response.headers.get("content-type"), /^text\/plain/);
      assert.match(
        robots.text,
        /Sitemap: https:\/\/games\.example\.test\/sitemap\.xml/,
      );
      const map = await get("/sitemap.xml");
      assert.match(
        map.response.headers.get("content-type"),
        /^application\/xml/,
      );
      assert.match(map.text, /<loc>https:\/\/games\.example\.test\/<\/loc>/);
      assert.match(
        map.text,
        new RegExp(
          `<loc>https://games\\.example\\.test/tournaments/${published}</loc>`,
        ),
      );
      assert.match(
        map.text,
        new RegExp(
          `<loc>https://games\\.example\\.test/tournaments/${completed}</loc>`,
        ),
      );
      assert.doesNotMatch(
        map.text,
        new RegExp(`/tournaments/(${draft}|${demo})</loc>`),
      );
      assert.match(map.text, /<lastmod>2026-10-31T10:00:00\.000Z<\/lastmod>/);
    },
  );

  await t.test(
    "brand image and favicon are publicly fetchable with correct types",
    async () => {
      const image = await fetch(`${base}/brand/social-card.jpg`);
      assert.equal(image.status, 200);
      assert.match(image.headers.get("content-type"), /^image\/jpeg/);
      assert.equal(
        image.headers.get("cross-origin-resource-policy"),
        "cross-origin",
      );
      const bytes = Buffer.from(await image.arrayBuffer());
      assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
      const icon = await fetch(`${base}/favicon-48.png`);
      assert.equal(icon.status, 200);
      assert.match(icon.headers.get("content-type"), /^image\/png/);
    },
  );

  await t.test(
    "making an event private removes its metadata and sitemap entry immediately",
    async () => {
      app.locals.db
        .prepare("UPDATE tournaments SET status = 'draft' WHERE id = ?")
        .run(published);
      const event = await get(`/tournaments/${published}`);
      assert.equal(event.response.status, 404);
      assert.equal(
        event.response.headers.get("x-robots-tag"),
        "noindex, nofollow",
      );
      assert.doesNotMatch(event.text, /Clash &amp;|Special \$&amp; text/);
      assert.doesNotMatch(
        (await get("/sitemap.xml")).text,
        new RegExp(`/tournaments/${published}</loc>`),
      );
      assert.doesNotMatch(
        (await get("/")).text,
        new RegExp(`href="/tournaments/${published}"`),
      );
    },
  );

  await t.test(
    "publishing and editing an event refreshes HTML and sitemap without a rebuild",
    async () => {
      app.locals.db
        .prepare(
          "UPDATE tournaments SET status = 'published', title = ?, tagline = ? WHERE id = ?",
        )
        .run("Freshly published", "A new tagline", draft);
      const event = await get(`/tournaments/${draft}`);
      assert.equal(event.response.status, 200);
      assert.match(event.text, /<h1>Freshly published<\/h1>/);
      assert.match(event.text, /A new tagline/);
      assert.doesNotMatch(event.text, /SECRET DRAFT TITLE/);
      assert.match(
        (await get("/sitemap.xml")).text,
        new RegExp(`/tournaments/${draft}</loc>`),
      );
    },
  );
});
