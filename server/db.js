import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { newTicketCode } from "./security.js";

export const DEFAULT_TERMS =
  "By entering, you agree to follow the tournament rules, provide accurate player details, and accept the organizer’s decisions. Entry fees are subject to the organizer’s refund policy. Any cheating, harassment, or unfair play can result in disqualification.";
export const DEFAULT_RULES =
  "Play fair and respect every participant.\nUse the in-game details provided during registration.\nBe ready before the scheduled start time.\nThe organizer’s decision is final.";

export function openDatabase(
  dataDir = process.env.DATA_DIR || path.resolve("data"),
) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, "blueclash.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      game TEXT NOT NULL,
      category TEXT NOT NULL,
      tagline TEXT NOT NULL,
      description TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      total_slots INTEGER NOT NULL,
      entry_fee_paise INTEGER NOT NULL,
      prize_pool_paise INTEGER NOT NULL,
      cover TEXT NOT NULL,
      rules TEXT NOT NULL,
      terms TEXT NOT NULL,
      status TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      game_id TEXT NOT NULL,
      uid TEXT NOT NULL DEFAULT '',
      game_name TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      terms_snapshot TEXT NOT NULL,
      terms_accepted_at TEXT NOT NULL,
      status TEXT NOT NULL,
      hold_expires_at TEXT,
      proof_filename TEXT,
      proof_mime TEXT,
      payment_reference TEXT NOT NULL DEFAULT '',
      review_note TEXT NOT NULL DEFAULT '',
      ticket_code TEXT,
      ticket_issued_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tournament_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS entries_tournament_status ON entries(tournament_id, status);
    CREATE INDEX IF NOT EXISTS entries_user ON entries(user_id);
    CREATE INDEX IF NOT EXISTS entries_proof_filename ON entries(proof_filename) WHERE proof_filename IS NOT NULL;
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      sender_role TEXT NOT NULL CHECK(sender_role IN ('player', 'admin')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS chat_messages_entry ON chat_messages(entry_id, id);
    CREATE INDEX IF NOT EXISTS chat_messages_unread ON chat_messages(sender_role, entry_id, id) WHERE read_at IS NULL;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proof_deletion_queue (
      filename TEXT PRIMARY KEY
    );
  `);

  // Upgrade existing VPS databases in place and issue tickets for entries that
  // were already confirmed before tickets existed. The lock makes this safe
  // even if the web service and admin CLI start at the same time.
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = db.prepare("PRAGMA table_info(entries)").all();
    if (!columns.some((column) => column.name === "ticket_code")) {
      db.exec("ALTER TABLE entries ADD COLUMN ticket_code TEXT");
    }
    if (!columns.some((column) => column.name === "ticket_issued_at")) {
      db.exec("ALTER TABLE entries ADD COLUMN ticket_issued_at TEXT");
    }
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS entries_ticket_code ON entries(ticket_code) WHERE ticket_code IS NOT NULL",
    );
    const withoutTicket = db
      .prepare(
        "SELECT id, created_at, updated_at FROM entries WHERE status = 'approved' AND ticket_code IS NULL",
      )
      .all();
    const issueTicket = db.prepare(
      "UPDATE entries SET ticket_code = ?, ticket_issued_at = ? WHERE id = ? AND ticket_code IS NULL",
    );
    for (const entry of withoutTicket) {
      issueTicket.run(
        newTicketCode(),
        entry.updated_at || entry.created_at,
        entry.id,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }

  // Seed only once, even if an administrator later deletes every sample.
  if (
    !db.prepare("SELECT value FROM settings WHERE key = 'samples_seeded'").get()
  ) {
    const insert = db.prepare(`INSERT INTO tournaments
      (title, game, category, tagline, description, starts_at, mode, total_slots,
       entry_fee_paise, prize_pool_paise, cover, rules, terms, status, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, ?)`);
    const now = new Date();
    const dateInDays = (days) =>
      new Date(now.getTime() + days * 86400000).toISOString();
    const stamp = now.toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      insert.run(
        "The Ender Crown",
        "Minecraft",
        "minecraft",
        "BUILD. BATTLE. CONQUER.",
        "A world of possibilities. Put your skills to the test in a community showdown built for the bold.",
        dateInDays(12),
        "Solo",
        64,
        4900,
        1000000,
        "minecraft",
        DEFAULT_RULES,
        DEFAULT_TERMS,
        stamp,
        stamp,
      );
      insert.run(
        "Booyah Showdown",
        "Free Fire",
        "freefire",
        "DROP IN. STAND OUT.",
        "Drop into the action and bring your best game. One arena, one shot, and plenty of glory on the line.",
        dateInDays(19),
        "Squad",
        48,
        9900,
        1500000,
        "battle",
        DEFAULT_RULES,
        DEFAULT_TERMS,
        stamp,
        stamp,
      );
      insert.run(
        "Nightfall Rivals",
        "Other Games",
        "other",
        "YOUR NEXT BIG PLAY.",
        "A new arena awaits. Gather your crew, sharpen your strategy, and make every moment count.",
        dateInDays(26),
        "Duo",
        32,
        7900,
        750000,
        "neon",
        DEFAULT_RULES,
        DEFAULT_TERMS,
        stamp,
        stamp,
      );
      db.prepare(
        "INSERT INTO settings (key, value) VALUES ('samples_seeded', '1')",
      ).run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
    new Date().toISOString(),
  );
  return db;
}

export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSetting(db, key) {
  return (
    db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value || ""
  );
}

export function setSetting(db, key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
