CREATE TABLE "companies" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_companies" (
	"game_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"is_developer" boolean DEFAULT false NOT NULL,
	"is_publisher" boolean DEFAULT false NOT NULL,
	CONSTRAINT "game_companies_game_id_company_id_pk" PRIMARY KEY("game_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "game_genres" (
	"game_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "game_genres_game_id_genre_id_pk" PRIMARY KEY("game_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "game_platforms" (
	"game_id" integer NOT NULL,
	"platform_id" integer NOT NULL,
	CONSTRAINT "game_platforms_game_id_platform_id_pk" PRIMARY KEY("game_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE "game_screenshots" (
	"game_id" integer NOT NULL,
	"image_id" text NOT NULL,
	CONSTRAINT "game_screenshots_game_id_image_id_pk" PRIMARY KEY("game_id","image_id")
);
--> statement-breakpoint
CREATE TABLE "game_types" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text,
	"first_release_date" timestamp with time zone,
	"game_type_id" integer,
	"parent_game_id" integer,
	"total_rating" real,
	"total_rating_count" integer DEFAULT 0 NOT NULL,
	"cover_image_id" text,
	"igdb_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"slug" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_companies" ADD CONSTRAINT "game_companies_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_companies" ADD CONSTRAINT "game_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_genres" ADD CONSTRAINT "game_genres_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_genres" ADD CONSTRAINT "game_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_platforms" ADD CONSTRAINT "game_platforms_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_platforms" ADD CONSTRAINT "game_platforms_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_screenshots" ADD CONSTRAINT "game_screenshots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_slug_idx" ON "games" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "games_name_trgm_idx" ON "games" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "games_popular_idx" ON "games" USING btree ("total_rating_count" DESC) WHERE "games"."total_rating_count" > 50;