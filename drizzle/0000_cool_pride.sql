CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"farmer_id" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"scope" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"date" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"crop_declaration" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"farm_name" text NOT NULL,
	"owner_fio" text,
	"bin" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "applications_farmer_idx" ON "applications" USING btree ("farmer_id");--> statement-breakpoint
CREATE INDEX "applications_submitted_idx" ON "applications" USING btree ("submitted_at");