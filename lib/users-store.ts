import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import type { GiprozemFeature } from "./giprozem";

// Один participated участок (parcel) внутри Гипрозем-слоя. У хозяйства может
// быть до десятков-сотен таких parcel'ов в одном районе. У каждого свой
// контур, своя агрохимия (если Гипрозем отдал per-feature), свои координаты.
export interface Parcel {
  polygon4326: number[][];                              // outer ring [lng, lat][]
  sample?: GiprozemFeature["attributes"];               // per-parcel агрохимия
  cadastralNumber?: string;                              // если есть в attributes
}

export interface UserField {
  nazvxoz: string;
  layerId: number;
  layerName: string;
  oblastCode: string;
  parcels: Parcel[];                                    // ВСЕ участки хозяйства в районе
  sample: GiprozemFeature["attributes"];                // агрегат для хозяйства-в-районе
  // legacy-поле: один полигон (первый parcel) — оставлено для backward compat
  // со старыми записями в БД. Новый код должен читать parcels[].
  polygon4326?: number[][];
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  farmName: string;
  ownerFio?: string;
  bin?: string;
  createdAt: string;
  fields: UserField[];
}

type Row = typeof users.$inferSelect;

// Конвертирует UserField старой схемы (parcels: number + один polygon4326)
// в новую (parcels: Parcel[]). Идемпотентно — если уже массив, отдаём как есть.
function normalizeUserField(f: unknown): UserField {
  const raw = f as Partial<UserField> & { parcels?: number | Parcel[]; polygon4326?: number[][] };
  // Уже новая схема
  if (Array.isArray(raw.parcels)) {
    return raw as UserField;
  }
  // Старая схема: parcels — число, есть один polygon4326. Создаём массив с
  // одним parcel'ом (как минимум сохранится тот контур, что мы знали).
  const legacyPolygon = raw.polygon4326;
  const parcels: Parcel[] = legacyPolygon && legacyPolygon.length >= 4
    ? [{ polygon4326: legacyPolygon, sample: raw.sample }]
    : [];
  return {
    nazvxoz: raw.nazvxoz ?? "",
    layerId: raw.layerId ?? 0,
    layerName: raw.layerName ?? "",
    oblastCode: raw.oblastCode ?? "",
    parcels,
    sample: raw.sample ?? ({} as GiprozemFeature["attributes"]),
    polygon4326: raw.polygon4326,
  };
}

function rowToUser(r: Row): User {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.passwordHash,
    passwordSalt: r.passwordSalt,
    farmName: r.farmName,
    ownerFio: r.ownerFio ?? undefined,
    bin: r.bin ?? undefined,
    createdAt: r.createdAt.toISOString(),
    fields: ((r.fields as unknown[]) ?? []).map(normalizeUserField),
  };
}

export async function findByEmail(email: string): Promise<User | null> {
  const e = email.trim().toLowerCase();
  const rows = await db.select().from(users).where(eq(users.email, e)).limit(1);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function findById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getAllUsers(): Promise<User[]> {
  const rows = await db.select().from(users);
  return rows.map(rowToUser);
}

export async function createUser(input: Omit<User, "id" | "createdAt">): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const existing = await findByEmail(email);
  if (existing) throw new Error("EMAIL_TAKEN");

  const id = crypto.randomBytes(9).toString("hex");
  const [row] = await db
    .insert(users)
    .values({
      id,
      email,
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      farmName: input.farmName,
      ownerFio: input.ownerFio ?? null,
      bin: input.bin ?? null,
      fields: input.fields,
    })
    .returning();
  return rowToUser(row);
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<User, "id" | "createdAt">>
): Promise<User | null> {
  const update: Partial<typeof users.$inferInsert> = {};
  if (patch.email !== undefined) update.email = patch.email.trim().toLowerCase();
  if (patch.passwordHash !== undefined) update.passwordHash = patch.passwordHash;
  if (patch.passwordSalt !== undefined) update.passwordSalt = patch.passwordSalt;
  if (patch.farmName !== undefined) update.farmName = patch.farmName;
  if (patch.ownerFio !== undefined) update.ownerFio = patch.ownerFio ?? null;
  if (patch.bin !== undefined) update.bin = patch.bin ?? null;
  if (patch.fields !== undefined) update.fields = patch.fields;

  if (Object.keys(update).length === 0) return findById(id);

  const [row] = await db.update(users).set(update).where(eq(users.id, id)).returning();
  return row ? rowToUser(row) : null;
}
