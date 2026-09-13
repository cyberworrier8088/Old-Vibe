CREATE TYPE "public"."currency_type" AS ENUM('paper', 'gold');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'ready_to_fulfil' BEFORE 'posted';--> statement-breakpoint
CREATE TABLE "project_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_sub" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beans_ledger" ADD COLUMN "currency" "currency_type" DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "currency" "currency_type" DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cost_currency" "currency_type" DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_coding_date" date;--> statement-breakpoint
ALTER TABLE "project_journals" ADD CONSTRAINT "project_journals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_journals" ADD CONSTRAINT "project_journals_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "project_journals_project_id_idx" ON "project_journals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_journals_user_sub_idx" ON "project_journals" USING btree ("user_sub");