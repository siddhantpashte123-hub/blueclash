import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, salt, expected] = String(stored || "").split("$");
  if (
    algorithm !== "scrypt" ||
    !salt ||
    !/^[a-f0-9]{128}$/.test(expected || "")
  )
    return false;
  const actual = Buffer.from(await scrypt(password, salt, 64));
  return crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}
