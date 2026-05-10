import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

async function main() {
  const client = postgres(url!, { max: 1 });
  const db = drizzle(client);
  console.log("[migrate] running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] done");
  await client.end();
}

main().catch((e) => {
  console.error("[migrate] failed:", e);
  process.exit(1);
});
