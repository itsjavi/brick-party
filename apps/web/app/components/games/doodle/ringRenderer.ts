import { ACT, FLOOR_SCALE, TICK_MS, type DoodleFightView, type FightEvent, type Stroke } from "@brick/game";
import { playSfx, type SfxName } from "../../../lib/audio";
import { serverNow } from "../../../lib/clock";
import { drawIcon } from "../../../lib/icons";
import { affine, set } from "./affine";
import { circlePath, fitCanvas, outlinedText, pageFonts, slamAlpha, slamScale } from "./canvas";
import { canvasFighter, drawFighter, type CanvasFighter } from "./canvasFighter";
import { FightTrack, poseAt, type Posable } from "./pose";

/** The ring's picture, in its own units: a duel's and a free-for-all's. */
export const RING = {
  duel: { height: 440, floor: 392 },
  ffa: { height: 520, floor: 470 },
};
const SOUNDS: Partial<Record<FightEvent["k"], SfxName>> = {
  hit: "hit",
  crit: "smash",
  topple: "fall",
  wall: "thud",
  ko: "ko",
  jump: "whoosh",
};
const CRIT_WORDS = ["POW!", "BAM!", "WHAM!", "KAPOW!", "BONK!"];
const CROWD = ["#c7d2fe", "#fbcfe8", "#bbf7d0", "#fde68a", "#bae6fd"];
const INK = "#1b1f3b";
const CORAL = "#ff5a4e";
const SUN = "#ffcc33";
/** How often the HTML around the ring (health bars, the commentary) may change, at most. */
const STATUS_MS = 100;

/** What the HTML around the ring shows: each fighter's health, the latest line of commentary, and whether it's over. */
export interface RingStatus {
  hp: number[];
  /** Index into the fight's captions, or -1 before the first. */
  caption: number;
  over: boolean;
}

/** The ring's tick at a moment: the fight's clock while it runs, its end once it's finished. */
export function ringTick(
  track: { end: number },
  fight: Pick<DoodleFightView, "frames">,
  startedAt: number,
  finished: boolean,
  now: number,
): number {
  return finished || !fight.frames.length ? track.end + 20 : (now - startedAt) / TICK_MS;
}

/** The latest caption at tick `t`, as an index, or -1. */
export function captionAt(captions: { t: number }[], t: number): number {
  for (let i = captions.length - 1; i >= 0; i--) if (captions[i]!.t <= t) return i;
  return -1;
}

export interface RingOptions {
  fight: DoodleFightView;
  /** The fighters in the fight's order. */
  cast: (Posable & { strokes: Stroke[] })[];
  startedAt: number;
  finished: boolean;
  /** Whether this ring plays sounds. */
  loud: boolean;
  /** What the big hits shake on the page: the canvas, or the frame around it. */
  shake: HTMLElement;
  onStatus: (status: RingStatus) => void;
}

/**
 * One Doodle Champions fight replayed on a canvas from its frames, outside React: the crowd, the fighters posed from
 * their drawings, damage numbers, POW words, TIMBER, knockout stars, K.O. and a shake for the big hits. Its clock is
 * the server's: the replay plays at the same moment on every screen. Health and commentary change at the pace of the
 * fight, so they stay HTML: `onStatus` hears them when they change.
 */
