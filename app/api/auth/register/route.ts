import { NextRequest } from "next/server";
import { hashPassword, makeSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";
import { createUser, findByEmail, type UserField } from "@/lib/users-store";

interface RegisterBody {
  email: string;
  password: string;
  farmName: string;
  ownerFio?: string;
  bin?: string;
  fields: UserField[];   // выбранные хозяйства/районы (передаёт фронт после lookup-farm)
}

export async function POST(req: NextRequest) {
  let body: RegisterBody;
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const farmName = (body.farmName ?? "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "Некорректный email" }, { status: 400 });
  }
  if (password.length < 6) {
    return Response.json({ error: "Пароль минимум 6 символов" }, { status: 400 });
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

  const sessionValue = makeSessionCookieValue(user.id);
  const res = Response.json({ ok: true, userId: user.id, email: user.email });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${sessionValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  );
  return res;
}
