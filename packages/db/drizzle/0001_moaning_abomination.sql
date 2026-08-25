CREATE TYPE "public"."backlog_status" AS ENUM('waiting', 'playing', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "backlog_entries" (
	"user_id" text NOT NULL,
	"game_id" integer NOT NULL,
	"status" "backlog_status" NOT NULL,
	"rating" smallint,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_entries_user_id_game_id_pk" PRIMARY KEY("user_id","game_id"),
	CONSTRAINT "backlog_entries_rating_range" CHECK ("backlog_entries"."rating" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlog_entries" ADD CONSTRAINT "backlog_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_entries" ADD CONSTRAINT "backlog_entries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlog_entries_user_status_idx" ON "backlog_entries" USING btree ("user_id","status");