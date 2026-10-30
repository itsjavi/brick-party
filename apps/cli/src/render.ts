import { HUE_COLORS, HUE_COLS, HUE_COLUMN_LETTERS, HUE_ROWS, strokesToSvg, type ChainEntry } from "@brick/game";
import type { Browser } from "@playwright/test";

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** One drawing, or a whole Skip Logic chain with texts and drawings side by side, as a page. */
export function lookHtml(entries: { entry: ChainEntry; label: string }[]): string {
  const cells = entries.map(({ entry, label }) => {
    const body = entry.kind === "drawing" ? strokesToSvg(entry.strokes, 300) : `<p>${escape(entry.text)}</p>`;
    return `<figure>${body}<figcaption>${escape(label)}</figcaption></figure>`;
  });
  // Up to three cells a row; a cell is 300px plus 6px padding and a 3px border on each side.
  const columns = Math.min(entries.length, 3);
  return `<!doctype html><html><head><style>
    body { margin: 0; padding: 12px; background: #e8eef7; font: 600 18px system-ui, sans-serif; color: #14213d; }
    main { display: flex; flex-wrap: wrap; gap: 12px; width: ${columns * 318 + (columns - 1) * 12}px; }
    figure { margin: 0; width: 300px; padding: 6px; background: #fff; border: 3px solid #14213d; border-radius: 12px; }
    figure > svg { display: block; }
    p { height: 268px; margin: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; font-size: 22px; }
    figcaption { margin-top: 6px; font-size: 14px; color: #5b6478; }
  </style></head><body><main>${cells.join("")}</main></body></html>`;
}

/** A mark on the Hue Clue board: the target, or someone's pin, with a short label. */
export interface HueMark {
  cell: number;
  label: string;
  kind: "target" | "pin";
}

/** The Hue Clue board with its column letters and row numbers, and any marks, as a page. */
export function hueHtml(marks: HueMark[], caption: string): string {
  const head = [...HUE_COLUMN_LETTERS].map((l) => `<b>${l}</b>`).join("");
  const rows = Array.from({ length: HUE_ROWS }, (_, y) => {
    const cells = Array.from({ length: HUE_COLS }, (_, x) => {
      const cell = y * HUE_COLS + x;
      const here = marks.filter((m) => m.cell === cell);
      const target = here.some((m) => m.kind === "target");
      const pins = here.filter((m) => m.kind === "pin").map((m) => `<span>${escape(m.label)}</span>`).join("");
      return `<i class="${target ? "target" : ""}" style="background:${HUE_COLORS[cell]}">${pins}</i>`;
    });
    return `<b>${y + 1}</b>${cells.join("")}`;
  });
  return `<!doctype html><html><head><style>
    body { margin: 0; padding: 12px; background: #e8eef7; font: 700 13px system-ui, sans-serif; color: #14213d; }
    main { display: inline-block; padding: 8px; background: #fff; border: 3px solid #14213d; border-radius: 12px; }
    .grid { display: grid; grid-template-columns: 24px repeat(${HUE_COLS}, 50px); grid-auto-rows: 42px; gap: 2px; }
    .grid > b { display: flex; align-items: center; justify-content: center; }
    .grid > b:first-child { visibility: hidden; }
    i { position: relative; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 1px; border-radius: 4px; font-style: normal; }
    i.target { outline: 4px solid #14213d; outline-offset: -2px; box-shadow: 0 0 0 3px #fff; z-index: 1; }
    span { background: #fff; border: 2px solid #14213d; border-radius: 6px; padding: 0 3px; font-size: 11px; line-height: 14px; }
    p { margin: 8px 0 0; font-size: 14px; }
  </style></head><body><main><div class="grid"><b></b>${head}${rows.join("")}</div><p>${escape(caption)}</p></main></body></html>`;
}

/** Renders pages to PNGs with one headless browser, started on first use. */
export class Renderer {
  #browser: Promise<Browser> | null = null;

  async png(html: string, path: string): Promise<string> {
    this.#browser ??= import("@playwright/test").then(({ chromium }) => chromium.launch());
    const page = await (await this.#browser).newPage({ viewport: { width: 1000, height: 400 } });
    try {
      await page.setContent(html);
      await page.locator("main").screenshot({ path });
      return path;
    } finally {
      await page.close();
    }
  }

  async close() {
    await (await this.#browser)?.close();
  }
}
