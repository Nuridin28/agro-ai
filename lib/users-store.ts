import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { GiprozemFeature } from "./giprozem";

// JSON-файл с пользователями. Простое хранилище для прототипа.
// На проде заменить на БД (Postgres/SQLite).

export interface UserField {
  // Точный nazvxoz из ответа Гипрозема (как ключ привязки)
  nazvxoz: string;
  // ID слоя (район) Гипрозема, в котором найден участок
  layerId: number;
  layerName: string;       // ah_NN_MMM
  oblastCode: string;
  // Номер записи (порядковый), для отчётности
  parcels: number;
  // Кэш атрибутов первого участка (для быстрого отображения)
  sample: GiprozemFeature["attributes"];
  // Полигон первого участка хозяйства в формате [lon, lat][] (EPSG:4326).
  // Опционально (для старых записей до фичи может не быть). Используется
  // спутниковым модулем для NDVI-проверки.
  polygon4326?: number[][];
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  farmName: string;       // как ввёл пользователь
  ownerFio?: string;
  bin?: string;
  createdAt: string;
  fields: UserField[];    // привязанные через Гипрозем участки (один или несколько)
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

async function ensureFile(): Promise<void> {
  try { await fs.access(USERS_FILE); }
  catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(USERS_FILE, "[]", "utf8");
  }
}

async function readAll(): Promise<User[]> {
  await ensureFile();
  const raw = await fs.readFile(USERS_FILE, "utf8");
  try { return JSON.parse(raw) as User[]; } catch { return []; }
}

async function writeAll(users: User[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

export async function findByEmail(email: string): Promise<User | null> {
  const all = await readAll();
  const e = email.trim().toLowerCase();
  return all.find((u) => u.email === e) ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const all = await readAll();
  return all.find((u) => u.id === id) ?? null;
}

export async function createUser(input: Omit<User, "id" | "createdAt">): Promise<User> {
  const all = await readAll();
  const email = input.email.trim().toLowerCase();
  if (all.some((u) => u.email === email)) {
    throw new Error("EMAIL_TAKEN");
  }
  const user: User = {
    ...input,
    email,
    id: crypto.randomBytes(9).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  all.push(user);
  await writeAll(all);
  return user;
}

export async function updateUser(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User | null> {
  const all = await readAll();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeAll(all);
  return all[idx];
}
