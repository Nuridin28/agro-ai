import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import type { GiprozemFeature } from "./giprozem";

export interface UserField {
  nazvxoz: string;
  layerId: number;
  layerName: string;
  oblastCode: string;
  parcels: number;
  sample: GiprozemFeature["attributes"];
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
    fields: (r.fields as UserField[]) ?? [],
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
