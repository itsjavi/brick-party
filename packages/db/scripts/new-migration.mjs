// Writes the next D1 migration from changes to prisma/schema.prisma.
//   pnpm db:diff <name>
// Rebuilds a temporary SQLite database from migrations/*.sql, diffs it against the schema with
// `prisma migrate diff`, and saves the SQL as migrations/NNNN_<name>.sql (applied by wrangler).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = path.resolve(pkg, "migrations");
const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
if (!name) {
  console.error("Usage: pnpm db:diff <migration_name>");
  process.exit(1);
}

const files = readdirSync(migrations).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const dir = mkdtempSync(path.join(tmpdir(), "brick-db-"));
const dbFile = path.join(dir, "current.db");
const db = new DatabaseSync(dbFile);
for (const file of files) db.exec(readFileSync(path.join(migrations, file), "utf8"));
db.close();

try {
  const sql = execFileSync(
    "pnpm",
    ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"],
    { cwd: pkg, env: { ...process.env, DIFF_DATABASE_URL: `file:${dbFile}` }, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const statements = sql.replace(/^Loaded Prisma config.*$/m, "").trim();
  if (!statements || /^-- This is an empty migration\.?$/m.test(statements)) {
    console.log("No schema changes.");
  } else {
    const next = String(files.length + 1).padStart(4, "0");
    const out = path.join(migrations, `${next}_${name}.sql`);
    writeFileSync(out, `${statements}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), out)}. Apply it with: pnpm db:migrate:local`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
