CREATE TYPE "public"."subscription_period_type" AS ENUM('normal', 'trial', 'intro', 'promotional');--> statement-breakpoint
CREATE TYPE "public"."subscription_store" AS ENUM('app_store', 'play_store', 'stripe', 'promotional');--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"store" "subscription_store" NOT NULL,
	"period_type" "subscription_period_type" NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"will_renew" boolean NOT NULL,
	"sandbox" boolean NOT NULL,
	"last_event_at_ms" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;