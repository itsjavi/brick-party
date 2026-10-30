import {
  CHARGE_TICKS,
  GO_TICK,
  HARD_LAUNCH,
  MOVED,
  SHIELD_THROUGH,
  SMASH_SCALE,
  STAGES,
  WORLD,
  platformAt,
  type SmashBody,
  type SmashFightView,
  type SmashSpec,
  type StageId,
} from "@brick/game";
import { playSfx } from "../../../lib/audio";
import { clockPaused } from "../../../lib/clock";
import { drawIcon } from "../../../lib/icons";
import { affine, set, translate, type Affine } from "../doodle/affine";
import { circlePath, fitCanvas, outlinedText, pageFonts, roundRectPath, starPath } from "../doodle/canvas";
import { canvasFighter, drawFighter, type CanvasFighter } from "../doodle/canvasFighter";
import type { FigureSource } from "../doodle/FightArena.stsx";
import { poseAt } from "../doodle/pose";
import type { FightClient, Frame } from "./netcode";
import {
  ASPECT,
  POWER_ICONS,
  VIEW,
  easeCamera,
  eventEffect,
  eventSound,
  frameCamera,
  gaitDistance,
  momentOf,
  rank,
  sy,
  wideCamera,
  type EffectKind,
} from "./scene";

/** One fighter as the arena draws it. */
export interface Contender {
  name: string;
  /** The owner's brick colour. */
  color: string;
  spec: SmashSpec;
  weapon: "blade" | "blaster" | "fists";
  /** Its drawing, once this screen has it; a placeholder brick until then. */
  figure: FigureSource | null;
  mine: boolean;
}

/** Every fight update as it arrives, outside React: returns a function that stops listening. */
export type FightFeed = (listener: (fight: SmashFightView) => void) => () => void;

/** One fighter's card on the scoreboard. */
export interface HudCard {
  i: number;
  /** Damage %, rounded. */
  dmg: number;
  lives: number;
  kos: number;
  gone: boolean;
  away: boolean;
  /** Your own fighter's charge and shield, 0 to 1 in steps of 5%. */
  charge: number;
  shield: number;
}

/** The HTML over and under the canvas: the scoreboard, best first, and the big words in the middle. */
export interface HudState {
  /** Whether there's a fight to draw yet. */
  ready: boolean;
  cards: HudCard[];
  /** "3", "2", "1", "GO!", "GAME!" or nothing. */
  banner: string | null;
  over: boolean;
}

/** How often the scoreboard may change, at most. */
const HUD_MS = 100;
/** How long effects stay up. */
const EFFECT_MS = 1100;
const MAX_EFFECTS = 30;
const TRAIL_POINTS = 10;
const INK = "#1b1f3b";

interface Effect {
  at: number;
  x: number;
  y: number;
  kind: EffectKind;
  text: string;
  color: string;
}

/** How each stage looks: its sky, its ground and its ledges, and what's drawn behind them. */
interface Theme {
  sky: [string, string];
  solid: string;
  edge: string;
  thin: string;
  decor: (ctx: CanvasRenderingContext2D, t: number, waves: Path2D[]) => void;
}

