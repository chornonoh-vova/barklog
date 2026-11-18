CREATE TYPE "public"."date_precision" AS ENUM('day', 'month', 'quarter', 'year', 'none');--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "release_date_precision" date_precision;