-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT NOT NULL,
    "avatar" JSONB NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "room_code" TEXT NOT NULL,
    "playlist" JSONB NOT NULL,
    "started_at" DATETIME NOT NULL,
    "ended_at" DATETIME NOT NULL,
    "report" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "match_players" (
    "match_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "awards" JSONB NOT NULL,

    PRIMARY KEY ("match_id", "player_id"),
    CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "match_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "game_results" (
    "match_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "game_id" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "stats" JSONB NOT NULL,

    PRIMARY KEY ("match_id", "idx"),
    CONSTRAINT "game_results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "prompt_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "game_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "spice" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" DATETIME,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "players_key_hash_key" ON "players"("key_hash");

-- CreateIndex
CREATE INDEX "matches_ended_at_idx" ON "matches"("ended_at");

-- CreateIndex
CREATE INDEX "match_players_player_id_idx" ON "match_players"("player_id");

-- CreateIndex
CREATE INDEX "prompt_cards_game_id_source_created_at_idx" ON "prompt_cards"("game_id", "source", "created_at");

-- CreateIndex
CREATE INDEX "prompt_cards_game_id_last_used_at_idx" ON "prompt_cards"("game_id", "last_used_at");
