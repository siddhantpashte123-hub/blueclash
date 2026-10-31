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
const tournamentPayload = {
  title: "Private Minecraft Cup",
  game: "Minecraft",
  category: "minecraft",
  tagline: "PLAY TOGETHER",
  description: "A real event to test private organizer chat.",
  startsAt: new Date(Date.now() + 86400000 * 10).toISOString(),
  mode: "Solo",
  totalSlots: 100,
  entryFee: "25",
  prizePool: "500",
  cover: "minecraft",
  rules: "Play fair and be kind.",
  terms: "I agree to the tournament rules.",
  status: "published",
};

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blueclash-chat-test-"));
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
  async function req(url, { method = "GET", body, cookie, csrf = true } = {}) {
    const headers = {};
    if (method !== "GET" && csrf) headers["X-Requested-With"] = "BlueClash";
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${url}`, { method, body, headers });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      cacheControl: response.headers.get("cache-control"),
    };
  }
  const db = app.locals.db;
  db.prepare(
    "INSERT INTO users (name,email,password_hash,is_admin,created_at) VALUES (?,?,?,?,?)",
  ).run(
    "Admin",
    "admin@chat.test",
    await hashPassword("admin-password-123"),
    1,
    new Date().toISOString(),
  );
  const admin = await req("/auth/login", {
    method: "POST",
    body: { email: "admin@chat.test", password: "admin-password-123" },
  });
  assert.equal(admin.status, 200);
  assert.equal(
    (
      await req("/admin/settings", {
        method: "PUT",
        cookie: admin.cookie,
        body: { upiId: "host@bank", upiName: "Host", supportEmail: "" },
      })
    ).status,
    200,
  );
  async function register(name) {
    const response = await req("/auth/register", {
      method: "POST",
      body: {
        name,
        email: `${name.toLowerCase()}@chat.test`,
        password: "player-password-123",
      },
    });
    assert.equal(response.status, 201);
    return response.cookie;
  }
  async function event(extra = {}) {
    const response = await req("/admin/tournaments", {
      method: "POST",
      cookie: admin.cookie,
      body: { ...tournamentPayload, ...extra },
    });
    assert.equal(response.status, 201);
    return response.data.tournament;
  }
  async function join(cookie, tournament, name) {
    const response = await req(`/tournaments/${tournament.id}/entries`, {
      method: "POST",
      cookie,
      body: {
        firstName: name,
        lastName: "Player",
        gameId: name,
        gameName: name,
        uid: "",
        acceptTerms: true,
        termsVersion: tournament.termsVersion,
      },
    });
    assert.equal(response.status, 201);
    return response.data.entry.id;
  }
  async function upload(cookie, entry) {
    const body = new FormData();
    body.append(
      "screenshot",
      new Blob([png], { type: "image/png" }),
      "proof.png",
    );
    assert.equal(
      (await req(`/entries/${entry}/proof`, { method: "POST", cookie, body }))
        .status,
      200,
    );
  }
  async function review(entry, action) {
    return req(`/admin/entries/${entry}/review`, {
      method: "POST",
      cookie: admin.cookie,
      body: { action },
    });
  }
  async function send(cookie, route, message) {
    return req(route, { method: "POST", cookie, body: { message } });
  }
  return {
    app,
    db,
    dir,
    req,
    admin: admin.cookie,
    register,
    event,
    join,
    upload,
    review,
    send,
  };
}

test("private chat opens only for confirmed entries and remains isolated per player and tournament", async (t) => {
  const { app, dir, req, admin, register, event, join, upload, review, send } =
    await setup(t);
  const alice = await register("Alice");
  const bob = await register("Bob");
  const paid = await event();
  const free = await event({ title: "Free Arena", entryFee: "0" });
  const a = await join(alice, paid, "Alice");
  const b = await join(bob, paid, "Bob");
  const freeA = await join(alice, free, "Alice");
  const freeB = await join(bob, free, "Bob");
  const playerRoute = `/entries/${a}/chat`;
  const adminRoute = `/admin/entries/${a}/chat`;

  assert.equal((await req(playerRoute)).status, 401);
  assert.equal((await req(playerRoute, { cookie: bob })).status, 404);
  assert.equal(
    (await req(`/entries/${freeA}/chat`, { cookie: bob })).status,
    404,
  );
  assert.equal((await req("/admin/chats", { cookie: alice })).status, 403);
  assert.equal((await req("/admin/chats")).status, 401);
  assert.equal((await req(playerRoute, { cookie: alice })).status, 409);
  assert.equal((await req(adminRoute, { cookie: admin })).status, 409);
  assert.equal(
    (await send(alice, playerRoute, "Where is the server?")).status,
    409,
  );
  assert.equal((await send(admin, adminRoute, "Server address")).status, 409);
  assert.equal(
    (await req(`/entries/${freeA}/chat`, { cookie: alice })).status,
    200,
  );
  let inbox = await req("/admin/chats", { cookie: admin });
  assert.deepEqual(
    new Set(inbox.data.threads.map((row) => row.entryId)),
    new Set([freeA, freeB]),
  );

  await upload(alice, a);
  assert.equal((await req(playerRoute, { cookie: alice })).status, 409); // pending review
  assert.equal((await review(a, "reject")).status, 200);
  assert.equal((await req(playerRoute, { cookie: alice })).status, 409); // rejected
  await upload(alice, a);
  assert.equal((await review(a, "approve")).status, 200);
  const one = await send(
    alice,
    playerRoute,
    "Hi! Where is the server IP?\n<script>not markup</script>",
  );
  assert.equal(one.status, 201);
  assert.equal(one.data.message.senderRole, "player");
  assert.equal(
    (await req("/admin/chats/unread", { cookie: admin })).data.count,
    1,
  );
  inbox = await req(`/admin/chats?tournamentId=${paid.id}&search=Alice`, {
    cookie: admin,
  });
  assert.equal(inbox.status, 200);
  assert.equal(inbox.cacheControl, "no-store");
  assert.equal(inbox.data.threads.length, 1);
  assert.equal(inbox.data.threads[0].unreadCount, 1);
  assert.equal(inbox.data.threads[0].playerName, "Alice Player");
  const messages = await req(adminRoute, { cookie: admin });
  assert.equal(
    messages.data.messages[0].text,
    "Hi! Where is the server IP?\n<script>not markup</script>",
  );
  assert.equal(messages.data.thread.email, "alice@chat.test");
  assert.equal(
    (await req(`/entries/${freeB}/chat`, { cookie: bob })).data.messages.length,
    0,
  );
  assert.equal(
    (await req(`/entries/${freeA}/chat`, { cookie: alice })).data.messages
      .length,
    0,
  );
  assert.equal((await req(playerRoute, { cookie: bob })).status, 404);
  assert.equal(
    (await send(bob, playerRoute, "I should not see this")).status,
    404,
  );
  assert.equal(
    (
      await req(`${adminRoute}/read`, {
        method: "POST",
        cookie: admin,
        csrf: false,
        body: { throughId: one.data.message.id },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req(`${adminRoute}/read`, {
        method: "POST",
        cookie: admin,
        body: { throughId: one.data.message.id },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/admin/chats/unread", { cookie: admin })).data.count,
    0,
  );

  const reply = await send(
    admin,
    adminRoute,
    "IP: play.example.test:25565\nJoin at 8 PM.",
  );
  assert.equal(reply.status, 201);
  assert.equal(reply.data.message.senderRole, "admin");
  const mine = await req(playerRoute, { cookie: alice });
  assert.equal(mine.data.thread.email, undefined);
  assert.equal(mine.data.messages.length, 2);
  assert.match(mine.data.messages[1].text, /play\.example\.test:25565/);
  let aliceEntries = (await req("/me/entries", { cookie: alice })).data.entries;
  assert.equal(aliceEntries.find((entry) => entry.id === a).unreadMessages, 1);
  assert.equal(
    aliceEntries.find((entry) => entry.id === freeA).unreadMessages,
    0,
  );
  assert.equal(
    (
      await req(`${playerRoute}/read`, {
        method: "POST",
        cookie: bob,
        body: { throughId: reply.data.message.id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req(`${playerRoute}/read`, {
        method: "POST",
        cookie: alice,
        body: { throughId: reply.data.message.id },
      })
    ).status,
    200,
  );
  aliceEntries = (await req("/me/entries", { cookie: alice })).data.entries;
  assert.equal(aliceEntries.find((entry) => entry.id === a).unreadMessages, 0);

  const startedByAdmin = await send(
    admin,
    `/admin/entries/${freeB}/chat`,
    "Your match starts soon.",
  );
  assert.equal(startedByAdmin.status, 201);
  assert.equal(
    (await req(`/entries/${freeB}/chat`, { cookie: bob })).data.messages[0]
      .text,
    "Your match starts soon.",
  );
  const later = await send(
    admin,
    `/admin/entries/${freeB}/chat`,
    "A second update.",
  );
  assert.equal(later.status, 201);
  assert.equal(
    (
      await req(`/entries/${freeB}/chat/read`, {
        method: "POST",
        cookie: bob,
        body: { throughId: startedByAdmin.data.message.id },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/me/entries", { cookie: bob })).data.entries.find(
      (entry) => entry.id === freeB,
    ).unreadMessages,
    1,
  );
  assert.equal(
    (
      await req(`/entries/${freeB}/chat/read`, {
        method: "POST",
        cookie: bob,
        body: { throughId: later.data.message.id },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/me/entries", { cookie: bob })).data.entries.find(
      (entry) => entry.id === freeB,
    ).unreadMessages,
    0,
  );
  assert.equal((await req(`/entries/${b}/chat`, { cookie: bob })).status, 409);
  const restarted = createApp({ dataDir: dir });
  assert.equal(
    restarted.locals.db
      .prepare("SELECT COUNT(*) AS count FROM chat_messages")
      .get().count,
    4,
  );
  restarted.locals.db.close();
  assert.equal(
    app.locals.db.prepare("PRAGMA foreign_key_check").all().length,
    0,
  );
});

test("chat cursors, validation, rate limiting and deletion protect history", async (t) => {
  const { db, req, admin, register, event, join, send } = await setup(t);
  const alice = await register("Alice");
  const bob = await register("Bob");
  const target = await event({ entryFee: "0" });
  const keeper = await event({ entryFee: "0", title: "Keeper Event" });
  const a = await join(alice, target, "Alice");
  const b = await join(bob, keeper, "Bob");
  const route = `/entries/${a}/chat`;
  const adminRoute = `/admin/entries/${a}/chat`;
  const senderId = db
    .prepare("SELECT user_id FROM entries WHERE id = ?")
    .get(a).user_id;
  const insert = db.prepare(
    "INSERT INTO chat_messages (entry_id,sender_id,sender_role,content,created_at) VALUES (?,?,?,?,?)",
  );
  for (let i = 1; i <= 120; i++)
    insert.run(a, senderId, "player", `message ${i}`, new Date().toISOString());
  const latest = await req(route, { cookie: alice });
  assert.equal(latest.data.messages.length, 50);
  assert.equal(latest.data.messages[0].text, "message 71");
  assert.equal(latest.data.hasMore, true);
  const older = await req(`${route}?before=${latest.data.messages[0].id}`, {
    cookie: alice,
  });
  assert.equal(older.data.messages[0].text, "message 21");
  const earliest = await req(`${route}?before=${older.data.messages[0].id}`, {
    cookie: alice,
  });
  assert.equal(earliest.data.messages.length, 20);
  assert.equal(earliest.data.hasMore, false);
  const newer = await req(
    `${route}?after=${earliest.data.messages.at(-1).id}`,
    { cookie: alice },
  );
  assert.equal(newer.data.messages[0].text, "message 21");
  assert.equal(newer.data.hasMore, true);
  const fromZero = await req(`${route}?after=0`, { cookie: alice });
  assert.equal(fromZero.data.messages[0].text, "message 1");
  assert.equal(fromZero.data.hasMore, true);
  assert.equal(
    (await req(`${route}?before=bad`, { cookie: alice })).status,
    400,
  );
  assert.equal(
    (await req(`${route}?before=1&after=2`, { cookie: alice })).status,
    400,
  );
  assert.equal(
    (
      await req(`${route}/read`, {
        method: "POST",
        cookie: alice,
        body: { throughId: -1 },
      })
    ).status,
    400,
  );
  assert.equal((await send(alice, route, "   ")).status, 400);
  assert.equal((await send(alice, route, "x".repeat(2001))).status, 400);
  assert.equal((await send(alice, route, "abc\u0000def")).status, 400);
  assert.equal(
    (
      await req(route, {
        method: "POST",
        cookie: alice,
        csrf: false,
        body: { message: "hello" },
      })
    ).status,
    403,
  );

  const keepMessage = await send(
    admin,
    `/admin/entries/${b}/chat`,
    "Keep this message",
  );
  assert.equal(keepMessage.status, 201);
  const preview = (
    await req(`/admin/tournaments/${target.id}/deletion-summary`, {
      cookie: admin,
    })
  ).data.summary;
  assert.equal(preview.messageCount, 120);
  const newMessage = await send(admin, adminRoute, "New message since preview");
  assert.equal(newMessage.status, 201);
  assert.equal(
    (
      await req(`/admin/tournaments/${target.id}`, {
        method: "DELETE",
        cookie: admin,
        body: { confirmation: "DELETE", snapshot: preview.snapshot },
      })
    ).status,
    409,
  );
  const refreshed = (
    await req(`/admin/tournaments/${target.id}/deletion-summary`, {
      cookie: admin,
    })
  ).data.summary;
  assert.equal(refreshed.messageCount, 121);
  assert.equal(
    (
      await req(`/admin/tournaments/${target.id}`, {
        method: "DELETE",
        cookie: admin,
        body: { confirmation: "DELETE", snapshot: refreshed.snapshot },
      })
    ).status,
    200,
  );
  assert.equal((await req(route, { cookie: alice })).status, 404);
  assert.equal((await send(admin, adminRoute, "too late")).status, 404);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE entry_id = ?")
      .get(a).count,
    0,
  );
  assert.equal(
    (await req(`/entries/${b}/chat`, { cookie: bob })).data.messages[0].text,
    "Keep this message",
  );

  // The sender limiter is per account, and does not depend on the IP address.
  let limitResponse;
  for (let i = 0; i < 35; i++) {
    limitResponse = await send(bob, `/entries/${b}/chat`, `ping ${i}`);
    if (limitResponse.status === 429) break;
    assert.equal(limitResponse.status, 201);
  }
  assert.equal(limitResponse.status, 429);
});

test("an organizer joining a free tournament can still chat as the player", async (t) => {
  const { req, admin, event, join, send } = await setup(t);
  const tournament = await event({
    entryFee: "0",
    title: "Organizer's Own Entry",
  });
  const entry = await join(admin, tournament, "Organizer");
  const player = await send(admin, `/entries/${entry}/chat`, "As a player");
  const organizer = await send(
    admin,
    `/admin/entries/${entry}/chat`,
    "As an organizer",
  );
  assert.equal(player.data.message.senderRole, "player");
  assert.equal(organizer.data.message.senderRole, "admin");
  assert.equal(
    (await req(`/entries/${entry}/chat`, { cookie: admin })).data.messages
      .length,
    2,
  );
  assert.equal(
    (await req("/admin/chats/unread", { cookie: admin })).data.count,
    1,
  );
  assert.equal(
    (await req("/me/entries", { cookie: admin })).data.entries.find(
      (item) => item.id === entry,
    ).unreadMessages,
    1,
  );
});

test("the admin inbox pages and filters confirmed players", async (t) => {
  const { db, req, admin, event, send } = await setup(t);
  const tournament = await event({ entryFee: "0", title: "Many Players" });
  const stamp = new Date().toISOString();
  const users = db.prepare(
    "INSERT INTO users (name,email,password_hash,is_admin,created_at) VALUES (?,?,'test-only',0,?)",
  );
  const entries = db.prepare(`INSERT INTO entries
    (tournament_id,user_id,first_name,last_name,game_id,game_name,amount_paise,terms_snapshot,terms_accepted_at,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,0,'accepted',?,'approved',?,?)`);
  const ids = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let i = 0; i < 57; i++) {
      const user = Number(
        users.run(`Player ${i}`, `page${i}@chat.test`, stamp).lastInsertRowid,
      );
      ids.push(
        Number(
          entries.run(
            tournament.id,
            user,
            `Player${i}`,
            "Test",
            `id${i}`,
            `Gamer${i}`,
            stamp,
            stamp,
            stamp,
          ).lastInsertRowid,
        ),
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const first = await req(`/admin/chats?tournamentId=${tournament.id}`, {
    cookie: admin,
  });
  const second = await req(
    `/admin/chats?tournamentId=${tournament.id}&offset=50`,
    { cookie: admin },
  );
  assert.equal(first.data.threads.length, 50);
  assert.equal(first.data.hasMore, true);
  assert.equal(second.data.threads.length, 7);
  assert.equal(second.data.hasMore, false);
  assert.equal(
    new Set(
      [...first.data.threads, ...second.data.threads].map(
        (item) => item.entryId,
      ),
    ).size,
    57,
  );
  const filtered = await req(`/admin/chats?search=page17%40chat.test`, {
    cookie: admin,
  });
  assert.equal(filtered.data.threads.length, 1);
  assert.equal(filtered.data.threads[0].entryId, ids[17]);
  assert.equal(
    (await send(admin, `/admin/entries/${ids[0]}/chat`, "Server IP for you"))
      .status,
    201,
  );
  assert.equal(
    (await req("/admin/chats", { cookie: admin })).data.threads[0].entryId,
    ids[0],
  );
  assert.equal(
    (await req("/admin/chats?offset=-1", { cookie: admin })).status,
    400,
  );
});
