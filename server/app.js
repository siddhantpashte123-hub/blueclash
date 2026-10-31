import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import QRCode from "qrcode";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, transaction, getSetting, setSetting } from "./db.js";
import {
  hashPassword,
  verifyPassword,
  normalizeEmail,
  validEmail,
  newSessionToken,
  sha256,
} from "./security.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const HOLD_MINUTES = 30;
const DUMMY_PASSWORD_HASH = `scrypt$00000000000000000000000000000000$${"0".repeat(128)}`;
const COVERS = {
  minecraft: "/images/minecraft-arena.webp",
  battle: "/images/battle-royale.webp",
  neon: "/images/neon-arena.webp",
};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function text(value, label, min = 1, max = 120) {
  if (typeof value !== "string")
    throw new ApiError(400, `${label} is required.`);
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new ApiError(
      400,
      `${label} must be ${min === 0 ? "at most" : `between ${min} and`} ${max} characters.`,
    );
  }
  return result;
}

function money(value, label) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(raw))
    throw new ApiError(400, `${label} must be a valid amount in rupees.`);
  const [rupees, decimal = ""] = raw.split(".");
  return Number(rupees) * 100 + Number(decimal.padEnd(2, "0"));
}

function password(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 128) {
    throw new ApiError(400, "Password must be between 10 and 128 characters.");
  }
  return value;
}

function publicUser(user) {
  return user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: Boolean(user.is_admin),
      }
    : null;
}

function readCookie(req) {
  const value = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("blueclash_session="));
  const token = value?.slice("blueclash_session=".length) || "";
  return /^[a-f0-9]{64}$/.test(token) ? token : "";
}

function sessionCookie(
  req,
  token,
  maxAge = SESSION_SECONDS,
  allowEmbed = false,
) {
  const secure =
    allowEmbed || process.env.COOKIE_SECURE === "true" || req.secure;
  // Embedded previews need a cross-site cookie; partition it to the top-level site.
  const sameSite = allowEmbed ? "None" : "Lax";
  return `blueclash_session=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure ? "; Secure" : ""}${allowEmbed ? "; Partitioned" : ""}`;
}

function settings(db) {
  const upiId = getSetting(db, "upi_id");
  const upiName = getSetting(db, "upi_name");
  return {
    upiId,
    upiName,
    supportEmail: getSetting(db, "support_email"),
    paymentConfigured: Boolean(upiId && upiName),
  };
}

const TOURNAMENT_SELECT = `SELECT t.*,
  (SELECT COUNT(*) FROM entries e WHERE e.tournament_id = t.id AND
    (e.status IN ('pending', 'approved') OR (e.status = 'awaiting_payment' AND e.hold_expires_at > ?))) AS reserved_count
  FROM tournaments t`;

function tournamentById(db, id) {
  return db
    .prepare(`${TOURNAMENT_SELECT} WHERE t.id = ?`)
    .get(new Date().toISOString(), id);
}

function tournamentDto(row, paymentConfigured) {
  const remaining = Math.max(0, row.total_slots - row.reserved_count);
  const isPast = new Date(row.starts_at).getTime() <= Date.now();
  let closedReason = "";
  if (row.is_demo)
    closedReason = "This is a sample event, not open for registration.";
  else if (row.status !== "published" || isPast)
    closedReason = "Registration is closed.";
  else if (remaining === 0) closedReason = "This tournament is full.";
  else if (row.entry_fee_paise > 0 && !paymentConfigured)
    closedReason =
      "The organizer is setting up payments. Please check back soon.";
  return {
    id: row.id,
    title: row.title,
    game: row.game,
    category: row.category,
    tagline: row.tagline,
    description: row.description,
    startsAt: row.starts_at,
    mode: row.mode,
    totalSlots: row.total_slots,
    slotsTaken: row.reserved_count,
    slotsLeft: remaining,
    entryFee: row.entry_fee_paise / 100,
    prizePool: row.prize_pool_paise / 100,
    cover: row.cover,
    image: COVERS[row.cover] || COVERS.neon,
    rules: row.rules,
    terms: row.terms,
    termsVersion: sha256(row.terms),
    status: row.status,
    isDemo: Boolean(row.is_demo),
    canJoin: !closedReason,
    closedReason,
    createdAt: row.created_at,
  };
}

