import { NextRequest } from "next/server";
import { verifyPassword, makeSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";
import { findByEmail } from "@/lib/users-store";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  let body: { email: string; password: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  // Брутфорс-защита: лимит на email и на IP отдельно.
  const ipLimit = await rateLimit("login:ip", clientIp(req), 20, 900);
  if (!ipLimit.ok) return tooManyRequests(ipLimit);
  if (email) {
    const emailLimit = await rateLimit("login:email", email, 5, 900);
    if (!emailLimit.ok) return tooManyRequests(emailLimit);
  }

  const user = await findByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return Response.json({ error: "Неверный email или пароль" }, { status: 401 });
  }
  const sessionValue = makeSessionCookieValue(user.id);
  const res = Response.json({ ok: true, userId: user.id, farmName: user.farmName });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${sessionValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  );
  return res;
}