export class RingRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #o: RingOptions;
  readonly #track: FightTrack;
  readonly #figures: CanvasFighter[];
  readonly #height: number;
  readonly #floor: number;
  readonly #fonts: Record<"dmg" | "dmgBig" | "pow" | "small" | "ko", string>;
  readonly #base = affine();
  #sky: CanvasGradient | null = null;
  #raf = 0;
  #stopFit: (() => void) | null = null;
  #heard: number;
  #statusKey = "";
  #statusAt = -Infinity;
  #shake = "";

  constructor(canvas: HTMLCanvasElement, options: RingOptions) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d")!;
    this.#o = options;
    const { fight, cast } = options;
    const ring = fight.fighters.length > 2 ? RING.ffa : RING.duel;
    this.#height = ring.height;
    this.#floor = ring.floor;
    this.#track = new FightTrack(fight.frames, fight.events, fight.fighters.length);
    this.#figures = cast.map((f) => canvasFighter(f));
    this.#heard = options.finished ? Infinity : Math.floor(this.#tick());
    const { display } = pageFonts(canvas);
    this.#fonts = {
      dmg: `34px ${display}`,
      dmgBig: `46px ${display}`,
      pow: `56px ${display}`,
      small: `40px ${display}`,
      ko: `120px ${display}`,
    };
  }

  start() {
    // A finished fight stands still on its last frame: drawn when the canvas changes size, not every frame.
    this.#stopFit = fitCanvas(this.#canvas, () => {
      if (this.#o.finished) this.#frame();
    });
    if (!this.#o.finished) {
      this.#raf = requestAnimationFrame(this.#loop);
      return;
    }
    // Its words again once the page's fonts are in, in case they weren't yet.
    document.fonts?.ready.then(() => {
      if (this.#stopFit) this.#frame();
    });
  }

  destroy() {
    cancelAnimationFrame(this.#raf);
    this.#stopFit?.();
    this.#stopFit = null;
    this.#o.shake.style.translate = "";
  }

  #tick(): number {
    return ringTick(this.#track, this.#o.fight, this.#o.startedAt, this.#o.finished, serverNow());
  }

  #loop = () => {
    this.#raf = requestAnimationFrame(this.#loop);
    this.#frame();
  };

  #frame() {
    const t = this.#tick();
    const { fight, loud, finished } = this.#o;
    const track = this.#track;
    // Sounds for the moments the clock just passed, once each.
    if (loud && !finished) {
      const now = Math.min(t, track.end);
      if (Math.floor(now) > this.#heard) {
        const kinds = new Set<SfxName>();
        for (const e of fight.events) {
          const sound = SOUNDS[e.k];
          if (sound && e.t > this.#heard && e.t <= now) kinds.add(sound);
        }
        for (const kind of kinds) playSfx(kind);
        this.#heard = Math.floor(now);
      }
    }
    this.#draw(t);
    this.#status(t);
  }

  #status(t: number) {
    const now = performance.now();
    if (now - this.#statusAt < STATUS_MS) return;
    this.#statusAt = now;
    const { fight } = this.#o;
    const hp = fight.fighters.map((_, i) => this.#track.moment(i, t).hp);
    const status: RingStatus = { hp, caption: captionAt(fight.captions, t), over: t >= this.#track.end };
    const key = `${hp.join(",")}|${status.caption}|${status.over}`;
    if (key === this.#statusKey) return;
    this.#statusKey = key;
    this.#o.onStatus(status);
  }

  #draw(t: number) {
    const ctx = this.#ctx;
    const { fight, cast, finished } = this.#o;
    const track = this.#track;
    const width = fight.width;
    const height = this.#height;
    const floor = this.#floor;
    const fonts = this.#fonts;
    const over = t >= track.end;
    const ffa = fight.fighters.length > 2;
    const recent = (e: FightEvent, ticks: number) => t >= e.t && t < e.t + ticks;

    // The shake moves the whole picture on the page, like the SVG it replaces.
    let shake = 0;
    for (const e of fight.events)
      if ((e.k === "crit" || e.k === "ko") && recent(e, 4)) shake = Math.max(shake, 1 - (t - e.t) / 4);
    const translate = shake
      ? `${(Math.sin(t * 13) * 9 * shake).toFixed(1)}px ${(Math.cos(t * 11) * 6 * shake).toFixed(1)}px`
      : "";
    if (translate !== this.#shake) {
      this.#shake = translate;
      this.#o.shake.style.translate = translate;
    }

    const k = this.#canvas.width / width;
    const base = set(this.#base, k, 0, 0, k, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1;
    if (!this.#sky) {
      this.#sky = ctx.createLinearGradient(0, 0, 0, height);
      this.#sky.addColorStop(0, "#bfe9ff");
      this.#sky.addColorStop(1, "#fff4dc");
    }
    ctx.fillStyle = this.#sky;
    ctx.fillRect(0, 0, width, height);

    // The crowd: a row of bobbing heads.
    ctx.globalAlpha = 0.7;
    const heads = Math.round(width / 46);
    for (let i = 0; i < heads; i++) {
      circlePath(ctx, 23 + i * 46, floor - 150 + Math.sin(t * 0.4 + i * 1.7) * (over ? 6 : 2.5), 20);
      ctx.fillStyle = CROWD[i % CROWD.length]!;
      ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = CORAL;
    ctx.fillRect(0, floor - 128, width, 10);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, floor - 88, width, 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f4e9d8";
    ctx.fillRect(0, floor, width, height - floor);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = INK;
    ctx.fillRect(0, floor, width, 8);
    ctx.globalAlpha = 1;

    // Knocked out fighters behind, the ones still standing in front.
    for (let pass = 0; pass < 2; pass++) {
      const behind = pass === 0;
      for (let i = 0; i < cast.length; i++) {
        const m = track.moment(i, t);
        if ((m.act === ACT.ko) !== behind) continue;
        const pose = poseAt(cast[i]!, m);
        drawFighter(ctx, base, this.#figures[i]!, pose, {
          x: m.x,
          y: m.y,
          face: m.face,
          floor,
          scale: FLOOR_SCALE,
        });
      }
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);

    for (let n = 0; n < fight.events.length; n++) {
      const e = fight.events[n]!;
      if (e.b === undefined || (e.k !== "hit" && e.k !== "crit") || !recent(e, 9)) continue;
      const at = track.moment(e.b, e.t);
      const age = t - e.t;
      const top = floor - at.y - cast[e.b]!.stats.halfWidth * 2 - 60 - age * 7;
      ctx.globalAlpha = 1 - age / 9;
      if (e.k === "crit")
        this.#slammed(CRIT_WORDS[(e.t + n) % CRIT_WORDS.length]!, at.x, top - 40, fonts.pow, SUN, 4, age);
      outlinedText(ctx, `-${e.d}`, at.x, top, e.k === "crit" ? fonts.dmgBig : fonts.dmg, CORAL, INK, 2);
    }
    ctx.globalAlpha = 1;
    for (const e of fight.events) {
      if (e.k !== "topple" || !recent(e, 10)) continue;
      const at = track.moment(e.a, e.t);
      this.#slammed("TIMBER!", at.x, floor - 230, fonts.small, "#ffffff", 4, t - e.t);
    }
    for (let i = 0; i < cast.length; i++) {
      const m = track.moment(i, t);
      if (m.act === ACT.ko) drawIcon(ctx, "dizzy", m.x, floor - 58, 44);
    }
    if (!ffa && fight.how === "ko") {
      const ko = fight.events.find((e) => e.k === "ko" && t >= e.t);
      if (ko)
        this.#slammed(
          "K.O.!",
          width / 2,
          height * 0.36,
          fonts.ko,
          CORAL,
          6,
          finished ? Infinity : t - ko.t,
          350,
        );
    }
    if (over && !finished && fight.how !== "ko")
      this.#slammed(
        fight.how === "draw" ? "DRAW!" : "TIME!",
        width / 2,
        height * 0.36,
        fonts.ko,
        CORAL,
        6,
        t - track.end,
        350,
      );
  }

  /** Big outlined words that slam in, centered on `x` with their baseline at `y`, `ticks` after they appeared. */
  #slammed(
    text: string,
    x: number,
    y: number,
    font: string,
    fill: string,
    stroke: number,
    ticks: number,
    duration = 300,
  ) {
    const ctx = this.#ctx;
    const age = ticks * TICK_MS;
    const before = ctx.globalAlpha;
    const s = slamScale(age, duration);
    ctx.globalAlpha = before * slamAlpha(age, duration);
    ctx.save();
    // Scaled around the words' middle, roughly a third of the font's size above the baseline.
    const mid = y - parseFloat(font) * 0.35;
    ctx.translate(x, mid);
    ctx.scale(s, s);
    outlinedText(ctx, text, 0, y - mid, font, fill, INK, stroke);
    ctx.restore();
    ctx.globalAlpha = before;
  }
}
