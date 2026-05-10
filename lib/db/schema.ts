import { pgTable, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  farmName: text("farm_name").notNull(),
  ownerFio: text("owner_fio"),
  bin: text("bin"),
  fields: jsonb("fields").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    farmerId: text("farmer_id").notNull(),
    category: text("category").notNull(),
    type: text("type").notNull(),
    scope: text("scope").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull(),
    date: text("date").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    cropDeclaration: jsonb("crop_declaration"),
  },
  (t) => ({
    farmerIdx: index("applications_farmer_idx").on(t.farmerId),
    submittedIdx: index("applications_submitted_idx").on(t.submittedAt),
  })
);

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationInsert = typeof applications.$inferInsert;
