CREATE TABLE "field_sar_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"field_key" text NOT NULL,
	"observation_date" date NOT NULL,
	"source" text NOT NULL,
	"vv_db" real,
	"vh_db" real,
	"ndvi" real,
	"sample_count" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sar_obs_field_idx" ON "field_sar_observations" USING btree ("field_key","observation_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sar_obs_uniq" ON "field_sar_observations" USING btree ("field_key","observation_date","source");