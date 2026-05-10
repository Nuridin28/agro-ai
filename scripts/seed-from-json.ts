// One-time import of legacy data/*.json into Postgres.
// Idempotent: skips rows that already exist (by id / email).
import fs from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { users, applications } from "../lib/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[seed] DATABASE_URL is not set");
  process.exit(1);
}

const DATA_DIR = path.resolve(process.cwd(), "data");

async function readJson<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function main() {
  const client = postgres(url!, { max: 1 });
  const db = drizzle(client);

  const usersJson = await readJson<any>("users.json");
  const appsJson = await readJson<any>("applications.json");

  let importedUsers = 0;
  for (const u of usersJson) {
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.id, u.id)).limit(1);
    if (exists.length > 0) continue;
    await db.insert(users).values({
      id: u.id,
      email: String(u.email).toLowerCase(),
      passwordHash: u.passwordHash,
      passwordSalt: u.passwordSalt,
      farmName: u.farmName,
      ownerFio: u.ownerFio ?? null,
      bin: u.bin ?? null,
      fields: u.fields ?? [],
      createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
    });
    importedUsers++;
  }

  let importedApps = 0;
  for (const a of appsJson) {
    const exists = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, a.id))
      .limit(1);
    if (exists.length > 0) continue;
    await db.insert(applications).values({
      id: a.id,
      farmerId: a.farmerId,
      category: a.category,
      type: a.type,
      scope: a.scope,
      amount: a.amount,
      status: a.status,
      date: a.date,
      submittedAt: a.submittedAt ? new Date(a.submittedAt) : new Date(),
      cropDeclaration: a.cropDeclaration ?? null,
    });
    importedApps++;
  }

  console.log(`[seed] imported ${importedUsers} users, ${importedApps} applications`);
  await client.end();
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
