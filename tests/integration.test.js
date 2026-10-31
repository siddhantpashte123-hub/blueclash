import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/security.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK0cAAAAASUVORK5CYII=",
  "base64",
);
const eventPayload = {
  title: "Weekend Clash",
  game: "Minecraft",
  category: "minecraft",
  tagline: "YOUR NEXT GAME",
  description: "A real tournament made for the players.",
  startsAt: new Date(Date.now() + 86400000 * 10).toISOString(),
  mode: "Solo",
  totalSlots: 2,
  entryFee: "49.50",
  prizePool: "5000",
  cover: "minecraft",
  rules: "Be kind.\nPlay fair.\nNo cheating.",
  terms: "I agree to follow the organizer’s tournament rules.",
  status: "published",
};

test("public browsing, account, registration, manual payment review, and admin controls", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blueclash-test-"));
  const app = createApp({ dataDir: dir });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const req = async (
    url,
    { method = "GET", body, cookie, headers = {}, csrf = true } = {},
  ) => {
    if (method !== "GET" && csrf) headers["X-Requested-With"] = "BlueClash";
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(`${base}/api${url}`, {
      method,
      headers,
      body,
    });
    const type = response.headers.get("content-type") || "";
    const data = type.includes("application/json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      headers: response.headers,
    };
  };
  let playerCookie, adminCookie, otherCookie, tournament, entryId;
  await t.test(
    "visitors can browse, while seeded samples cannot accept entries",
    async () => {
      const health = await req("/health");
      assert.equal(health.data.ok, true);
      assert.equal(health.headers.get("x-frame-options"), "SAMEORIGIN");
      assert.match(
        health.headers.get("content-security-policy"),
        /frame-ancestors 'self'/,
      );
      assert.equal((await req("/me")).data.user, null);
      const list = await req("/tournaments");
      assert.equal(list.status, 200);
      assert.equal(list.data.tournaments.length, 3);
      assert.ok(
        list.data.tournaments.every((event) => event.isDemo && !event.canJoin),
      );
      assert.equal((await req("/admin/overview")).status, 401);
      assert.equal(
        (await req("/auth/register", { method: "POST", body: {}, csrf: false }))
          .status,
        403,
      );
    },
  );
  await t.test(
    "admin can configure UPI and publish a real tournament",
    async () => {
      app.locals.db
        .prepare(
          "INSERT INTO users (name,email,password_hash,is_admin,created_at) VALUES (?,?,?,?,?)",
        )
        .run(
          "Admin",
          "admin@example.com",
          await hashPassword("admin-password-123"),
          1,
          new Date().toISOString(),
        );
      let response = await req("/auth/login", {
        method: "POST",
        body: { email: "admin@example.com", password: "admin-password-123" },
      });
      assert.equal(response.status, 200);
      adminCookie = response.cookie;
      assert.equal(response.data.user.isAdmin, true);
      response = await req("/admin/settings", {
        method: "PUT",
        cookie: adminCookie,
        body: { upiId: "invalid", upiName: "Host", supportEmail: "" },
      });
      assert.equal(response.status, 400);
      response = await req("/admin/settings", {
        method: "PUT",
        cookie: adminCookie,
        body: {
          upiId: "host@bank",
          upiName: "Tournament Host",
          supportEmail: "help@example.com",
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.settings.paymentConfigured, true);
      response = await req("/admin/tournaments", {
        method: "POST",
        cookie: adminCookie,
        body: eventPayload,
      });
      assert.equal(response.status, 201);
      tournament = response.data.tournament;
      assert.equal(tournament.canJoin, true);
      assert.equal(tournament.entryFee, 49.5);
    },
  );
  await t.test(
    "player must sign up and accept current terms before entering",
    async () => {
      let response = await req("/auth/register", {
        method: "POST",
        body: {
          name: "Player One",
          email: "player@example.com",
          password: "player-password-123",
        },
      });
      assert.equal(response.status, 201);
      playerCookie = response.cookie;
      assert.equal(
        (await req("/admin/overview", { cookie: playerCookie })).status,
        403,
      );
      const detail = await req(`/tournaments/${tournament.id}`, {
        cookie: playerCookie,
      });
      assert.equal(detail.status, 200);
      assert.equal(detail.data.myEntry, null);
      const fields = {
        firstName: "First",
        lastName: "Player",
        gameId: "player-001",
        uid: "",
        gameName: "Legend",
        acceptTerms: true,
        termsVersion: "old-terms",
      };
      assert.equal(
        (
          await req(`/tournaments/${tournament.id}/entries`, {
            method: "POST",
            cookie: playerCookie,
            body: fields,
          })
        ).status,
        409,
      );
      fields.termsVersion = detail.data.tournament.termsVersion;
      assert.equal(
        (
          await req("/tournaments/1/entries", {
            method: "POST",
            cookie: playerCookie,
            body: {
              ...fields,
              termsVersion: (await req("/tournaments/1")).data.tournament
                .termsVersion,
            },
          })
        ).status,
        409,
      );
      response = await req(`/tournaments/${tournament.id}/entries`, {
        method: "POST",
        cookie: playerCookie,
        body: fields,
      });
      assert.equal(response.status, 201);
      entryId = response.data.entry.id;
      assert.equal(response.data.entry.status, "awaiting_payment");
      response = await req(`/tournaments/${tournament.id}/entries`, {
        method: "POST",
        cookie: playerCookie,
        body: fields,
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.entry.id, entryId);
    },
  );
  await t.test(
    "checkout QR uses the locked entry amount and proof is private",
    async () => {
      let response = await req(`/admin/tournaments/${tournament.id}`, {
        method: "PUT",
        cookie: adminCookie,
        body: { ...eventPayload, entryFee: "100" },
      });
      assert.equal(response.status, 200);
      response = await req(`/entries/${entryId}`, { cookie: playerCookie });
      assert.equal(response.data.entry.amount, 49.5);
      assert.match(response.data.payment.qrCode, /^data:image\/png;base64,/);
      assert.match(response.data.payment.upiUri, /am=49.50/);
      assert.match(response.data.payment.upiUri, /pa=host%40bank/);
      let invalid = new FormData();
      invalid.append(
        "screenshot",
        new Blob(["not an image"], { type: "image/png" }),
        "fake.png",
      );
      assert.equal(
        (
          await req(`/entries/${entryId}/proof`, {
            method: "POST",
            cookie: playerCookie,
            body: invalid,
          })
        ).status,
        400,
      );
      const proof = new FormData();
      proof.append(
        "screenshot",
        new Blob([png], { type: "image/png" }),
        "proof.png",
      );
      proof.append("reference", "UPI123");
      response = await req(`/entries/${entryId}/proof`, {
        method: "POST",
        cookie: playerCookie,
        body: proof,
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.entry.status, "pending");
      assert.equal(
        (await req(`/admin/entries/${entryId}/proof`, { cookie: playerCookie }))
          .status,
        403,
      );
      response = await req("/auth/register", {
        method: "POST",
        body: {
          name: "Other Player",
          email: "other@example.com",
          password: "other-password-123",
        },
      });
      otherCookie = response.cookie;
      assert.equal(
        (await req(`/entries/${entryId}`, { cookie: otherCookie })).status,
        404,
      );
      response = await req(`/admin/entries/${entryId}/proof`, {
        cookie: adminCookie,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.data, png);
      assert.equal(response.headers.get("content-type"), "image/png");
    },
  );
  await t.test(
    "organizer manually approves and records are retained",
    async () => {
      let response = await req("/admin/overview", { cookie: adminCookie });
      assert.equal(response.data.stats.pending, 1);
      response = await req(`/admin/entries/${entryId}/review`, {
        method: "POST",
        cookie: adminCookie,
        body: { action: "approve", note: "Verified in UPI." },
      });
      assert.equal(response.status, 200);
      response = await req(`/entries/${entryId}`, { cookie: playerCookie });
      assert.equal(response.data.entry.status, "approved");
      assert.equal(response.data.entry.reviewNote, "Verified in UPI.");
      assert.equal(
        (
          await req(`/admin/entries/${entryId}/review`, {
            method: "POST",
            cookie: adminCookie,
            body: { action: "approve" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req(`/admin/tournaments/${tournament.id}`, {
            method: "DELETE",
            cookie: adminCookie,
          })
        ).status,
        409,
      );
      assert.equal(
        (await req("/me/entries", { cookie: playerCookie })).data.entries
          .length,
        1,
      );
    },
  );
  await t.test(
    "free entries confirm without UPI and old terms cannot be replayed",
    async () => {
      await req("/admin/settings", {
        method: "PUT",
        cookie: adminCookie,
        body: { upiId: "", upiName: "", supportEmail: "" },
      });
      const created = await req("/admin/tournaments", {
        method: "POST",
        cookie: adminCookie,
        body: { ...eventPayload, title: "Free Play", entryFee: "0" },
      });
      assert.equal(created.data.tournament.canJoin, true);
      const id = created.data.tournament.id;
      const oldVersion = created.data.tournament.termsVersion;
      await req(`/admin/tournaments/${id}`, {
        method: "PUT",
        cookie: adminCookie,
        body: {
          ...eventPayload,
          title: "Free Play",
          entryFee: "0",
          terms: "These are new and updated tournament conditions.",
        },
      });
      const fields = {
        firstName: "Other",
        lastName: "Player",
        gameId: "other123",
        uid: "",
        gameName: "Newbie",
        acceptTerms: true,
        termsVersion: oldVersion,
      };
      assert.equal(
        (
          await req(`/tournaments/${id}/entries`, {
            method: "POST",
            cookie: otherCookie,
            body: fields,
          })
        ).status,
        409,
      );
      fields.termsVersion = (
        await req(`/tournaments/${id}`)
      ).data.tournament.termsVersion;
      const response = await req(`/tournaments/${id}/entries`, {
        method: "POST",
        cookie: otherCookie,
        body: fields,
      });
      assert.equal(response.status, 201);
      assert.equal(response.data.entry.status, "approved");
    },
  );
  await t.test(
    "expired holds can submit late proof without over-approving a full event",
    async () => {
      await req("/admin/settings", {
        method: "PUT",
        cookie: adminCookie,
        body: { upiId: "host@bank", upiName: "Host", supportEmail: "" },
      });
      const payload = {
        ...eventPayload,
        title: "Last Spot",
        totalSlots: 1,
        entryFee: "50",
      };
      const created = await req("/admin/tournaments", {
        method: "POST",
        cookie: adminCookie,
        body: payload,
      });
      const id = created.data.tournament.id;
      const fields = {
        firstName: "First",
        lastName: "Player",
        gameId: "first",
        uid: "",
        gameName: "First",
        acceptTerms: true,
        termsVersion: created.data.tournament.termsVersion,
      };
      const first = await req(`/tournaments/${id}/entries`, {
        method: "POST",
        cookie: playerCookie,
        body: fields,
      });
      assert.equal(first.data.entry.status, "awaiting_payment");
      // Changing a tournament's price does not turn an existing paid checkout into a free entry.
      await req(`/admin/tournaments/${id}`, {
        method: "PUT",
        cookie: adminCookie,
        body: { ...payload, entryFee: "0" },
      });
      const resumed = await req(`/tournaments/${id}/entries`, {
        method: "POST",
        cookie: playerCookie,
        body: fields,
      });
      assert.equal(resumed.data.entry.status, "awaiting_payment");
      let checkout = await req(`/entries/${first.data.entry.id}`, {
        cookie: playerCookie,
      });
      assert.equal(checkout.data.entry.amount, 50);
      assert.ok(checkout.data.entry.holdExpiresAt);
      await req(`/admin/tournaments/${id}`, {
        method: "PUT",
        cookie: adminCookie,
        body: payload,
      });
      app.locals.db
        .prepare("UPDATE entries SET hold_expires_at = ? WHERE id = ?")
        .run(new Date(Date.now() - 60000).toISOString(), first.data.entry.id);
      assert.equal(
        (await req(`/tournaments/${id}`)).data.tournament.slotsLeft,
        1,
      );
      const second = await req(`/tournaments/${id}/entries`, {
        method: "POST",
        cookie: otherCookie,
        body: { ...fields, firstName: "Second", gameId: "second" },
      });
      assert.equal(second.status, 201);
      assert.equal(
        (
          await req(`/entries/${first.data.entry.id}/hold`, {
            method: "POST",
            cookie: playerCookie,
          })
        ).status,
        409,
      );
      const proof = () => {
        const body = new FormData();
        body.append(
          "screenshot",
          new Blob([png], { type: "image/png" }),
          "proof.png",
        );
        return body;
      };
      assert.equal(
        (
          await req(`/entries/${second.data.entry.id}/proof`, {
            method: "POST",
            cookie: otherCookie,
            body: proof(),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await req(`/admin/entries/${second.data.entry.id}/review`, {
            method: "POST",
            cookie: adminCookie,
            body: { action: "approve" },
          })
        ).status,
        200,
      );
      // Late proof is never discarded even though the slot has since been taken.
      assert.equal(
        (
          await req(`/entries/${first.data.entry.id}/proof`, {
            method: "POST",
            cookie: playerCookie,
            body: proof(),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await req(`/admin/entries/${first.data.entry.id}/review`, {
            method: "POST",
            cookie: adminCookie,
            body: { action: "approve" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req(`/admin/entries/${first.data.entry.id}/review`, {
            method: "POST",
            cookie: adminCookie,
            body: {
              action: "reject",
              note: "Please contact us about your payment.",
            },
          })
        ).status,
        200,
      );
      checkout = await req(`/entries/${first.data.entry.id}`, {
        cookie: playerCookie,
      });
      assert.equal(checkout.data.entry.status, "rejected");
      assert.match(checkout.data.entry.reviewNote, /contact/);
      assert.equal(
        (
          await req(`/entries/${first.data.entry.id}/proof`, {
            method: "POST",
            cookie: playerCookie,
            body: proof(),
          })
        ).status,
        200,
      );
    },
  );
});

test("trusted preview can opt into embedding without weakening production defaults", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blueclash-preview-test-"));
  const app = createApp({ dataDir: dir, allowEmbed: true });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/health`,
  );
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.doesNotMatch(
    response.headers.get("content-security-policy"),
    /frame-ancestors/,
  );
  const register = await fetch(
    `http://127.0.0.1:${server.address().port}/api/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "BlueClash",
      },
      body: JSON.stringify({
        name: "Preview Player",
        email: "preview@example.com",
        password: "preview-password-123",
      }),
    },
  );
  assert.equal(register.status, 201);
  assert.match(register.headers.get("set-cookie"), /SameSite=None/);
  assert.match(register.headers.get("set-cookie"), /Secure/);
  assert.match(register.headers.get("set-cookie"), /Partitioned/);
});
