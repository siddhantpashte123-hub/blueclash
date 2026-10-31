import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { openDatabase, setSetting } from "../server/db.js";
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
      assert.equal(
        (await req(`/entries/${entryId}`, { cookie: playerCookie })).data.entry
          .ticketCode,
        null,
      );
      assert.equal(
        (await req(`/entries/${entryId}/ticket`, { cookie: playerCookie }))
          .status,
        409,
      );
      assert.equal((await req(`/entries/${entryId}/ticket`)).status, 401);
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
        (await req(`/entries/${entryId}`, { cookie: playerCookie })).data.entry
          .ticketCode,
        null,
      );
      assert.equal(
        (await req(`/entries/${entryId}/ticket`, { cookie: playerCookie }))
          .status,
        409,
      );
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
      const code = response.data.entry.ticketCode;
      assert.match(code, /^BC-[A-F0-9]{24}$/);
      assert.ok(response.data.entry.ticketIssuedAt);
      const ticket = await req(`/entries/${entryId}/ticket`, {
        cookie: playerCookie,
      });
      assert.equal(ticket.status, 200);
      assert.equal(ticket.data.ticket.ticketCode, code);
      assert.equal(ticket.data.ticket.firstName, "First");
      assert.equal(
        (await req(`/entries/${entryId}/ticket`, { cookie: otherCookie }))
          .status,
        404,
      );
      assert.equal((await req(`/entries/${entryId}/ticket`)).status, 401);
      assert.equal(
        (await req(`/admin/tickets/${code}`, { cookie: playerCookie })).status,
        403,
      );
      assert.equal((await req(`/admin/tickets/${code}`)).status, 401);
      assert.equal(
        (await req(`/admin/tickets/not-a-ticket`, { cookie: adminCookie }))
          .status,
        400,
      );
      assert.equal(
        (
          await req(`/admin/tickets/BC-000000000000000000000000`, {
            cookie: adminCookie,
          })
        ).status,
        404,
      );
      const verified = await req(`/admin/tickets/${code.toLowerCase()}`, {
        cookie: adminCookie,
      });
      assert.equal(verified.status, 200);
      assert.equal(verified.data.ticket.ticketCode, code);
      assert.equal(verified.data.ticket.email, "player@example.com");
      assert.equal(
        (await req("/me/entries", { cookie: playerCookie })).data.entries[0]
          .ticketCode,
        code,
      );
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
        (await req(`/entries/${entryId}/ticket`, { cookie: playerCookie })).data
          .ticket.ticketCode,
        code,
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
      const freeTicket = await req(
        `/entries/${response.data.entry.id}/ticket`,
        { cookie: otherCookie },
      );
      assert.equal(freeTicket.status, 200);
      assert.match(freeTicket.data.ticket.ticketCode, /^BC-[A-F0-9]{24}$/);
      assert.ok(freeTicket.data.ticket.ticketIssuedAt);
      assert.equal(
        (
          await req(`/admin/tickets/${freeTicket.data.ticket.ticketCode}`, {
            cookie: adminCookie,
          })
        ).status,
        200,
      );
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
      const originalProof = app.locals.db
        .prepare("SELECT proof_filename FROM entries WHERE id = ?")
        .get(first.data.entry.id).proof_filename;
      assert.ok(fs.existsSync(path.join(dir, "uploads", originalProof)));
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
      assert.equal(checkout.data.entry.ticketCode, null);
      assert.equal(
        (
          await req(`/entries/${first.data.entry.id}/ticket`, {
            cookie: playerCookie,
          })
        ).status,
        409,
      );
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
      const replacementProof = app.locals.db
        .prepare("SELECT proof_filename FROM entries WHERE id = ?")
        .get(first.data.entry.id).proof_filename;
      assert.notEqual(replacementProof, originalProof);
      assert.equal(
        fs.existsSync(path.join(dir, "uploads", originalProof)),
        false,
      );
      assert.equal(
        fs.existsSync(path.join(dir, "uploads", replacementProof)),
        true,
      );
      assert.equal(
        app.locals.db
          .prepare(
            "SELECT filename FROM proof_deletion_queue WHERE filename = ?",
          )
          .get(originalProof),
        undefined,
      );
    },
  );
  await t.test(
    "uploaded payment QR is validated, private, replaceable, and removable",
    async () => {
      const makeSettings = (file, options = {}) => {
        const form = new FormData();
        form.append("paymentMode", options.mode || "qr");
        form.append("upiId", options.upiId || "");
        form.append("upiName", options.upiName || "QR Host");
        form.append("supportEmail", "help@example.com");
        form.append("removeQr", String(Boolean(options.remove)));
        if (file)
          form.append(
            "paymentQr",
            new Blob([file], { type: "image/png" }),
            "qr.png",
          );
        return form;
      };
      const save = (form, cookie = adminCookie) =>
        req("/admin/settings", { method: "PUT", cookie, body: form });
      assert.equal((await save(makeSettings())).status, 400);
      assert.equal(
        (await save(makeSettings(Buffer.from("not an image")))).status,
        400,
      );
      const tooLarge = await save(
        makeSettings(Buffer.alloc(5 * 1024 * 1024 + 1)),
      );
      assert.equal(tooLarge.status, 400);
      assert.match(tooLarge.data.error, /QR image must be 5 MB/);
      assert.equal((await save(makeSettings(png), playerCookie)).status, 403);
      let response = await save(makeSettings(png));
      assert.equal(response.status, 200);
      assert.equal(response.data.settings.paymentMode, "qr");
      assert.equal(response.data.settings.qrUploaded, true);
      assert.equal(response.data.settings.paymentConfigured, true);
      assert.equal((await req("/admin/payment-qr")).status, 401);
      assert.equal(
        (await req("/admin/payment-qr", { cookie: playerCookie })).status,
        403,
      );
      response = await req("/admin/payment-qr", { cookie: adminCookie });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(response.data, png);
      const oldFilename = app.locals.db
        .prepare("SELECT value FROM settings WHERE key = 'payment_qr_filename'")
        .get().value;
      assert.equal(
        (await req(`/uploads/${oldFilename}`, { cookie: playerCookie })).status,
        404,
      );
      const created = await req("/admin/tournaments", {
        method: "POST",
        cookie: adminCookie,
        body: { ...eventPayload, title: "Uploaded QR Clash" },
      });
      assert.equal(created.data.tournament.canJoin, true);
      const entered = await req(
        `/tournaments/${created.data.tournament.id}/entries`,
        {
          method: "POST",
          cookie: playerCookie,
          body: {
            firstName: "QR",
            lastName: "Player",
            gameId: "qr-player",
            uid: "",
            gameName: "Scanner",
            acceptTerms: true,
            termsVersion: created.data.tournament.termsVersion,
          },
        },
      );
      assert.equal(entered.status, 201);
      const id = entered.data.entry.id;
      const checkout = await req(`/entries/${id}`, { cookie: playerCookie });
      assert.equal(checkout.data.payment.mode, "qr");
      assert.equal(checkout.data.entry.amount, 49.5);
      assert.equal(
        checkout.data.payment.qrCode,
        `/api/entries/${id}/payment-qr`,
      );
      assert.equal(checkout.data.payment.upiUri, null);
      assert.equal((await req(`/entries/${id}/payment-qr`)).status, 401);
      assert.equal(
        (await req(`/entries/${id}/payment-qr`, { cookie: otherCookie }))
          .status,
        404,
      );
      response = await req(`/entries/${id}/payment-qr`, {
        cookie: playerCookie,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.data, png);
      assert.equal(
        (await save(makeSettings(Buffer.from("bad replacement")))).status,
        400,
      );
      assert.deepEqual(
        (await req("/admin/payment-qr", { cookie: adminCookie })).data,
        png,
      );
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      response = await save(makeSettings(jpeg));
      assert.equal(response.status, 200);
      response = await req(`/entries/${id}/payment-qr`, {
        cookie: playerCookie,
      });
      assert.deepEqual(response.data, jpeg);
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      assert.equal(
        fs.existsSync(path.join(dir, "uploads", oldFilename)),
        false,
      );
      const newFilename = app.locals.db
        .prepare("SELECT value FROM settings WHERE key = 'payment_qr_filename'")
        .get().value;
      assert.notEqual(newFilename, oldFilename);
      assert.equal(
        (await save(makeSettings(null, { remove: true }))).status,
        400,
      );
      response = await save(makeSettings(null, { mode: "none", remove: true }));
      assert.equal(response.status, 200);
      assert.equal(response.data.settings.qrUploaded, false);
      assert.equal(response.data.settings.paymentConfigured, false);
      assert.equal(
        fs.existsSync(path.join(dir, "uploads", newFilename)),
        false,
      );
      assert.equal(
        (await req(`/entries/${id}/payment-qr`, { cookie: playerCookie }))
          .status,
        404,
      );
      assert.equal(
        (await req(`/tournaments/${created.data.tournament.id}`)).data
          .tournament.canJoin,
        false,
      );
      // A settings request in the previous JSON format still enables dynamic UPI.
      response = await req("/admin/settings", {
        method: "PUT",
        cookie: adminCookie,
        body: {
          upiId: "legacy@bank",
          upiName: "Legacy Host",
          supportEmail: "",
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.settings.paymentMode, "upi");
      const dynamic = await req(`/entries/${id}`, { cookie: playerCookie });
      assert.match(dynamic.data.payment.upiUri, /am=49.50/);
      assert.match(dynamic.data.payment.upiUri, /pa=legacy%40bank/);
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

test("upgrading an old database preserves UPI and issues stable tickets for existing approved entries", async (t) => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "blueclash-migration-test-"),
  );
  const legacy = openDatabase(dir);
  // Recreate the entry schema from before ticket columns existed.
  legacy.exec(
    "DROP INDEX entries_ticket_code; ALTER TABLE entries DROP COLUMN ticket_code; ALTER TABLE entries DROP COLUMN ticket_issued_at;",
  );
  const stamp = "2025-01-02T03:04:05.000Z";
  const hash = await hashPassword("legacy-password-123");
  const insertUser = legacy.prepare(
    "INSERT INTO users (name,email,password_hash,is_admin,created_at) VALUES (?,?,?,?,?)",
  );
  const adminId = Number(
    insertUser.run("Legacy Admin", "legacy-admin@example.com", hash, 1, stamp)
      .lastInsertRowid,
  );
  const approvedId = Number(
    insertUser.run("Approved Player", "approved@example.com", hash, 0, stamp)
      .lastInsertRowid,
  );
  const pendingId = Number(
    insertUser.run("Pending Player", "pending@example.com", hash, 0, stamp)
      .lastInsertRowid,
  );
  const awaitingId = Number(
    insertUser.run("Awaiting Player", "awaiting@example.com", hash, 0, stamp)
      .lastInsertRowid,
  );
  assert.ok(adminId);
  const tournamentId = legacy
    .prepare("SELECT id FROM tournaments ORDER BY id LIMIT 1")
    .get().id;
  const insertEntry = legacy.prepare(`INSERT INTO entries
    (tournament_id,user_id,first_name,last_name,game_id,game_name,amount_paise,terms_snapshot,terms_accepted_at,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const entry = (userId, status) =>
    Number(
      insertEntry.run(
        tournamentId,
        userId,
        "Old",
        "Player",
        `game-${userId}`,
        "OldGame",
        4900,
        "Accepted terms",
        stamp,
        status,
        stamp,
        stamp,
      ).lastInsertRowid,
    );
  const approvedEntry = entry(approvedId, "approved");
  const pendingEntry = entry(pendingId, "pending");
  const awaitingEntry = entry(awaitingId, "awaiting_payment");
  setSetting(legacy, "upi_id", "old@bank");
  setSetting(legacy, "upi_name", "Original Host");
  legacy.close();

  const app = createApp({ dataDir: dir });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const db = app.locals.db;
  const approved = db
    .prepare("SELECT ticket_code, ticket_issued_at FROM entries WHERE id = ?")
    .get(approvedEntry);
  assert.match(approved.ticket_code, /^BC-[A-F0-9]{24}$/);
  assert.equal(approved.ticket_issued_at, stamp);
  assert.equal(
    db.prepare("SELECT ticket_code FROM entries WHERE id = ?").get(pendingEntry)
      .ticket_code,
    null,
  );
  assert.equal(
    db
      .prepare("SELECT ticket_code FROM entries WHERE id = ?")
      .get(awaitingEntry).ticket_code,
    null,
  );
  const reopened = openDatabase(dir);
  assert.equal(
    reopened
      .prepare("SELECT ticket_code FROM entries WHERE id = ?")
      .get(approvedEntry).ticket_code,
    approved.ticket_code,
  );
  reopened.close();

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (email) => {
    const response = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "BlueClash",
      },
      body: JSON.stringify({ email, password: "legacy-password-123" }),
    });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  const adminCookie = await login("legacy-admin@example.com");
  const settingResponse = await fetch(`${base}/admin/settings`, {
    headers: { Cookie: adminCookie },
  });
  const config = (await settingResponse.json()).settings;
  assert.equal(config.paymentMode, "upi");
  assert.equal(config.paymentConfigured, true);
  assert.equal(config.upiId, "old@bank");
  const ownerCookie = await login("approved@example.com");
  const ticketResponse = await fetch(
    `${base}/entries/${approvedEntry}/ticket`,
    { headers: { Cookie: ownerCookie } },
  );
  assert.equal(ticketResponse.status, 200);
  assert.equal(
    (await ticketResponse.json()).ticket.ticketCode,
    approved.ticket_code,
  );
  const pendingCookie = await login("pending@example.com");
  assert.equal(
    (
      await fetch(`${base}/entries/${pendingEntry}/ticket`, {
        headers: { Cookie: pendingCookie },
      })
    ).status,
    409,
  );
});
