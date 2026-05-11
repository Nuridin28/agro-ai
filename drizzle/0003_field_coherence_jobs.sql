CREATE TABLE "field_coherence_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"field_key" text NOT NULL,
	"pair_start_date" date NOT NULL,
	"pair_end_date" date NOT NULL,
	"granule_ref" text NOT NULL,
	"granule_sec" text NOT NULL,
	"status" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"coherence_product_url" text,
	"error_message" text
);
--> statement-breakpoint
CREATE INDEX "coh_jobs_field_idx" ON "field_coherence_jobs" USING btree ("field_key","pair_end_date");--> statement-breakpoint
CREATE INDEX "coh_jobs_status_idx" ON "field_coherence_jobs" USING btree ("status");