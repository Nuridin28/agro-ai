import crypto from "node:crypto";

// ────────────────────────────────────────────────────────────────────────────
// Минимальная безопасная аутентификация без внешних зависимостей.
// - Хеш пароля: scrypt + соль (Node built-in)
// - Сессии: HMAC-SHA256 подписанный cookie вида `userId.signature`
//
// На проде заменить SESSION_SECRET на криптостойкое значение из env.
// ────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = "agro_session";
const SESSION_TTL_DAYS = 30;

function secret(): string {
  return process.env.SESSION_SECRET || "dev-only-not-secret-change-me";
}

// ── Пароли ──
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash: derived, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const stored = Buffer.from(hash, "hex");
    if (stored.length !== derived.length) return false;
    return crypto.timingSafeEqual(stored, derived);
  } catch {
    return false;
  }
}

// ── Сессии ──
function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function makeSessionCookieValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function parseSessionCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (sign(userId) !== sig) return null;
  return userId;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE = SESSION_TTL_DAYS * 24 * 3600;
