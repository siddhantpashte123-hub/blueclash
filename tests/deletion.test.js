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
const payload = {
  title: "Deletion Test",
  game: "Minecraft",
  category: "minecraft",
  tagline: "TEST EVENT",
  description: "A tournament created only to test deletion.",
  startsAt: new Date(Date.now() + 86400000 * 10).toISOString(),
  mode: "Solo",
  totalSlots: 10,
  entryFee: "25",
  prizePool: "500",
  cover: "minecraft",
  rules: "Play fair and be kind.",
  terms: "I agree to the tournament rules.",
  status: "published",
};

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blueclash-delete-test-"));
  const app = createApp({ dataDir: dir });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const req = async (
    url,
    { method = "GET", body, cookie, csrf = true } = {},
  ) => {
    const headers = {};
    if (method !== "GET" && csrf) headers["X-Requested-With"] = "BlueClash";
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${url}`, { method, headers, body });
    const data = (response.headers.get("content-type") || "").includes(
      "application/json",
    )
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  app.locals.db
    .prepare(
      "INSERT INTO users (name,email,password_hash,is_admin,created_at) VALUES (?,?,?,?,?)",
    )
    .run(
      "Admin",
      "admin@delete.test",
      await hashPassword("admin-password-123"),
      1,
      new Date().toISOString(),
    );
  const login = await req("/auth/login", {
    method: "POST",
    body: { email: "admin@delete.test", password: "admin-password-123" },
  });
  assert.equal(login.status, 200);
  return { app, dir, req, admin: login.cookie };
}

async function register(req, name, email) {
  const response = await req("/auth/register", {
    method: "POST",
    body: { name, email, password: "player-password-123" },
  });
  assert.equal(response.status, 201);
  return response.cookie;
}
async function event(req, admin, details = {}) {
  const response = await req("/admin/tournaments", {
    method: "POST",
    cookie: admin,
    body: { ...payload, ...details },
  });
  assert.equal(response.status, 201);
  return response.data.tournament;
}
async function join(req, cookie, tournament, name) {
  const response = await req(`/tournaments/${tournament.id}/entries`, {
    method: "POST",
    cookie,
    body: {
      firstName: name,
      lastName: "Player",
      gameId: name,
      uid: "",
      gameName: name,
      acceptTerms: true,
      termsVersion: tournament.termsVersion,
    },
  });
  assert.equal(response.status, 201);
  return response.data.entry.id;
}
async function proof(req, cookie, id) {
  const body = new FormData();
  body.append(
    "screenshot",
    new Blob([png], { type: "image/png" }),
    "proof.png",
  );
  assert.equal(
    (await req(`/entries/${id}/proof`, { method: "POST", cookie, body }))
      .status,
    200,
  );
}

async function getSummary(req, admin, id) {
  const result = await req(`/admin/tournaments/${id}/deletion-summary`, {
    cookie: admin,
  });
  assert.equal(result.status, 200);
  return result.data.summary;
}
async function remove(req, admin, id, snapshot, confirmation = "DELETE") {
  return req(`/admin/tournaments/${id}`, {
    method: "DELETE",
    cookie: admin,
    body: { confirmation, snapshot },
  });
}

test("admin can explicitly delete a tournament and its entries without affecting other data", async (t) => {
  const { app, dir, req, admin } = await setup(t);
  assert.equal(
    (
      await req("/admin/settings", {
        method: "PUT",
        cookie: admin,
        body: { upiId: "host@bank", upiName: "Host", supportEmail: "" },
      })
    ).status,
    200,
  );
  const first = await register(req, "First Player", "first@delete.test");
  const second = await register(req, "Second Player", "second@delete.test");
  const target = await event(req, admin);
  const unaffected = await event(req, admin, { title: "Keep This Event" });
  const firstEntry = await join(req, first, target, "First");
  const secondEntry = await join(req, second, target, "Second");
  const otherEntry = await join(req, first, unaffected, "Other");
  await proof(req, first, firstEntry);
  await proof(req, second, secondEntry);
  await proof(req, first, otherEntry);
  assert.equal(
    (
      await req(`/admin/entries/${firstEntry}/review`, {
        method: "POST",
        cookie: admin,
        body: { action: "approve" },
      })
    ).status,
    200,
  );
  const firstTicket = (
    await req(`/entries/${firstEntry}/ticket`, { cookie: first })
  ).data.ticket.ticketCode;
  const files = app.locals.db
    .prepare("SELECT id, proof_filename FROM entries WHERE id IN (?, ?, ?)")
    .all(firstEntry, secondEntry, otherEntry);
  const fileFor = (id) =>
    path.join(
      dir,
      "uploads",
      files.find((row) => row.id === id).proof_filename,
    );

  const settings = new FormData();
  settings.append("paymentMode", "qr");
  settings.append("upiId", "");
  settings.append("upiName", "Host");
  settings.append("supportEmail", "");
  settings.append(
    "paymentQr",
    new Blob([png], { type: "image/png" }),
    "organizer-qr.png",
  );
  assert.equal(
    (
      await req("/admin/settings", {
        method: "PUT",
        cookie: admin,
        body: settings,
      })
    ).status,
    200,
  );
  const qrFilename = app.locals.db
    .prepare("SELECT value FROM settings WHERE key = 'payment_qr_filename'")
    .get().value;
  const qrPath = path.join(dir, "uploads", qrFilename);

  assert.equal(
    (await req(`/admin/tournaments/${target.id}/deletion-summary`)).status,
    401,
  );
  assert.equal(
    (
      await req(`/admin/tournaments/${target.id}/deletion-summary`, {
        cookie: first,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req(`/admin/tournaments/${target.id}`, {
        method: "DELETE",
        cookie: first,
        body: { confirmation: "DELETE", snapshot: "a".repeat(64) },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req(`/admin/tournaments/${target.id}`, {
        method: "DELETE",
        cookie: admin,
        csrf: false,
      })
    ).status,
    403,
  );
  const before = await getSummary(req, admin, target.id);
  assert.deepEqual(
    {
      entries: before.entryCount,
      pending: before.pendingCount,
      approved: before.approvedCount,
      proofs: before.proofCount,
      tickets: before.ticketCount,
    },
    { entries: 2, pending: 1, approved: 1, proofs: 2, tickets: 1 },
  );
  assert.equal(
    (
      await req(`/admin/tournaments/${target.id}`, {
        method: "DELETE",
        cookie: admin,
      })
    ).status,
    409,
  );
  assert.equal(
    (await remove(req, admin, target.id, before.snapshot, "delete")).status,
    409,
  );
  assert.equal(
    (await remove(req, admin, target.id, "not-a-snapshot")).status,
    409,
  );
  assert.equal(
    (await req(`/entries/${firstEntry}/ticket`, { cookie: first })).status,
    200,
  );
  assert.equal(fs.existsSync(fileFor(firstEntry)), true);

  // The number of entries is unchanged, but another approval changes what deletion affects.
  assert.equal(
    (
      await req(`/admin/entries/${secondEntry}/review`, {
        method: "POST",
        cookie: admin,
        body: { action: "approve" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await remove(req, admin, target.id, before.snapshot)).status,
    409,
  );
  const current = await getSummary(req, admin, target.id);
  assert.equal(current.entryCount, 2);
  assert.equal(current.ticketCount, 2);
  const secondTicket = (
    await req(`/entries/${secondEntry}/ticket`, { cookie: second })
  ).data.ticket.ticketCode;
  const deleted = await remove(req, admin, target.id, current.snapshot);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.data, {
    ok: true,
    deletedEntries: 2,
    cleanupFailures: 0,
  });
  assert.equal((await req(`/tournaments/${target.id}`)).status, 404);
  assert.equal(
    (await req(`/entries/${firstEntry}`, { cookie: first })).status,
    404,
  );
  const lateProof = new FormData();
  lateProof.append(
    "screenshot",
    new Blob([png], { type: "image/png" }),
    "late.png",
  );
  assert.equal(
    (
      await req(`/entries/${firstEntry}/proof`, {
        method: "POST",
        cookie: first,
        body: lateProof,
      })
    ).status,
    404,
  );
  assert.equal(
    (await req(`/admin/tickets/${firstTicket}`, { cookie: admin })).status,
    404,
  );
  assert.equal(
    (await req(`/admin/tickets/${secondTicket}`, { cookie: admin })).status,
    404,
  );
  assert.equal(
    (await req(`/admin/entries/${firstEntry}/proof`, { cookie: admin })).status,
    404,
  );
  assert.equal(fs.existsSync(fileFor(firstEntry)), false);
  assert.equal(fs.existsSync(fileFor(secondEntry)), false);
  assert.equal(fs.existsSync(fileFor(otherEntry)), true);
  assert.equal(fs.existsSync(qrPath), true);
  assert.equal(
    (await req(`/entries/${otherEntry}`, { cookie: first })).status,
    200,
  );
  assert.equal((await req(`/tournaments/${unaffected.id}`)).status, 200);
  assert.equal(
    (await req("/me", { cookie: first })).data.user.email,
    "first@delete.test",
  );
  assert.equal(
    (await req("/me", { cookie: second })).data.user.email,
    "second@delete.test",
  );

  // A zero-entry preview must not silently delete a new entry that arrives afterward.
  const race = await event(req, admin, { title: "New Entrant", entryFee: "0" });
  const emptySnapshot = await getSummary(req, admin, race.id);
  assert.equal(emptySnapshot.entryCount, 0);
  await join(req, second, race, "Race");
  assert.equal(
    (await remove(req, admin, race.id, emptySnapshot.snapshot)).status,
    409,
  );
  assert.equal((await req(`/tournaments/${race.id}`)).status, 200);
  // Existing integrations can still delete an event with no entries as before.
  const empty = await event(req, admin, {
    title: "Empty Event",
    entryFee: "0",
  });
  const emptySummary = await getSummary(req, admin, empty.id);
  assert.equal(
    (await remove(req, admin, empty.id, emptySummary.snapshot, "wrong")).status,
    409,
  );
  assert.equal(
    (
      await req(`/admin/tournaments/${empty.id}`, {
        method: "DELETE",
        cookie: admin,
      })
    ).status,
    200,
  );
});

test("failed screenshot cleanup is queued and retried safely on restart", async (t) => {
  const { app, dir, req, admin } = await setup(t);
  const player = await register(req, "Cleanup Player", "cleanup@delete.test");
  await req("/admin/settings", {
    method: "PUT",
    cookie: admin,
    body: { upiId: "host@bank", upiName: "Host", supportEmail: "" },
  });
  const target = await event(req, admin, { title: "Cleanup Test" });
  const entryId = await join(req, player, target, "Cleanup");
  await proof(req, player, entryId);
  const filename = app.locals.db
    .prepare("SELECT proof_filename FROM entries WHERE id = ?")
    .get(entryId).proof_filename;
  const file = path.join(dir, "uploads", filename);
  const summary = await getSummary(req, admin, target.id);
  const originalUnlink = fs.unlinkSync;
  const logged = t.mock.method(console, "error", () => {});
  let result;
  try {
    fs.unlinkSync = (candidate, ...args) => {
      if (candidate === file) {
        const error = new Error("simulated permission failure");
        error.code = "EACCES";
        throw error;
      }
      return originalUnlink(candidate, ...args);
    };
    result = await remove(req, admin, target.id, summary.snapshot);
  } finally {
    fs.unlinkSync = originalUnlink;
  }
  assert.equal(result.status, 200);
  assert.equal(result.data.cleanupFailures, 1);
  assert.match(
    logged.mock.calls[0].arguments.join(" "),
    /simulated permission failure/,
  );
  assert.equal(
    (await req(`/entries/${entryId}`, { cookie: player })).status,
    404,
  );
  assert.equal(fs.existsSync(file), true);
  assert.ok(
    app.locals.db
      .prepare("SELECT filename FROM proof_deletion_queue WHERE filename = ?")
      .get(filename),
  );
  const restarted = createApp({ dataDir: dir });
  assert.equal(fs.existsSync(file), false);
  assert.equal(
    restarted.locals.db
      .prepare("SELECT filename FROM proof_deletion_queue WHERE filename = ?")
      .get(filename),
    undefined,
  );
  restarted.locals.db.close();
});

test("cleanup never removes files belonging to another entry, a payment QR, or a path outside uploads", async (t) => {
  const { app, dir, req, admin } = await setup(t);
  const player = await register(req, "Shared Player", "shared@delete.test");
  await req("/admin/settings", {
    method: "PUT",
    cookie: admin,
    body: { upiId: "host@bank", upiName: "Host", supportEmail: "" },
  });
  const target = await event(req, admin, { title: "Shared Original" });
  const keeper = await event(req, admin, { title: "Shared Keeper" });
  const firstId = await join(req, player, target, "One");
  const secondId = await join(req, player, keeper, "Two");
  await proof(req, player, firstId);
  const filename = app.locals.db
    .prepare("SELECT proof_filename FROM entries WHERE id = ?")
    .get(firstId).proof_filename;
  const file = path.join(dir, "uploads", filename);
  app.locals.db
    .prepare(
      "UPDATE entries SET proof_filename=?, proof_mime='image/png', status='pending' WHERE id=?",
    )
    .run(filename, secondId);
  assert.equal(
    (
      await remove(
        req,
        admin,
        target.id,
        (await getSummary(req, admin, target.id)).snapshot,
      )
    ).data.cleanupFailures,
    0,
  );
  assert.equal(fs.existsSync(file), true);
  assert.equal(
    (await req(`/admin/entries/${secondId}/proof`, { cookie: admin })).status,
    200,
  );
  assert.equal(
    app.locals.db
      .prepare("SELECT filename FROM proof_deletion_queue WHERE filename = ?")
      .get(filename),
    undefined,
  );
  // A shared filename currently used as the organizer's QR is also protected.
  app.locals.db
    .prepare(
      "INSERT INTO settings (key,value) VALUES ('payment_qr_filename',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(filename);
  assert.equal(
    (
      await remove(
        req,
        admin,
        keeper.id,
        (await getSummary(req, admin, keeper.id)).snapshot,
      )
    ).data.cleanupFailures,
    0,
  );
  assert.equal(fs.existsSync(file), true);
  assert.equal((await req("/admin/payment-qr", { cookie: admin })).status, 200);

  const invalid = await event(req, admin, { title: "Invalid Filename" });
  const invalidEntry = await join(req, player, invalid, "Three");
  const sentinel = path.join(dir, "guard.png");
  fs.writeFileSync(sentinel, "must not delete");
  app.locals.db
    .prepare("UPDATE entries SET proof_filename='../guard.png' WHERE id=?")
    .run(invalidEntry);
  const logged = t.mock.method(console, "error", () => {});
  const response = await remove(
    req,
    admin,
    invalid.id,
    (await getSummary(req, admin, invalid.id)).snapshot,
  );
  assert.equal(response.status, 200);
  assert.equal(response.data.cleanupFailures, 1);
  assert.match(
    logged.mock.calls[0].arguments.join(" "),
    /Invalid stored filename/,
  );
  assert.equal(fs.readFileSync(sentinel, "utf8"), "must not delete");
  assert.ok(
    app.locals.db
      .prepare("SELECT filename FROM proof_deletion_queue WHERE filename = ?")
      .get("../guard.png"),
  );
});

test("a failed proof update rolls back and does not leave a screenshot behind", async (t) => {
  const { app, dir, req, admin } = await setup(t);
  const player = await register(req, "Rollback Player", "rollback@delete.test");
  await req("/admin/settings", {
    method: "PUT",
    cookie: admin,
    body: { upiId: "host@bank", upiName: "Host", supportEmail: "" },
  });
  const tournament = await event(req, admin, { title: "Rollback Test" });
  const entry = await join(req, player, tournament, "Rollback");
  app.locals.db.exec(
    "CREATE TRIGGER reject_test_proof BEFORE UPDATE ON entries WHEN NEW.status='pending' BEGIN SELECT RAISE(ABORT, 'test rollback'); END",
  );
  const before = fs.readdirSync(path.join(dir, "uploads"));
  const image = new FormData();
  image.append(
    "screenshot",
    new Blob([png], { type: "image/png" }),
    "proof.png",
  );
  const logged = t.mock.method(console, "error", () => {});
  const result = await req(`/entries/${entry}/proof`, {
    method: "POST",
    cookie: player,
    body: image,
  });
  assert.equal(result.status, 500);
  assert.equal(logged.mock.calls.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(dir, "uploads")), before);
  assert.equal(
    app.locals.db
      .prepare("SELECT status, proof_filename FROM entries WHERE id = ?")
      .get(entry).status,
    "awaiting_payment",
  );
  assert.equal(
    app.locals.db
      .prepare("SELECT proof_filename FROM entries WHERE id = ?")
      .get(entry).proof_filename,
    null,
  );
  app.locals.db.exec("DROP TRIGGER reject_test_proof");
  await proof(req, player, entry);
});
