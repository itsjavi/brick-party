-- CreateTable
CREATE TABLE "rooms" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rooms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "players" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_owner_id_key" ON "rooms"("owner_id");

-- CreateIndex
CREATE INDEX "rooms_last_used_at_idx" ON "rooms"("last_used_at");
