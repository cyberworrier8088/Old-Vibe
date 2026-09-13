DO $$ BEGIN
	CREATE TYPE "public"."currency_type" AS ENUM('paper', 'gold');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TYPE "public"."order_status" ADD VALUE 'ready_to_fulfil' BEFORE 'posted';
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_sub" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beans_ledger" ADD COLUMN IF NOT EXISTS "currency" "currency_type" DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "currency" "currency_type" DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cost_currency" "currency_type" DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_coding_date" date;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "project_journals" ADD CONSTRAINT "project_journals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "project_journals" ADD CONSTRAINT "project_journals_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE no action ON UPDATE cascade;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_journals_project_id_idx" ON "project_journals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_journals_user_sub_idx" ON "project_journals" USING btree ("user_sub");