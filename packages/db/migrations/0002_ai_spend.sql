-- CreateTable
CREATE TABLE "ai_spend" (
    "day" TEXT NOT NULL PRIMARY KEY,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" INTEGER NOT NULL DEFAULT 0
);
