// Prints how each pack splits across topics, styles and spice: `pnpm --filter @brick/content balance`.
// Pass a folder to measure other copies of the packs: `pnpm --filter @brick/content balance /path/to/packs`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { STYLE_IDS, TOPIC_IDS } from "../src/categories.ts";

type Item = { id: string; spice: string; topic: string; style: string };

const dir = process.argv[2] ? resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2]) : join(import.meta.dirname, "../packs");
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const packs = files.map((file) => {
  const data = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, Item[]>;
  return { name: file.replace(".json", ""), items: Object.values(data).flat(), kb: statSync(join(dir, file)).size / 1000 };
});

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "-").padStart(5);
const row = (label: string, cells: string[]) => console.log(label.padEnd(16) + cells.map((c) => c.padStart(16)).join(""));

function table(title: string, keys: readonly string[], pick: (i: Item) => string, filter: (i: Item) => boolean = () => true) {
  console.log(`\n${title}`);
  row("", [...packs.map((p) => p.name), "all"]);
  const all = packs.flatMap((p) => p.items).filter(filter);
  for (const key of keys) {
    const cell = (items: Item[]) => {
      const kept = items.filter(filter);
      const n = kept.filter((i) => pick(i) === key).length;
      return `${n} ${pct(n, kept.length)}`;
    };
    row(key, [...packs.map((p) => cell(p.items)), cell(all)]);
  }
}

row("", [...packs.map((p) => p.name), "all"]);
row("items", [...packs.map((p) => String(p.items.length)), String(packs.reduce((n, p) => n + p.items.length, 0))]);
row("size", packs.map((p) => `${p.kb.toFixed(1)} KB`));
table("Topic", TOPIC_IDS, (i) => i.topic);
table("Style", STYLE_IDS, (i) => i.style);
table("Style of spicy items", STYLE_IDS, (i) => i.style, (i) => i.spice === "spicy");
table("Spice", ["mild", "spicy"], (i) => i.spice);
