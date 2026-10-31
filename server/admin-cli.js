import readline from "node:readline";
import fs from "node:fs";
import { openDatabase } from "./db.js";
import { hashPassword, normalizeEmail, validEmail } from "./security.js";

async function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

async function askPassword(prompt) {
  if (!process.stdin.isTTY)
    throw new Error(
      "A terminal is required to enter a password (or use ADMIN_PASSWORD).",
    );
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (buffer) => {
      for (const c of buffer.toString("utf8")) {
        if (c === "\u0003") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (c === "\r" || c === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else if (c >= " ") value += c;
      }
    };
    function cleanup() {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdin.on("data", onData);
  });
}

try {
  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg !== "--password-stdin");
  const email = normalizeEmail(
    process.env.ADMIN_EMAIL || emailArg || (await ask("Admin email: ")),
  );
  const password =
    process.env.ADMIN_PASSWORD ||
    (args.includes("--password-stdin")
      ? fs.readFileSync(0, "utf8").replace(/\r?\n$/, "")
      : await askPassword("Admin password (at least 10 characters): "));
  if (!validEmail(email)) throw new Error("Enter a valid email address.");
  if (password.length < 10 || password.length > 128)
    throw new Error("Password must contain 10–128 characters.");
  const db = openDatabase();
  const hash = await hashPassword(password);
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email);
  if (existing) {
    db.prepare(
      "UPDATE users SET is_admin = 1, password_hash = ? WHERE id = ?",
    ).run(hash, existing.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
    console.log(
      `Admin password updated for ${email}. Existing sessions were signed out.`,
    );
  } else {
    db.prepare(
      "INSERT INTO users (name, email, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)",
    ).run("Admin", email, hash, new Date().toISOString());
    console.log(`Admin account created for ${email}.`);
  }
  db.close();
} catch (error) {
  console.error(`Admin setup failed: ${error.message}`);
  process.exitCode = 1;
}
