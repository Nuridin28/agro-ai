import { NextRequest } from "next/server";
import { hashPassword, makeSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";
import { createUser, findByEmail, type UserField } from "@/lib/users-store";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { getS1Series, isSARConfigured } from "@/lib/satellite/sar";
import type { FieldPolygon } from "@/lib/satellite/types";

interface RegisterBody {
  email: string;
  password: string;
  farmName: string;
  ownerFio?: string;
  bin?: string;
  fields: UserField[];   // выбранные хозяйства/районы (передаёт фронт после lookup-farm)
}

export async function POST(req: NextRequest) {
  const ipLimit = await rateLimit("register:ip", clientIp(req), 10, 3600);
  if (!ipLimit.ok) return tooManyRequests(ipLimit);

  let body: RegisterBody;
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const farmName = (body.farmName ?? "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "Некорректный email" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Пароль минимум 8 символов" }, { status: 400 });
  }
  if (farmName.length < 3) {
    return Response.json({ error: "Название хозяйства минимум 3 символа" }, { status: 400 });
  }
  const existing = await findByEmail(email);
  if (existing) {
    return Response.json({ error: "Пользователь с таким email уже зарегистрирован" }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);
  let user;
  try {
    user = await createUser({
      email,
      farmName,
      ownerFio: body.ownerFio,
      bin: body.bin,
      passwordHash: hash,
      passwordSalt: salt,
      fields: body.fields ?? [],
    });
  } catch (e) {
    if ((e as Error).message === "EMAIL_TAKEN") {
      return Response.json({ error: "Email уже занят" }, { status: 409 });
    }
    return Response.json({ error: String(e) }, { status: 500 });
  }

  // Прогрев SAR-кеша: fire-and-forget, не блокируем ответ. К моменту, когда
  // пользователь откроется в инспекторском досье, точки уже будут в БД.
  // Только если есть полигоны и SAR настроен.
  if (isSARConfigured()) {
    // Прогреваем КАЖДЫЙ parcel — пользователь может зарегистрировать хозяйство
    // с 5-30 участками, спутник нужен по всем (или по тем, что инспектор
    // потом откроет через UI lazy-кнопку).
    const polygons: FieldPolygon[] = [];
    for (const f of user.fields ?? []) {
      for (const p of f.parcels ?? []) {
        if (p.polygon4326 && p.polygon4326.length >= 4) {
          polygons.push(p.polygon4326 as FieldPolygon);
        }
      }
      // legacy fallback
      if ((!f.parcels || f.parcels.length === 0) && f.polygon4326 && f.polygon4326.length >= 4) {
        polygons.push(f.polygon4326 as FieldPolygon);
      }
    }
    if (polygons.length > 0) {
      const now = new Date();
      const seasonYear = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      const startDate = `${seasonYear}-04-01`;
      const endDate   = `${seasonYear}-10-15`;
      // Не await-им, не пишем в res — пусть работает после ответа.
      void Promise.allSettled(polygons.map((p) =>
        getS1Series(p, startDate, endDate).catch((e) =>
          console.warn("[register] SAR warmup failed:", (e as Error).message)
        )
      ));
    }
  }

  const sessionValue = makeSessionCookieValue(user.id);
  const res = Response.json({ ok: true, userId: user.id, email: user.email });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${sessionValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  );
  return res;
}