const THEMES: Record<StageId, Theme> = {
  sketchbook: {
    sky: ["#fffdf5", "#fff6e0"],
    solid: "#e9edf5",
    edge: "#94a3b8",
    thin: "#ffe27a",
    decor: (ctx) => {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "#a8d4ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        ctx.moveTo(VIEW.x, 40 + i * 42);
        ctx.lineTo(VIEW.x + VIEW.width, 40 + i * 42);
      }
      ctx.stroke();
      ctx.strokeStyle = "#ff9aa2";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(40, 0);
      ctx.lineTo(40, WORLD.height);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },
  tower: {
    sky: ["#cfe8ff", "#fff3d6"],
    solid: "#f8fafc",
    edge: "#64748b",
    thin: "#e8b46a",
    decor: (ctx, t) => {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#ffffff";
      const clouds = [180, 620, 1180, 1500];
      for (let i = 0; i < clouds.length; i++) {
        ctx.beginPath();
        ctx.ellipse(
          ((clouds[i]! + t * (0.6 + i * 0.2)) % (VIEW.width + 300)) - 150,
          120 + i * 70,
          110,
          34,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  split: {
    sky: ["#fde8c8", "#f6d2a3"],
    solid: "#c98b4f",
    edge: "#7c4a1e",
    thin: "#ff8fb1",
    decor: (ctx) => {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#e7b47c";
      for (let i = 0; i < 9; i++) ctx.fillRect(VIEW.x, i * 120, VIEW.width, 58);
      ctx.globalAlpha = 1;
    },
  },
  bridge: {
    sky: ["#ffd6a5", "#a5d8ff"],
    solid: "#6dbb6a",
    edge: "#2f6b33",
    thin: "#ffffff",
    decor: (ctx, t, waves) => {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#fff3b0";
      circlePath(ctx, 1320, 190, 90);
      ctx.fill();
      ctx.strokeStyle = "#fbd38d";
      ctx.lineWidth = 5;
      for (let i = 0; i < waves.length; i++) {
        ctx.globalAlpha = 0.5 - i * 0.12;
        const dx = -((t * (8 + i * 4)) % 400);
        ctx.translate(dx, 0);
        ctx.stroke(waves[i]!);
        ctx.translate(-dx, 0);
      }
      ctx.globalAlpha = 1;
    },
  },
};

/** The bridge's rolling hills, as paths. */
function bridgeWaves(): Path2D[] {
  return [0, 1, 2].map(
    (i) =>
      new Path2D(`M${VIEW.x} ${760 + i * 70} q 200 -${60 + i * 20} 400 0 t 400 0 t 400 0 t 400 0 t 400 0`),
  );
}

/** What the renderer is drawing: set at the start, contenders again when their drawings arrive. */
export interface SmashScene {
  stage: StageId;
  contenders: Contender[];
  /** The viewer's fighter index, or -1. */
  me: number;
}

/**
 * The live fight on a canvas, drawn every animation frame without React (DECISION-19): the stage, every fighter posed
 * from its drawing, shots and power-ups, hit sparks, damage numbers, launch trails, knockout flashes, a camera that
 * frames the fighters and a shake for the big hits. It reads the fight from a `FightClient` (your fighter predicted,
 * everyone else smoothed) and hears the server's updates through `receive`. The scoreboard and the big words stay
 * HTML: `onHud` hears them at most every `HUD_MS`, and only when they change.
 */
export class SmashRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #client: FightClient;
  readonly #onHud: (hud: HudState) => void;
  #scene: SmashScene;
  #figures: (CanvasFighter | null)[] = [];
  #specs: SmashSpec[] = [];
  #raf = 0;
  #stopFit: (() => void) | null = null;

  // What the server said.
  #seen: number | null = null;
  #latestTick = 0;
  #over = false;
  #effects: Effect[] = [];
  #shake = { at: 0, power: 0 };
  #kos: number[] = [];
  #hurtAt: number[] = [];

  // What this screen worked out from frame to frame.
  #dist: number[] = [];
  #lastX: number[] = [];
  #trails: number[][] = [];
  #atkSeen: number[] = [];
  /** Your own charge last frame, to ping once when it fills. */
  #chargeSeen = 0;
  #goShown = false;
  #cam = wideCamera();
  #target = wideCamera();

  /**
   * The performance overlay (toggled with the backquote key): frame times and drawing times say whether this screen
   * keeps up; the gaps between server updates say whether the server and network do.
   */
  #perf = { on: perfWanted(), frameAt: 0, frames: [] as number[], draws: [] as number[], gaps: [] as number[], lastUpdate: 0 };

  // The HTML around the canvas.
  #hudAt = -Infinity;
  #hudKey = "";
  #banner: string | null = null;

  // Drawing things made once.
  readonly #base: Affine = affine();
  #sky: CanvasGradient | null = null;
  readonly #shot: CanvasGradient;
  readonly #waves = bridgeWaves();
  readonly #fonts: Record<"tag" | "tagMine" | "pop" | "big" | "power" | "ko", string>;

  constructor(
    canvas: HTMLCanvasElement,
    client: FightClient,
    scene: SmashScene,
    onHud: (hud: HudState) => void,
  ) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d")!;
    this.#client = client;
    this.#onHud = onHud;
    this.#scene = scene;
    this.setContenders(scene.contenders);
    const { display, body } = pageFonts(canvas);
    this.#fonts = {
      tag: `900 22px ${body}`,
      tagMine: `900 24px ${body}`,
      pop: `40px ${display}`,
      big: `60px ${display}`,
      power: `34px ${display}`,
      ko: `62px ${display}`,
    };
    const shot = this.#ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    shot.addColorStop(0, "#ffffff");
    shot.addColorStop(0.5, "#7cf7ff");
    shot.addColorStop(1, "rgba(124, 247, 255, 0)");
    this.#shot = shot;
  }

  /** The fighters, again: when their drawings arrive mid-fight. */
  setContenders(contenders: Contender[]) {
    this.#scene = { ...this.#scene, contenders };
    this.#figures = contenders.map((c) => (c.figure ? canvasFighter(c.figure) : null));
    this.#specs = contenders.map((c) => c.spec);
  }

  start() {
    this.#stopFit = fitCanvas(this.#canvas, () => {});
    this.#raf = requestAnimationFrame(this.#frame);
  }

  destroy() {
    cancelAnimationFrame(this.#raf);
    this.#stopFit?.();
    this.#stopFit = null;
  }

  /** A fight update from the server: to the client, and its new events to the screen (sparks, numbers, sounds). */
  receive(fight: SmashFightView, now = performance.now()) {
    const perf = this.#perf;
    if (perf.lastUpdate) keep(perf.gaps, now - perf.lastUpdate);
    perf.lastUpdate = now;
    this.#client.receive(fight, now);
    this.#latestTick = Math.max(this.#latestTick, fight.tick);
    this.#over = fight.over >= 0;
    const last = fight.events.at(-1)?.n ?? -1;
    // The first update's events happened before this screen was here.
    if (this.#seen === null) {
      this.#seen = last;
      return;
    }
    const { contenders, me } = this.#scene;
    for (const e of fight.events) {
      if (e.n <= this.#seen) continue;
      this.#seen = e.n;
      const sound = eventSound(e);
      if (sound && (e.k !== "shot" || e.a === me || Math.random() < 0.5)) playSfx(sound);
      if (e.k === "shot") continue;
      if (e.k === "hit" && e.b >= 0) this.#hurtAt[e.b] = now;
      const color = contenders[e.k === "power" || e.k === "respawn" ? e.a : e.b]?.color ?? "#ffffff";
      const { kind, text } = eventEffect(e);
      this.#effects.push({ at: now, x: e.x, y: e.y, kind, text, color });
      if (e.k === "ko" || (e.k === "hit" && e.p === "big") || e.k === "break")
        this.#shake = { at: now, power: e.k === "ko" ? 14 : 9 };
      if (e.k === "ko" && e.a >= 0 && e.a !== e.b) this.#kos[e.a] = (this.#kos[e.a] ?? 0) + 1;
      if (e.k === "ko" && e.b === me) playSfx("lose");
      else if (e.k === "ko" && e.a === me && me >= 0) playSfx("point");
    }
    if (this.#effects.length > MAX_EFFECTS) this.#effects.splice(0, this.#effects.length - MAX_EFFECTS);
  }

  /** Shows or hides the performance overlay, and remembers the choice on this device. */
  togglePerf() {
    this.#perf.on = !this.#perf.on;
    try {
      localStorage.setItem(PERF_KEY, this.#perf.on ? "1" : "0");
    } catch {
      // A private window can't store it; the overlay still toggles for now.
    }
  }

  #frame = () => {
    this.#raf = requestAnimationFrame(this.#frame);
    const now = performance.now();
    const perf = this.#perf;
    if (perf.frameAt) keep(perf.frames, now - perf.frameAt);
    perf.frameAt = now;
    const client = this.#client;
    client.hold(clockPaused(), now);
    client.advance(now);
    if (client.takeMoves() & MOVED.jump) playSfx("whoosh");
    const frame = client.frame(now);
    if (!frame) {
      this.#hud(now, null, 0, -1);
      return;
    }
    const { contenders, me } = this.#scene;
    const fightTick = me >= 0 ? frame.localTick : frame.tick;
    const countdown = fightTick < GO_TICK ? Math.ceil((GO_TICK - fightTick) / 20) : 0;
    if (countdown === 0 && !this.#goShown && this.#latestTick >= GO_TICK) {
      this.#goShown = true;
      playSfx("start");
    }

    // Distance walked, for the gait; recent positions, for launch trails; new swings, for the swoosh.
    for (let i = 0; i < frame.bodies.length; i++) {
      const b = frame.bodies[i]!;
      const before = this.#lastX[i] ?? b.x;
      const dx = b.x - before;
      this.#dist[i] = (this.#dist[i] ?? 0) + (Math.abs(dx) < 200 ? gaitDistance(dx) : 0);
      this.#lastX[i] = b.x;
      const flying = b.out === 0 && b.stun > 6 && Math.hypot(b.vx, b.vy) > HARD_LAUNCH * 0.6;
      const trail = (this.#trails[i] ??= []);
      if (flying) {
        trail.push(b.x, b.y + (contenders[i]?.spec.h ?? 60) / 2);
        if (trail.length > TRAIL_POINTS * 2) trail.splice(0, 2);
      } else if (trail.length) trail.splice(0, 2);
      // A new swing: the attack's countdown went up. Everyone's swooshing at once would be a din, so others' only now and then.
      if (
        b.atk > (this.#atkSeen[i] ?? 0) &&
        contenders[i]?.weapon !== "blaster" &&
        (i === me || Math.random() < 0.35)
      )
        playSfx("slash");
      this.#atkSeen[i] = b.atk;
      if (i === me) {
        if (b.chg >= CHARGE_TICKS && this.#chargeSeen < CHARGE_TICKS) playSfx("charge");
        this.#chargeSeen = b.chg;
      }
    }

    this.#draw(now, frame);
    keep(perf.draws, performance.now() - now);
    if (perf.on) this.#drawPerf();
    this.#hud(now, frame.bodies, countdown, (fightTick - GO_TICK) * 50);
  };

  #draw(now: number, { bodies, shots, items, tick }: Frame) {
    // Moving platforms at the exact moment, not whole ticks, so they glide like the fighters on them.
    const platformTick = this.#scene.me >= 0 ? this.#client.estimate(now) : tick;
    const ctx = this.#ctx;
    const { stage, contenders } = this.#scene;
    const theme = THEMES[stage];
    const t = now / 50;
    const fonts = this.#fonts;

    // The camera: frame everyone in play, zooming in when they're close together.
    frameCamera(this.#target, bodies, this.#specs, this.#over);
    const view = easeCamera(this.#cam, this.#target);
    const viewH = view.w / ASPECT;
    // Device pixels per world unit: the canvas's CSS box keeps the view's shape (`ASPECT`).
    const k = this.#canvas.width / view.w;
    const base = set(this.#base, k, 0, 0, k, -view.x * k, -view.y * k);
    const apply = () => ctx.setTransform(base[0]!, base[1]!, base[2]!, base[3]!, base[4]!, base[5]!);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.sky[1];
    ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
    apply();
    if (!this.#sky) {
      this.#sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
      this.#sky.addColorStop(0, theme.sky[0]);
      this.#sky.addColorStop(1, theme.sky[1]);
    }
    ctx.fillStyle = this.#sky;
    ctx.fillRect(VIEW.x, 0, VIEW.width, VIEW.height);
    theme.decor(ctx, t, this.#waves);

    // Everything on the stage shakes with the big hits; the sky stays put.
    const quake = this.#shake;
    const age = now - quake.at;
    const amount = age < 320 ? quake.power * (1 - age / 320) : 0;
    if (amount) translate(base, Math.sin(now * 0.09) * amount, Math.cos(now * 0.11) * amount * 0.7);
    apply();

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const p of STAGES[stage].platforms) {
      const at = platformAt(p, platformTick);
      const w = at.x1 - at.x0;
      if (p.solid) {
        roundRectPath(ctx, at.x0, sy(at.y), w, p.h, 10);
        ctx.fillStyle = theme.solid;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5;
        ctx.stroke();
        roundRectPath(ctx, at.x0 + 6, sy(at.y) + 4, w - 12, 10, 5);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = theme.edge;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        roundRectPath(ctx, at.x0, sy(at.y), w, p.h, 7);
        ctx.fillStyle = theme.thin;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

    for (const item of items) {
      const x = item.x;
      const y = sy(item.y) + Math.sin(t * 0.2 + item.id) * 6;
      ctx.globalAlpha = item.ttl < 40 && Math.floor(t / 2) % 2 ? 0.4 : 1;
      circlePath(ctx, x, y, 24);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.stroke();
      drawIcon(ctx, POWER_ICONS[item.kind], x, y, 32);
    }
    ctx.globalAlpha = 1;

    ctx.lineWidth = 16;
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < this.#trails.length; i++) {
      const trail = this.#trails[i];
      if (!trail || trail.length < 4) continue;
      ctx.strokeStyle = contenders[i]?.color ?? "#ffffff";
      ctx.beginPath();
      ctx.moveTo(trail[0]!, sy(trail[1]!));
      for (let j = 2; j < trail.length; j += 2) ctx.lineTo(trail[j]!, sy(trail[j + 1]!));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      const c = contenders[i];
      if (!c || b.out !== 0) continue;
      this.#fighter(now, t, i, b, c, base);
      apply();
    }

    for (const s of shots) {
      const x = s.x;
      const y = sy(s.y);
      const r = s.r * 1.8;
      ctx.translate(x, y);
      ctx.scale(r, r);
      ctx.fillStyle = this.#shot;
      circlePath(ctx, 0, 0, 1);
      ctx.fill();
      apply();
      circlePath(ctx, x, y, s.r * 0.7);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = contenders[s.owner]?.color ?? INK;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Effects, kept inside the camera, so a knockout far off-screen still shows at the edge.
    const effects = this.#effects;
    while (effects.length && now - effects[0]!.at >= EFFECT_MS) effects.shift();
    for (const e of effects) {
      const life = (now - e.at) / EFFECT_MS;
      if (life >= 1) continue;
      const x = Math.max(view.x + 60, Math.min(view.x + view.w - 60, e.x));
      const y = Math.max(view.y + 60, Math.min(view.y + viewH - 30, sy(e.y)));
      if (e.kind === "ko") {
        ctx.globalAlpha = 1 - life;
        starPath(ctx, x, y, 70 + life * 160, life * 120);
        ctx.fillStyle = "#ffcc33";
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5;
        ctx.stroke();
        outlinedText(ctx, e.text, x, y + 18, fonts.ko, "#ff5a4e", INK, 5);
        continue;
      }
      const fade = 1 - life * life;
      if (e.kind === "hit" || e.kind === "big" || e.kind === "break") {
        ctx.globalAlpha = fade * (1 - life);
        starPath(ctx, x, y, e.kind === "hit" ? 26 + life * 30 : 44 + life * 60);
        ctx.fillStyle = e.kind === "break" ? "#7cc8ff" : "#ffffff";
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.globalAlpha = fade;
      const big = e.kind === "big" || e.kind === "break";
      outlinedText(
        ctx,
        e.text,
        x,
        y - 40 - life * 90,
        big ? fonts.big : e.kind === "power" ? fonts.power : fonts.pop,
        big ? "#ffcc33" : e.kind === "power" ? "#5fd068" : "#ffffff",
        INK,
        5,
      );
    }
    ctx.globalAlpha = 1;
  }

  /** One fighter with what goes with it: charge ring, power-up glow, shield bubble, dizzy stars and its name. */
  #fighter(now: number, t: number, i: number, b: SmashBody, c: Contender, base: Affine) {
    const ctx = this.#ctx;
    const fonts = this.#fonts;
    const { w, h } = c.spec;
    const group = b.inv > 0 && Math.floor(t / 2) % 2 === 0 ? 0.45 : 1;
    const charge = b.chg / CHARGE_TICKS;
    const middle = sy(b.y + h / 2);
    if (charge > 0.2) {
      ctx.globalAlpha = group * (0.4 + charge * 0.5);
      circlePath(ctx, b.x, middle, h * (0.5 + charge * 0.4) + Math.sin(t) * 3);
      ctx.strokeStyle = "#ffcc33";
      ctx.lineWidth = 4 + charge * 8;
      ctx.stroke();
    }
    if (b.big || b.fast > 0) {
      ctx.globalAlpha = group * 0.7;
      ctx.beginPath();
      ctx.ellipse(b.x, sy(b.y) - 2, w * 0.8, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = b.big ? "#ff6b57" : "#ffe066";
      ctx.fill();
    }
    ctx.globalAlpha = group;
    const figure = this.#figures[i];
    if (figure && c.figure) {
      const hurtAgo = now - (this.#hurtAt[i] ?? -1e9);
      const pose = poseAt(c.figure, momentOf(b, this.#dist[i] ?? 0, now / 100, hurtAgo));
      drawFighter(ctx, base, figure, pose, {
        x: b.x,
        y: b.y,
        face: b.face,
        floor: WORLD.height,
        scale: SMASH_SCALE,
      });
      ctx.setTransform(base[0]!, base[1]!, base[2]!, base[3]!, base[4]!, base[5]!);
    } else {
      // A stand-in until the drawing arrives: a brick in its owner's colour.
      const top = sy(b.y) - h;
      roundRectPath(ctx, b.x - w / 2, top, w, h, 8);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = INK;
      circlePath(ctx, b.x + b.face * w * 0.15 - 6, sy(b.y) - h * 0.65, 3.5);
      ctx.fill();
      circlePath(ctx, b.x + b.face * w * 0.15 + 6, sy(b.y) - h * 0.65, 3.5);
      ctx.fill();
    }
    if (b.sh) {
      const strength = 1 - Math.ceil(b.wear - 1e-6) / (SHIELD_THROUGH.length + 0.5);
      circlePath(ctx, b.x, middle, Math.max(w, h) * 0.7 * (0.75 + 0.25 * strength));
      ctx.globalAlpha = group * (0.25 + 0.2 * strength);
      ctx.fillStyle = "#7cc8ff";
      ctx.fill();
      ctx.globalAlpha = group;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    const head = sy(b.y + h);
    if (b.stun > 0 && b.dmg > 0 && b.gr >= 0) drawIcon(ctx, "dizzy", b.x, head - 56, 32);
    if (c.mine) outlinedText(ctx, "▼ You", b.x, head - 18, fonts.tagMine, "#0f766e", "#ffffff", 6);
    else outlinedText(ctx, c.name, b.x, head - 18, fonts.tag, INK, "#ffffff", 6);
    ctx.globalAlpha = 1;
  }

  /**
   * The scoreboard and the big words, to `onHud` when they change: the words at once, the cards at most every
   * `HUD_MS`. `countdown` is the "3, 2, 1" number, then 0; `goAge` the ms since GO.
   */
  /** The overlay's numbers, in the canvas's bottom-left corner, in screen pixels whatever the camera does. */
  #drawPerf() {
    const { frames, draws, gaps } = this.#perf;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
    const fps = frames.length ? 1000 / avg(frames) : 0;
    const lines = [
      `screen  ${fps.toFixed(0)} fps · worst frame ${max(frames).toFixed(0)} ms · drawing ${avg(draws).toFixed(1)} ms (max ${max(draws).toFixed(1)})`,
      `server  update every ${avg(gaps).toFixed(0)} ms · worst gap ${max(gaps).toFixed(0)} ms (expected ~66)`,
    ];
    const ctx = this.#ctx;
    const ratio = this.#canvas.width / Math.max(1, this.#canvas.clientWidth);
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const h = this.#canvas.clientHeight;
    ctx.fillStyle = "rgba(27, 31, 59, 0.8)";
    ctx.fillRect(6, h - 46, 470, 40);
    ctx.fillStyle = "#ffffff";
    lines.forEach((line, i) => ctx.fillText(line, 12, h - 30 + i * 16));
    ctx.restore();
  }

  #hud(now: number, bodies: SmashBody[] | null, countdown: number, goAge: number) {
    const banner = !bodies
      ? null
      : countdown > 0
        ? String(countdown)
        : goAge >= 0 && goAge < 700
          ? "GO!"
          : this.#over
            ? "GAME!"
            : null;
    const due = now - this.#hudAt >= HUD_MS;
    if (!due && banner === this.#banner) return;
    this.#banner = banner;
    if (due) this.#hudAt = now;
    const { contenders, me } = this.#scene;
    const cards: HudCard[] = [];
    if (bodies) {
      for (const i of rank(bodies, this.#kos)) {
        const b = bodies[i]!;
        if (!contenders[i]) continue;
        cards.push({
          i,
          dmg: Math.round(b.dmg),
          lives: Math.max(0, b.lives),
          kos: this.#kos[i] ?? 0,
          gone: b.lives <= 0,
          away: b.out > 0,
          charge: i === me ? Math.round((b.big ? 1 : b.chg / CHARGE_TICKS) * 20) / 20 : 0,
          shield: i === me ? Math.round(Math.max(0, 1 - b.wear / SHIELD_THROUGH.length) * 20) / 20 : 0,
        });
      }
    }
    const hud: HudState = { ready: !!bodies, cards, banner, over: this.#over };
    const key = JSON.stringify(hud);
    if (key === this.#hudKey) return;
    this.#hudKey = key;
    this.#onHud(hud);
  }
}

const PERF_KEY = "brickparty:smash-perf";
/** How many recent samples the overlay averages: about two seconds of frames. */
const PERF_SAMPLES = 120;

function keep(samples: number[], value: number) {
  samples.push(value);
  if (samples.length > PERF_SAMPLES) samples.shift();
}

function perfWanted(): boolean {
  try {
    return localStorage.getItem(PERF_KEY) === "1";
  } catch {
    return false;
  }
}
