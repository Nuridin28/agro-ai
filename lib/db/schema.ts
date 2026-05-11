import { pgTable, text, timestamp, jsonb, integer, real, date, index, uniqueIndex } from "drizzle-orm/pg-core";

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

// SAR/NDVI наблюдения по полигону — кеш Sentinel Hub Statistical API.
// Заполняется по запросу на просмотр досье + батчем через /api/satellite/sar/refresh.
// fieldKey = sha1 от полигона (стабильный идентификатор геометрии без БД-foreign-key
// на users.fields[], которые лежат в JSON).
export const fieldSarObservations = pgTable(
  "field_sar_observations",
  {
    id: text("id").primaryKey(),                     // {fieldKey}|{date}|{source}
    fieldKey: text("field_key").notNull(),
    observationDate: date("observation_date").notNull(),
    source: text("source").notNull(),                // 's1_grd' | 's2_ndvi' (future-proof)
    vvDb: real("vv_db"),                              // Sentinel-1 VV backscatter в дБ
    vhDb: real("vh_db"),                              // Sentinel-1 VH backscatter в дБ
    ndvi: real("ndvi"),                               // оставляем для будущей миграции NDVI в БД
    coherence: real("coherence"),                     // interferometric γ ∈ [0..1] (source='s1_coherence')
    sampleCount: integer("sample_count"),             // сколько пикселей участвовало в усреднении
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fieldIdx: index("sar_obs_field_idx").on(t.fieldKey, t.observationDate),
    uniqObs: uniqueIndex("sar_obs_uniq").on(t.fieldKey, t.observationDate, t.source),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationInsert = typeof applications.$inferInsert;
export type FieldSarObservationRow = typeof fieldSarObservations.$inferSelect;
export type FieldSarObservationInsert = typeof fieldSarObservations.$inferInsert;
