import { cookies } from "next/headers";
import { parseSessionCookie, SESSION_COOKIE_NAME } from "./auth";
import { findById, type User } from "./users-store";

// Серверный helper — извлекает текущего пользователя из cookie.
// Используется в server-компонентах farmer-страниц.

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = parseSessionCookie(raw);
  if (!userId) return null;
  return findById(userId);
}
