import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Set it in .env.local (e.g. postgres://agro:agro@localhost:5432/agro)"
  );
}

const globalForPg = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForPg.pgClient ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
