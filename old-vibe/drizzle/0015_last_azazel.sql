CREATE TYPE "public"."moderation_kind" AS ENUM('temp_ban', 'permanent_ban', 'lifted');--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_sub" text NOT NULL,
	"issued_by" text NOT NULL,
	"kind" "moderation_kind" NOT NULL,
	"reason" text NOT NULL,
	"project_id" uuid,
	"expires_at" timestamp with time zone,
	"voided" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_permanently" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "moderation_actions_user_idx" ON "moderation_actions" USING btree ("user_sub","created_at");