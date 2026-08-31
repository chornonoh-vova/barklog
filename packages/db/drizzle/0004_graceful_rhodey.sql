CREATE TABLE "game_similar" (
	"game_id" integer NOT NULL,
	"similar_game_id" integer NOT NULL,
	CONSTRAINT "game_similar_game_id_similar_game_id_pk" PRIMARY KEY("game_id","similar_game_id")
);
--> statement-breakpoint
ALTER TABLE "game_similar" ADD CONSTRAINT "game_similar_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;