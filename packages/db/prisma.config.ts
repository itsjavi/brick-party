import { defineConfig } from "prisma/config";

// The database is Cloudflare D1, migrated with wrangler (see DEPLOY.md). Prisma's CLI only
// generates the client and diffs schemas; `scripts/new-migration.mjs` points this datasource at a
// throwaway SQLite file rebuilt from the existing migrations.
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: { url: process.env.DIFF_DATABASE_URL ?? "file:./prisma/.diff.db" },
});
