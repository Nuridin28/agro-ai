import { findFarmer, FARMERS } from "./mock/farmers";
import type { Farmer } from "./types";
import { getCurrentUser } from "./get-current-user";
import type { User } from "./users-store";
import { OBLAST_NAMES, findLayer } from "./giprozem-catalog";

// Резолвим активного фермера для farmer-страниц.
// Приоритет: ?as=F-XXX (демо) > вошедший пользователь > редирект на /login
//
// Возвращаем единый объект, у которого UI берёт «человеческие» поля
// (название, регион, координаты), не зная — это мок или реальный пользователь.

export type FarmerSession =
  | { kind: "demo"; farmer: Farmer; userId: null }
  | { kind: "real"; user: User; farmer: Farmer; userId: string };

export interface FarmerSessionLookup {
  session: FarmerSession | null;
  isDemo: boolean;
  redirectTo?: string;
}

// Старая публичная функция (синхронная) для совместимости с теми страницами,
// которые ещё не используют user-сессию. Используется только в демо-режиме.
export function resolveFarmer(asParam?: string | null): Farmer {
  if (asParam) {
    const f = findFarmer(asParam);
    if (f) return f;
  }
  return FARMERS[0];
}

export function farmerQuery(farmerId: string): string {
  return `?as=${encodeURIComponent(farmerId)}`;
}

// Новая — учитывает реального вошедшего пользователя.
// Возвращает «совместимый» Farmer, чтобы существующий UI работал без изменений.
export async function resolveFarmerSession(asParam?: string | null): Promise<FarmerSession | null> {
  if (asParam) {
    const f = findFarmer(asParam);
    if (f) return { kind: "demo", farmer: f, userId: null };
  }
  const user = await getCurrentUser();
  if (!user) return null;
  return { kind: "real", user, farmer: userToFarmer(user), userId: user.id };
}

// Превращает зарегистрированного пользователя в объект Farmer для совместимости.
function userToFarmer(u: User): Farmer {
  const first = u.fields[0];
  const layer = first ? findLayer(first.layerId) : null;
  const oblast = first ? OBLAST_NAMES[first.oblastCode] ?? first.oblastCode : "—";
  // Используем для региона КАТО=oblastCode·layerId (псевдо), чтобы все downstream-функции работали.
  // Для реального API лучше — сохранять КАТО при регистрации, но в Гипрозем его нет → пока примерно.
  return {
    id: `U-${u.id}`,
    legalName: u.farmName,
    ownerFio: u.ownerFio || u.email,
    bin: u.bin || "—",
    sector: "crop",
    region: {
      oblast,
      rayon: layer?.name ?? "—",
      katoCode: `${first?.oblastCode ?? "00"}${first?.layerId ?? "0"}00`,
    },
    registeredAt: u.createdAt.slice(0, 10),
    source: { source: "QOLDAU", docId: `USER-${u.id}`, fetchedAt: u.createdAt },
  };
}