const ENTRY_SELECT = `SELECT e.*, t.title AS tournament_title, t.game AS tournament_game,
  t.starts_at AS tournament_starts_at, t.mode AS tournament_mode, t.cover AS tournament_cover,
  t.status AS tournament_status, t.total_slots AS tournament_slots, u.email AS user_email, u.name AS user_name
  FROM entries e JOIN tournaments t ON t.id = e.tournament_id JOIN users u ON u.id = e.user_id`;

function entryDto(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    tournamentTitle: row.tournament_title,
    game: row.tournament_game,
    startsAt: row.tournament_starts_at,
    mode: row.tournament_mode,
    image: COVERS[row.tournament_cover] || COVERS.neon,
    firstName: row.first_name,
    lastName: row.last_name,
    gameId: row.game_id,
    uid: row.uid,
    gameName: row.game_name,
    amount: row.amount_paise / 100,
    status: row.status,
    holdExpiresAt: row.hold_expires_at,
    holdExpired: Boolean(
      row.hold_expires_at && new Date(row.hold_expires_at) <= new Date(),
    ),
    paymentReference: row.payment_reference,
    reviewNote: row.review_note,
    hasProof: Boolean(row.proof_filename),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateTournament(body) {
  const title = text(body.title, "Tournament title", 3, 100);
  const game = text(body.game, "Game", 2, 60);
  const category = text(body.category, "Game category");
  const tagline = text(body.tagline, "Short tagline", 1, 90);
  const description = text(body.description, "Description", 10, 3000);
  const mode = text(body.mode, "Mode", 2, 30);
  const rules = text(body.rules, "Rules", 10, 5000);
  const terms = text(body.terms, "Terms and conditions", 10, 5000);
  const cover = text(body.cover, "Cover");
  const status = text(body.status, "Status");
  if (!["minecraft", "freefire", "other"].includes(category))
    throw new ApiError(400, "Choose a valid game category.");
  if (!Object.hasOwn(COVERS, cover))
    throw new ApiError(400, "Choose a valid cover.");
  if (!["draft", "published", "completed"].includes(status))
    throw new ApiError(400, "Choose a valid status.");
  const starts = new Date(body.startsAt);
  if (!body.startsAt || Number.isNaN(starts.getTime()))
    throw new ApiError(400, "Choose a valid start date and time.");
  const totalSlots = Number(body.totalSlots);
  if (!Number.isInteger(totalSlots) || totalSlots < 1 || totalSlots > 100000)
    throw new ApiError(400, "Slots must be between 1 and 100,000.");
  return {
    title,
    game,
    category,
    tagline,
    description,
    startsAt: starts.toISOString(),
    mode,
    totalSlots,
    entryFee: money(body.entryFee, "Entry fee"),
    prizePool: money(body.prizePool, "Prize pool"),
    cover,
    rules,
    terms,
    status,
  };
}

function validateImage(buffer) {
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { ext: "png", mime: "image/png" };
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return { ext: "jpg", mime: "image/jpeg" };
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return { ext: "webp", mime: "image/webp" };
  return null;
}

export function createApp(options = {}) {
  const dataDir = path.resolve(
    options.dataDir || process.env.DATA_DIR || path.join(ROOT, "data"),
  );
  const db = openDatabase(dataDir);
  const uploadDir = path.join(dataDir, "uploads");
  const app = express();
  app.locals.db = db;
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
  const allowEmbed =
    options.allowEmbed ?? process.env.BLUECLASH_ALLOW_EMBED === "true";
  app.use(
    helmet({
      // Keep clickjacking protection in production; opt in only for a trusted embedded preview.
      contentSecurityPolicy: {
        directives: {
          "upgrade-insecure-requests": null,
          ...(allowEmbed ? { "frame-ancestors": null } : {}),
        },
      },
      xFrameOptions: allowEmbed ? false : undefined,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    // A cross-site HTML form cannot send this header; cross-origin fetch is not allowed by CORS.
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("X-Requested-With") !== "BlueClash"
    ) {
      return res.status(403).json({ error: "Invalid request." });
    }
    const token = readCookie(req);
    req.sessionToken = token;
    req.user = token
      ? db
          .prepare(
            `SELECT u.id, u.name, u.email, u.is_admin FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
          )
          .get(sha256(token), new Date().toISOString())
      : null;
    next();
  });

  const requireUser = (req, _res, next) =>
    req.user ? next() : next(new ApiError(401, "Please sign in first."));
  const requireAdmin = (req, _res, next) =>
    req.user?.is_admin
      ? next()
      : next(new ApiError(req.user ? 403 : 401, "Admin access required."));
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json({ error: "Too many attempts. Please try again later." }),
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
  });

  function startSession(req, res, userId) {
    if (req.sessionToken)
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
        sha256(req.sessionToken),
      );
    const token = newSessionToken();
    db.prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    ).run(
      sha256(token),
      userId,
      new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
    );
    res.setHeader(
      "Set-Cookie",
      sessionCookie(req, token, SESSION_SECONDS, allowEmbed),
    );
  }

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/me", (req, res) =>
    res.json({
      user: publicUser(req.user),
      supportEmail: settings(db).supportEmail,
    }),
  );

  app.post("/api/auth/register", authLimiter, async (req, res) => {
    const name = text(req.body?.name, "Name", 2, 80);
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email))
      throw new ApiError(400, "Enter a valid email address.");
    const pass = password(req.body?.password);
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email))
      throw new ApiError(
        409,
        "An account with this email already exists. Sign in instead.",
      );
    const hash = await hashPassword(pass);
    let result;
    try {
      result = db
        .prepare(
          "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(name, email, hash, new Date().toISOString());
    } catch (error) {
      if (String(error.message).includes("UNIQUE"))
        throw new ApiError(
          409,
          "An account with this email already exists. Sign in instead.",
        );
      throw error;
    }
    startSession(req, res, Number(result.lastInsertRowid));
    res.status(201).json({
      user: {
        id: Number(result.lastInsertRowid),
        name,
        email,
        isAdmin: false,
      },
    });
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const pass =
      typeof req.body?.password === "string" && req.body.password.length <= 128
        ? req.body.password
        : "";
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const matches = await verifyPassword(
      pass,
      user?.password_hash || DUMMY_PASSWORD_HASH,
    );
    if (!user || !matches)
      throw new ApiError(401, "Incorrect email or password.");
    startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.sessionToken)
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
        sha256(req.sessionToken),
      );
    res.setHeader("Set-Cookie", sessionCookie(req, "", 0, allowEmbed));
    res.json({ ok: true });
  });

  app.get("/api/tournaments", (_req, res) => {
    const pay = settings(db).paymentConfigured;
    const rows = db
      .prepare(
        `${TOURNAMENT_SELECT} WHERE t.status IN ('published', 'completed') ORDER BY t.is_demo ASC, t.starts_at ASC`,
      )
      .all(new Date().toISOString());
    res.json({ tournaments: rows.map((row) => tournamentDto(row, pay)) });
  });

  app.get("/api/tournaments/:id", (req, res) => {
    const row = tournamentById(db, req.params.id);
    if (!row || (row.status === "draft" && !req.user?.is_admin))
      throw new ApiError(404, "Tournament not found.");
    const mine = req.user
      ? db
          .prepare(
            "SELECT id, status FROM entries WHERE tournament_id = ? AND user_id = ?",
          )
          .get(row.id, req.user.id)
      : null;
    res.json({
      tournament: tournamentDto(row, settings(db).paymentConfigured),
      myEntry: mine || null,
    });
  });

  app.post("/api/tournaments/:id/entries", requireUser, (req, res) => {
    const firstName = text(req.body?.firstName, "First name", 1, 60);
    const lastName = text(req.body?.lastName, "Last name", 1, 60);
    const gameId = text(req.body?.gameId, "In-game ID", 1, 100);
    const uid = text(req.body?.uid ?? "", "UID", 0, 100);
    const gameName = text(req.body?.gameName, "In-game name", 1, 100);
    if (req.body?.acceptTerms !== true)
      throw new ApiError(400, "Please accept the terms and conditions.");
    const now = new Date().toISOString();
    const result = transaction(db, () => {
      const row = tournamentById(db, req.params.id);
      if (!row) throw new ApiError(404, "Tournament not found.");
      const current = db
        .prepare(
          "SELECT id, status, hold_expires_at, amount_paise FROM entries WHERE tournament_id = ? AND user_id = ?",
        )
        .get(row.id, req.user.id);
      if (
        current &&
        ["pending", "approved", "rejected"].includes(current.status)
      )
        return { id: current.id, status: current.status, existing: true };
      const dto = tournamentDto(row, settings(db).paymentConfigured);
      if (req.body?.termsVersion !== dto.termsVersion)
        throw new ApiError(
          409,
          "The terms have changed. Please review and accept them again.",
        );
      if (
        row.is_demo ||
        row.status !== "published" ||
        new Date(row.starts_at).getTime() <= Date.now()
      )
        throw new ApiError(409, dto.closedReason || "Registration is closed.");
      if (
        (current?.amount_paise ?? row.entry_fee_paise) > 0 &&
        !settings(db).paymentConfigured
      )
        throw new ApiError(
          409,
          "The organizer is setting up payments. Please check back soon.",
        );
      const hasLiveHold =
        current?.status === "awaiting_payment" && current.hold_expires_at > now;
      if (!hasLiveHold && dto.slotsLeft <= 0)
        throw new ApiError(409, "Sorry, this tournament is full.");
      const status =
        current?.status ||
        (row.entry_fee_paise === 0 ? "approved" : "awaiting_payment");
      const expires =
        status === "awaiting_payment"
          ? new Date(Date.now() + HOLD_MINUTES * 60000).toISOString()
          : null;
      if (current) {
        // Keep the original amount if a player returns to an existing checkout.
        db.prepare(
          `UPDATE entries SET first_name=?, last_name=?, game_id=?, uid=?, game_name=?, terms_snapshot=?,
          terms_accepted_at=?, hold_expires_at=?, updated_at=? WHERE id=?`,
        ).run(
          firstName,
          lastName,
          gameId,
          uid,
          gameName,
          row.terms,
          now,
          expires,
          now,
          current.id,
        );
        return { id: current.id, status: current.status, existing: true };
      }
      const insert = db
        .prepare(
          `INSERT INTO entries
        (tournament_id, user_id, first_name, last_name, game_id, uid, game_name, amount_paise, terms_snapshot,
         terms_accepted_at, status, hold_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          req.user.id,
          firstName,
          lastName,
          gameId,
          uid,
          gameName,
          row.entry_fee_paise,
          row.terms,
          now,
          status,
          expires,
          now,
          now,
        );
      return { id: Number(insert.lastInsertRowid), status, existing: false };
    });
    res.status(result.existing ? 200 : 201).json({ entry: result });
  });

  app.get("/api/me/entries", requireUser, (req, res) => {
    const rows = db
      .prepare(`${ENTRY_SELECT} WHERE e.user_id = ? ORDER BY e.created_at DESC`)
      .all(req.user.id);
    res.json({ entries: rows.map(entryDto) });
  });

  app.get("/api/entries/:id", requireUser, async (req, res) => {
    const row = db
      .prepare(`${ENTRY_SELECT} WHERE e.id = ? AND e.user_id = ?`)
      .get(req.params.id, req.user.id);
    if (!row) throw new ApiError(404, "Entry not found.");
    const payment = settings(db);
    let qrCode = null;
    let upiUri = null;
    if (
      row.amount_paise > 0 &&
      payment.paymentConfigured &&
      ["awaiting_payment", "rejected"].includes(row.status)
    ) {
      const params = new URLSearchParams({
        pa: payment.upiId,
        pn: payment.upiName,
        am: (row.amount_paise / 100).toFixed(2),
        cu: "INR",
        tn: `BlueClash entry ${row.id}`,
      });
      upiUri = `upi://pay?${params}`;
      qrCode = await QRCode.toDataURL(upiUri, {
        margin: 2,
        width: 280,
        color: { dark: "#101629", light: "#ffffff" },
      });
    }
    res.json({
      entry: entryDto(row),
      payment: {
        configured: payment.paymentConfigured,
        upiId: payment.upiId,
        upiName: payment.upiName,
        qrCode,
        upiUri,
        supportEmail: payment.supportEmail,
      },
    });
  });

  app.post("/api/entries/:id/hold", requireUser, (req, res) => {
    const result = transaction(db, () => {
      const row = db
        .prepare(`${ENTRY_SELECT} WHERE e.id = ? AND e.user_id = ?`)
        .get(req.params.id, req.user.id);
      if (!row) throw new ApiError(404, "Entry not found.");
      if (row.status !== "awaiting_payment")
        throw new ApiError(409, "This entry cannot be reserved again.");
      const tournament = tournamentById(db, row.tournament_id);
      if (
        tournament.status !== "published" ||
        tournament.is_demo ||
        new Date(tournament.starts_at).getTime() <= Date.now()
      )
        throw new ApiError(409, "Registration is closed.");
      if (row.hold_expires_at > new Date().toISOString()) return entryDto(row);
      if (
        tournamentDto(tournament, settings(db).paymentConfigured).slotsLeft <= 0
      )
        throw new ApiError(
          409,
          "There are no spots left. If you already paid, submit your screenshot for the organizer to review.",
        );
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + HOLD_MINUTES * 60000).toISOString();
      db.prepare(
        "UPDATE entries SET hold_expires_at = ?, updated_at = ? WHERE id = ?",
      ).run(expires, now, row.id);
      return { ...entryDto(row), holdExpiresAt: expires, holdExpired: false };
    });
    res.json({ entry: result });
  });

  app.post(
    "/api/entries/:id/proof",
    requireUser,
    upload.single("screenshot"),
    (req, res) => {
      const row = db
        .prepare(`${ENTRY_SELECT} WHERE e.id = ? AND e.user_id = ?`)
        .get(req.params.id, req.user.id);
      if (!row) throw new ApiError(404, "Entry not found.");
      if (
        !["awaiting_payment", "rejected"].includes(row.status) ||
        row.amount_paise <= 0
      )
        throw new ApiError(
          409,
          "Payment proof cannot be submitted for this entry.",
        );
      if (!req.file)
        throw new ApiError(400, "Please select a payment screenshot.");
      const type = validateImage(req.file.buffer);
      if (!type) throw new ApiError(400, "Upload a PNG, JPEG, or WebP image.");
      const reference = text(
        req.body?.reference ?? "",
        "Transaction reference",
        0,
        100,
      );
      const filename = `${crypto.randomBytes(24).toString("hex")}.${type.ext}`;
      const destination = path.join(uploadDir, filename);
      fs.writeFileSync(destination, req.file.buffer, {
        mode: 0o600,
        flag: "wx",
      });
      try {
        db.prepare(
          `UPDATE entries SET proof_filename=?, proof_mime=?, payment_reference=?, status='pending',
        review_note='', updated_at=? WHERE id=?`,
        ).run(filename, type.mime, reference, new Date().toISOString(), row.id);
      } catch (error) {
        fs.unlinkSync(destination);
        throw error;
      }
      if (row.proof_filename)
        fs.rmSync(path.join(uploadDir, path.basename(row.proof_filename)), {
          force: true,
        });
      res.json({ entry: { id: row.id, status: "pending" } });
    },
  );

  app.get("/api/admin/overview", requireAdmin, (_req, res) => {
    const count = (sql) => db.prepare(sql).get().count;
    res.json({
      stats: {
        published: count(
          "SELECT COUNT(*) AS count FROM tournaments WHERE status = 'published' AND is_demo = 0",
        ),
        pending: count(
          "SELECT COUNT(*) AS count FROM entries WHERE status = 'pending'",
        ),
        approved: count(
          "SELECT COUNT(*) AS count FROM entries WHERE status = 'approved'",
        ),
        players: count(
          "SELECT COUNT(*) AS count FROM users WHERE is_admin = 0",
        ),
      },
    });
  });

  app.get("/api/admin/tournaments", requireAdmin, (_req, res) => {
    const rows = db
      .prepare(`${TOURNAMENT_SELECT} ORDER BY t.created_at DESC`)
      .all(new Date().toISOString());
    res.json({
      tournaments: rows.map((row) =>
        tournamentDto(row, settings(db).paymentConfigured),
      ),
    });
  });

  app.post("/api/admin/tournaments", requireAdmin, (req, res) => {
    const t = validateTournament(req.body || {});
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO tournaments (title, game, category, tagline, description, starts_at, mode,
      total_slots, entry_fee_paise, prize_pool_paise, cover, rules, terms, status, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        t.title,
        t.game,
        t.category,
        t.tagline,
        t.description,
        t.startsAt,
        t.mode,
        t.totalSlots,
        t.entryFee,
        t.prizePool,
        t.cover,
        t.rules,
        t.terms,
        t.status,
        now,
        now,
      );
    res.status(201).json({
      tournament: tournamentDto(
        tournamentById(db, Number(result.lastInsertRowid)),
        settings(db).paymentConfigured,
      ),
    });
  });

  app.put("/api/admin/tournaments/:id", requireAdmin, (req, res) => {
    const t = validateTournament(req.body || {});
    const result = transaction(db, () => {
      const previous = tournamentById(db, req.params.id);
      if (!previous) throw new ApiError(404, "Tournament not found.");
      if (t.totalSlots < previous.reserved_count)
        throw new ApiError(
          409,
          `Slots cannot be fewer than the ${previous.reserved_count} currently reserved.`,
        );
      const isDemo = previous.is_demo && req.body?.makeReal !== true ? 1 : 0;
      db.prepare(
        `UPDATE tournaments SET title=?, game=?, category=?, tagline=?, description=?, starts_at=?, mode=?, total_slots=?,
        entry_fee_paise=?, prize_pool_paise=?, cover=?, rules=?, terms=?, status=?, is_demo=?, updated_at=? WHERE id=?`,
      ).run(
        t.title,
        t.game,
        t.category,
        t.tagline,
        t.description,
        t.startsAt,
        t.mode,
        t.totalSlots,
        t.entryFee,
        t.prizePool,
        t.cover,
        t.rules,
        t.terms,
        t.status,
        isDemo,
        new Date().toISOString(),
        previous.id,
      );
      return tournamentById(db, previous.id);
    });
    res.json({
      tournament: tournamentDto(result, settings(db).paymentConfigured),
    });
  });

  app.delete("/api/admin/tournaments/:id", requireAdmin, (req, res) => {
    const row = tournamentById(db, req.params.id);
    if (!row) throw new ApiError(404, "Tournament not found.");
    if (
      db
        .prepare("SELECT 1 FROM entries WHERE tournament_id = ? LIMIT 1")
        .get(row.id)
    )
      throw new ApiError(
        409,
        "This tournament has entries. Mark it completed instead to preserve their records.",
      );
    db.prepare("DELETE FROM tournaments WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  app.get("/api/admin/entries", requireAdmin, (req, res) => {
    const allowed = ["pending", "approved", "rejected", "awaiting_payment"];
    const selected =
      typeof req.query.status === "string" ? req.query.status : "";
    if (selected && !allowed.includes(selected))
      throw new ApiError(400, "Invalid entry status.");
    const rows = selected
      ? db
          .prepare(
            `${ENTRY_SELECT} WHERE e.status = ? ORDER BY e.updated_at DESC`,
          )
          .all(selected)
      : db.prepare(`${ENTRY_SELECT} ORDER BY e.updated_at DESC`).all();
    res.json({
      entries: rows.map((row) => ({
        ...entryDto(row),
        email: row.user_email,
        accountName: row.user_name,
      })),
    });
  });

  app.get("/api/admin/entries/:id/proof", requireAdmin, (req, res) => {
    const row = db
      .prepare("SELECT proof_filename, proof_mime FROM entries WHERE id = ?")
      .get(req.params.id);
    if (
      !row?.proof_filename ||
      !/^[a-f0-9]{48}\.(png|jpg|webp)$/.test(row.proof_filename)
    )
      throw new ApiError(404, "Screenshot not found.");
    const file = path.join(uploadDir, row.proof_filename);
    if (!fs.existsSync(file)) throw new ApiError(404, "Screenshot not found.");
    res.set("Content-Type", row.proof_mime);
    res.set("Content-Disposition", "inline");
    res.sendFile(file);
  });

  app.post("/api/admin/entries/:id/review", requireAdmin, (req, res) => {
    const action = req.body?.action;
    if (!["approve", "reject"].includes(action))
      throw new ApiError(400, "Choose approve or reject.");
    const note = text(req.body?.note ?? "", "Review note", 0, 500);
    transaction(db, () => {
      const row = db
        .prepare(`${ENTRY_SELECT} WHERE e.id = ?`)
        .get(req.params.id);
      if (!row) throw new ApiError(404, "Entry not found.");
      if (row.status !== "pending")
        throw new ApiError(409, "Only pending entries can be reviewed.");
      if (action === "approve") {
        const approved = db
          .prepare(
            "SELECT COUNT(*) AS count FROM entries WHERE tournament_id = ? AND status = 'approved'",
          )
          .get(row.tournament_id).count;
        if (approved >= row.tournament_slots)
          throw new ApiError(
            409,
            "All spots are already approved. Review this payment manually.",
          );
      }
      db.prepare(
        "UPDATE entries SET status = ?, review_note = ?, updated_at = ? WHERE id = ?",
      ).run(
        action === "approve" ? "approved" : "rejected",
        note,
        new Date().toISOString(),
        row.id,
      );
    });
    res.json({ ok: true });
  });

  app.get("/api/admin/settings", requireAdmin, (_req, res) =>
    res.json({ settings: settings(db) }),
  );
  app.put("/api/admin/settings", requireAdmin, (req, res) => {
    const upiId = text(req.body?.upiId ?? "", "UPI ID", 0, 150).toLowerCase();
    const upiName = text(req.body?.upiName ?? "", "Payee name", 0, 80);
    const supportEmail = normalizeEmail(req.body?.supportEmail);
    if (upiId && !/^[a-z0-9._-]{2,100}@[a-z0-9.-]{2,50}$/i.test(upiId))
      throw new ApiError(400, "Enter a valid UPI ID, for example name@bank.");
    if (Boolean(upiId) !== Boolean(upiName))
      throw new ApiError(
        400,
        "Enter both a UPI ID and payee name, or clear both.",
      );
    if (supportEmail && !validEmail(supportEmail))
      throw new ApiError(400, "Enter a valid support email.");
    transaction(db, () => {
      setSetting(db, "upi_id", upiId);
      setSetting(db, "upi_name", upiName);
      setSetting(db, "support_email", supportEmail);
    });
    res.json({ settings: settings(db) });
  });

  app.use("/api", (_req, _res, next) =>
    next(new ApiError(404, "API route not found.")),
  );
  const distDir = path.join(ROOT, "dist");
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (!["GET", "HEAD"].includes(req.method) || path.extname(req.path))
        return next();
      res.sendFile(path.join(distDir, "index.html"));
    });
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError)
      return res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Screenshot must be 5 MB or smaller."
            : "Invalid screenshot upload.",
      });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "Request is too large." });
    if (error instanceof SyntaxError && error.status === 400)
      return res.status(400).json({ error: "Invalid request body." });
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({
      error:
        status >= 500
          ? "Something went wrong. Please try again."
          : error.message,
    });
  });
  return app;
}
