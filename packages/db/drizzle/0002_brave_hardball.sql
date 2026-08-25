CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"watermark" timestamp with time zone,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "sync_runs_success_idx" ON "sync_runs" USING btree ("finished_at" DESC) WHERE "sync_runs"."status" = 'success';