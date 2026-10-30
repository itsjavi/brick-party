/**
 * Brick Brawl's arena, drawn on a canvas by its own animation loop. React hands it the latest view with `update()`
 * whenever the server sends one; everything that moves between those (sliding bricks, the replay's beats, shakes,
 * glows, hover previews) happens here, without re-rendering React.
 */
import {
  onArena,
  type BrawlBrick,
  type BrawlEvent,
  type BrawlMove,
  type BrickBrawlView,
  type PlayerId,
} from "@brick/game";
import { playSfx } from "../../../lib/audio";
import { drawIcon, type IconName } from "../../../lib/icons";
import type { Seat } from "../types";
import { BRICK_DROP, BRICK_HEIGHT, SpriteCache, type SpriteVariant } from "./brick-sprite";
import { TILE_GAP, geometryOf, tileAt, tileCenter, type Geometry } from "./geometry";
import {
  STAGE_AT_MS,
  ghostsOf,
  moodOf,
  replayFrames,
  ringShown,
  sameMove,
  simulate,
  stageShakes,
  stageSounds,
  stagesOf,
  threats,
  tileMoves,
  type MoveType,
  type Simulation,
} from "./logic";
import {
  EASE,
  EASE_IN,
  EASE_IN_OUT,
  FALL,
  POP,
  SLIDE,
  keyframes,
  retarget,
  settled,
  still,
  tweenAt,
  type Tween,
} from "./motion";

export interface ArenaInput {
  view: BrickBrawlView;
  me: PlayerId | null;
  players: Seat[];
  /** The move card picked; its target tiles light up while the viewer can move. */
  picked: MoveType;
  canMove: boolean;
  canDrop: boolean;
  onMove: (move: BrawlMove) => void;
  onDrop: (x: number, y: number) => void;
  /** The replay beat now showing: -1 before the first, `null` outside the replay. Called a few times a turn. */
  onStage: (stage: number | null) => void;
}

type Tile = { x: number; y: number };

interface Piece {
  brick: BrawlBrick;
  /** Tile position, fractional while sliding. */
  pos: Tween;
  /** 0 standing, 1 gone: drives the knockout spin and fade. */
  out: Tween;
}

const C = {
  ink: "#1b1f3b",
  paper: "#ffffff",
  sun: "#ffcc33",
  teal: "#00c4b8",
  coral: "#ff5a4e",
  floor: "#f4e9d8",
  floorOdd: "#efe0c8",
  crumble: "#ffb4a8",
  crumbleOdd: "#ffa596",
  shadow: "rgba(27, 31, 59, 0.18)",
  target: "#bdf3ec",
  drop: "#fde68a",
  bubble: "#7dd3fc",
  bubbleFill: "rgba(125, 211, 252, 0.25)",
};
const TEXT_FONT = '"Nunito", system-ui, sans-serif';
const HINTS: Partial<Record<MoveType, IconName>> = { step: "steps", dash: "dash", shove: "fist" };
const SHAKE_A: [number, number[]][] = [
  [0, [0, 0]],
  [0.25, [6, 2]],
  [0.5, [-5, -2]],
  [0.75, [3, 1]],
  [1, [0, 0]],
];
const SHAKE_B = SHAKE_A.map(([o, [x, y]]) => [o, [-x!, y!]] as [number, number[]]);

export class BrawlRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private readonly sprites = new SpriteCache();
  private readonly reduced: boolean;
  private width = 0;
  private dpr = 1;
  private raf = 0;
  /** Whether the next frame must be drawn even if nothing is animating. */
  private dirty = true;
  /** Whether the last frame drew anything that moves, so the next one must be drawn too. */
  private busy = true;

  private input: ArenaInput | null = null;
  private seats = new Map<PlayerId, Seat>();
  private danger: PlayerId[] = [];
  private turnKey = "";
  private pieces = new Map<PlayerId, Piece>();
  private ghosts = new Map<PlayerId, Tween>();
  /** Where everyone stood while moves were picked: the replay starts from here. */
  private planBricks: BrawlBrick[] | null = null;
  private replay: {
    key: string;
    frames: BrawlBrick[][];
    stages: BrawlEvent[][];
    timers: ReturnType<typeof setTimeout>[];
  } | null = null;
  private stage: number | null = null;
  private stageStart: number[] = [];
  private shake = { start: -Infinity, count: 0 };
  private sim: { view: BrickBrawlView; key: string; result: Simulation | null } | null = null;
  private floor: { key: string; canvas: HTMLCanvasElement } | null = null;
  /** Name labels already cut to fit, so long names aren't measured every frame. */
  private labels = new Map<string, string>();

  private hoverTile: Tile | null = null;
  private focusTile: Tile | null = null;
  private cardMove: BrawlMove | null = null;
  private cardType: MoveType | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener("pointermove", this.onPointer);
    canvas.addEventListener("pointerdown", this.onPointer);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("click", this.onClick);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
    // Name tags drawn before the web font arrived fall back to another font: draw them again once it's in.
    document.fonts?.ready.then(() => {
      this.labels.clear();
      this.dirty = true;
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.stopReplay();
    this.canvas.removeEventListener("pointermove", this.onPointer);
    this.canvas.removeEventListener("pointerdown", this.onPointer);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.canvas.removeEventListener("click", this.onClick);
  }

  /** Takes the latest view. Cheap to call on every React render: it only starts what changed. */
  update(input: ArenaInput) {
    this.input = input;
    const { view, me } = input;
    const now = performance.now();
    this.seats = new Map(input.players.map((p) => [p.id, p]));
    const mine = view.bricks.find((b) => b.id === me);
    this.danger = mine && mine.outAt === null && view.phase === "plan" ? threats(view, mine) : [];
    const key = `${view.phase}:${view.round}:${view.turn}`;
    if (key !== this.turnKey) {
      this.turnKey = key;
      this.cardMove = null;
      this.cardType = null;
    }
    if (view.phase === "replay") {
      const replayKey = `${view.round}:${view.turn}`;
      if (this.replay?.key !== replayKey) this.startReplay(replayKey, view, now);
    } else {
      this.stopReplay();
      this.planBricks = view.bricks;
      this.place(view.bricks, now);
    }
    this.dirty = true;
  }

  /** The move under the pointer on a move card or arrow button, previewed with ghosts. */
  hoverCard(move: BrawlMove | null, type: MoveType | null = null) {
    this.cardMove = move;
    this.cardType = type;
    this.dirty = true;
  }

  /** A tile focused from the keyboard, outlined so sighted keyboard players see where they are. */
  focus(tile: Tile | null) {
    this.focusTile = tile;
    this.dirty = true;
  }

  // ---- Replay ----

  private startReplay(key: string, view: BrickBrawlView, now: number) {
    this.stopReplay();
    const before = this.planBricks ?? view.bricks;
    this.replay = {
      key,
      frames: replayFrames(before, view.events, view.turn),
      stages: stagesOf(view.events),
      timers: STAGE_AT_MS.map((at, i) => setTimeout(() => this.enterStage(i), at)),
    };
    this.shake = { start: -Infinity, count: 0 };
    this.place(before, now);
    this.setStage(-1);
  }

  private stopReplay() {
    if (this.replay) this.replay.timers.forEach(clearTimeout);
    this.replay = null;
    this.stageStart = [];
    this.setStage(null);
  }

  private enterStage(i: number) {
    const replay = this.replay;
    if (!replay) return;
    const now = performance.now();
    const events = replay.stages[i]!;
    this.stageStart[i] = now;
    this.place(replay.frames[i]!, now);
    stageSounds(events).forEach((s) => playSfx(s));
    if (stageShakes(events)) this.shake = { start: now, count: this.shake.count + 1 };
    this.setStage(i);
    this.dirty = true;
  }

  private setStage(stage: number | null) {
    if (stage === this.stage) return;
    this.stage = stage;
    this.input?.onStage(stage);
  }

  /** Sends every brick toward where it now stands, sliding from wherever it is. */
  private place(bricks: BrawlBrick[], now: number) {
    const ids = new Set(bricks.map((b) => b.id));
    for (const id of this.pieces.keys()) if (!ids.has(id)) this.pieces.delete(id);
    for (const b of bricks) {
      const out = b.outAt !== null ? 1 : 0;
      const piece = this.pieces.get(b.id);
      if (!piece) {
        this.pieces.set(b.id, { brick: b, pos: still([b.x, b.y]), out: still([out]) });
        continue;
      }
      piece.brick = b;
      piece.pos = retarget(piece.pos, [b.x, b.y], now, this.ms(550), SLIDE);
      piece.out = retarget(piece.out, [out], now, this.ms(800), EASE_IN);
    }
  }

  private ms(duration: number) {
    return this.reduced ? 0 : duration;
  }

  /** Progress through a one-off effect that started at `start`, or 1 when motion is reduced. */
  private progress(now: number, start: number | undefined, duration: number) {
    if (start === undefined) return 1;
    if (this.reduced) return 1;
    const t = (now - start) / duration;
    if (t < 1) this.busy = true;
    return Math.max(0, Math.min(1, t));
  }

  /** A looping effect's progress, or 0 (at rest) when motion is reduced. */
  private loop(now: number, period: number) {
    if (this.reduced) return 0;
    this.busy = true;
    return (now % period) / period;
  }

  // ---- Input ----

  private geometry(): Geometry | null {
    return this.input && this.width ? geometryOf(this.width, this.input.view.size) : null;
  }

  private tileOf(e: MouseEvent): Tile | null {
    const g = this.geometry();
    if (!g) return null;
    const rect = this.canvas.getBoundingClientRect();
    return tileAt(
      g,
      ((e.clientX - rect.left) * g.width) / rect.width,
      ((e.clientY - rect.top) * g.width) / rect.height,
    );
  }

  /** The tiles that make a move when clicked, for the move type being picked or hovered. */
  private targets(): Map<string, BrawlMove> {
    const input = this.input;
    if (!input?.canMove) return new Map();
    const mine = input.view.bricks.find((b) => b.id === input.me && b.outAt === null);
    return tileMoves(mine, this.cardType ?? input.picked);
  }

  private exists(t: Tile) {
    const view = this.input?.view;
    return !!view && onArena({ size: view.size, ring: view.ring }, t.x, t.y);
  }

  private onPointer = (e: PointerEvent) => {
    const tile = this.tileOf(e);
    if (tile?.x === this.hoverTile?.x && tile?.y === this.hoverTile?.y) return;
    this.hoverTile = tile;
    const clickable =
      tile &&
      (this.targets().has(`${tile.x},${tile.y}`)
        ? "pointer"
        : this.input?.canDrop && this.exists(tile)
          ? "crosshair"
          : "");
    this.canvas.style.cursor = clickable || "";
    this.dirty = true;
  };

  private onLeave = () => {
    this.hoverTile = null;
    this.canvas.style.cursor = "";
    this.dirty = true;
  };

  private onClick = (e: MouseEvent) => {
    const tile = this.tileOf(e);
    const input = this.input;
    if (!tile || !input) return;
    const move = this.targets().get(`${tile.x},${tile.y}`);
    if (move) input.onMove(move);
    else if (input.canDrop && this.exists(tile)) input.onDrop(tile.x, tile.y);
  };

  // ---- Drawing ----

  private resize() {
    const width = this.canvas.clientWidth;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (width === this.width && dpr === this.dpr) return;
    this.width = width;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(width * dpr);
    // Resizing the canvas blanks it: draw again now rather than flash empty until the next frame.
    this.draw(performance.now());
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.dirty && !this.busy) return;
    this.dirty = false;
    this.busy = false;
    this.draw(now);
  };

  private draw(now: number) {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const g = this.geometry();
    const input = this.input;
    if (!g || !input) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const shake = this.progress(now, this.shake.start, 350);
    if (shake < 1 && !this.reduced) {
      const [sx, sy] = keyframes(shake, this.shake.count % 2 ? SHAKE_A : SHAKE_B);
      ctx.translate(sx!, sy!);
    }
    this.drawTiles(g, input, now);
    this.drawTargets(g, input, now);
    this.drawGhosts(g, input, now);
    this.drawBricks(g, input, now);
    this.drawDrops(g, now);
  }

  private tilePath(ctx: CanvasRenderingContext2D, g: Geometry, x: number, y: number, inset = 0) {
    const size = g.cell - TILE_GAP;
    const r = Math.min(8, size * 0.14);
    ctx.beginPath();
    ctx.roundRect(
      g.pad + x * g.cell + TILE_GAP / 2 + inset,
      g.pad + y * g.cell + TILE_GAP / 2 + inset,
      size - 2 * inset,
      size - 2 * inset,
      Math.max(0, r - inset),
    );
  }

  /** A tile with the floor's inset shadow along its bottom edge. */
  private paintTile(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    x: number,
    y: number,
    fill: string,
    shadow = true,
  ) {
    this.tilePath(ctx, g, x, y);
    ctx.fillStyle = fill;
    ctx.fill();
    if (!shadow) return;
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C.shadow;
    ctx.fill();
    const band = Math.min(5, g.cell * 0.08);
    ctx.translate(0, -band);
    this.tilePath(ctx, g, x, y);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  /** The tiles that don't change, drawn once per arena size and ring into a layer of their own. */
  private floorLayer(g: Geometry, ring: number): HTMLCanvasElement {
    const key = `${g.width}|${this.dpr}|${g.n}|${ring}`;
    if (this.floor?.key === key) return this.floor.canvas;
    const layer = this.floor?.canvas ?? document.createElement("canvas");
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const ctx = layer.getContext("2d")!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, g.width, g.width);
    for (let y = 0; y < g.n; y++) {
      for (let x = 0; x < g.n; x++) {
        if (onArena({ size: g.n, ring }, x, y))
          this.paintTile(ctx, g, x, y, (x + y) % 2 ? C.floorOdd : C.floor);
      }
    }
    this.floor = { key, canvas: layer };
    return layer;
  }

  private drawTiles(g: Geometry, input: ArenaInput, now: number) {
    const { ctx } = this;
    const { view } = input;
    const replaying = view.phase === "replay";
    const stage = this.stage ?? -1;
    const ring = ringShown(view, replaying ? stage : null);
    const shrinks = replaying && view.events.some((e) => e.kind === "shrink");
    // The red edge: about to crumble after this turn, or crumbling in this replay's last beat.
    const nextRing = (view.phase === "plan" && view.crumbles) || (shrinks && stage < 3) ? ring + 1 : ring;
    const on = (x: number, y: number, r: number) => onArena({ size: g.n, ring: r }, x, y);
    ctx.drawImage(this.floorLayer(g, nextRing), 0, 0, g.width, g.width);

    const wobble =
      nextRing > ring
        ? keyframes(
            this.loop(now, 800),
            [
              [0, [0]],
              [0.5, [2]],
              [1, [0]],
            ],
            EASE_IN_OUT,
          )[0]!
        : 0;
    const fall = shrinks && stage >= 3 ? EASE_IN(this.progress(now, this.stageStart[3], 900)) : 0;
    for (let y = 0; y < g.n; y++) {
      for (let x = 0; x < g.n; x++) {
        const crumbling = on(x, y, ring) && !on(x, y, nextRing);
        const falling = shrinks && stage >= 3 && on(x, y, ring - 1) && !on(x, y, ring);
        if (!crumbling && !(falling && fall < 1)) continue;
        const [cx, cy] = tileCenter(g, x, y);
        ctx.save();
        ctx.globalAlpha = 1 - fall * (falling ? 1 : 0);
        ctx.translate(cx, cy + (falling ? 60 * fall : 0));
        ctx.rotate(((falling ? 25 * fall : wobble) * Math.PI) / 180);
        ctx.translate(-cx, -cy);
        this.paintTile(ctx, g, x, y, (x + y) % 2 ? C.crumbleOdd : C.crumble);
        ctx.restore();
      }
    }

    if (view.phase !== "plan") return;
    const hover = this.hoverTile;
    if (input.canDrop && hover && on(hover.x, hover.y, ring))
      this.paintTile(ctx, g, hover.x, hover.y, C.drop);
    if (view.myDrop) {
      this.paintTile(ctx, g, view.myDrop.x, view.myDrop.y, C.drop);
      this.hint(g, view.myDrop.x, view.myDrop.y, "drop");
    }
    if (this.focusTile) {
      this.tilePath(ctx, g, this.focusTile.x, this.focusTile.y, 2);
      ctx.strokeStyle = C.sun;
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.stroke();
    }
  }

  private hint(g: Geometry, x: number, y: number, icon: IconName) {
    const { ctx } = this;
    const [cx, cy] = tileCenter(g, x, y);
    ctx.save();
    ctx.globalAlpha = 0.75;
    drawIcon(ctx, icon, cx, cy, Math.min(22, g.cell * 0.36));
    ctx.restore();
  }

  /** The tiles a click turns into a move: dashed and glowing, or solid for the move locked in. */
  private drawTargets(g: Geometry, input: ArenaInput, now: number) {
    const { ctx } = this;
    const { view } = input;
    for (const [key, move] of this.targets()) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      if (x < 0 || y < 0 || x >= g.n || y >= g.n) continue;
      const chosen = sameMove(move, view.myMove);
      const hovered = this.hoverTile?.x === x && this.hoverTile.y === y;
      const exists = onArena(view, x, y);
      if (chosen || hovered) this.paintTile(ctx, g, x, y, C.target, exists);
      // outline: 3px dashed, offset -4px, breathing in to -7px.
      const offset = chosen
        ? 4
        : 4 +
          3 *
            keyframes(this.loop(now, 1200), [
              [0, [0]],
              [0.5, [1]],
              [1, [0]],
            ])[0]!;
      this.tilePath(ctx, g, x, y, offset - 1.5);
      ctx.strokeStyle = move.type === "shove" ? C.coral : C.teal;
      ctx.lineWidth = 3;
      ctx.setLineDash(chosen ? [] : [7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      const hint = HINTS[move.type];
      if (hint) this.hint(g, x, y, hint);
    }
  }

  /** The move previewed: under the pointer on a tile or card, or else the one locked in. */
  private preview(input: ArenaInput): BrawlMove | null {
    if (!input.canMove) return null;
    const tile = this.hoverTile;
    const onTile = tile ? this.targets().get(`${tile.x},${tile.y}`) : undefined;
    return onTile ?? this.cardMove ?? input.view.myMove;
  }

  private simulation(input: ArenaInput): Simulation | null {
    const move = this.preview(input);
    const key = JSON.stringify(move);
    if (this.sim?.view !== input.view || this.sim.key !== key) {
      this.sim = {
        view: input.view,
        key,
        result: move && input.me ? simulate(input.view, input.me, move) : null,
      };
    }
    return this.sim.result;
  }

  private drawGhosts(g: Geometry, input: ArenaInput, now: number) {
    const { ctx } = this;
    const sim = this.simulation(input);
    const ghosts = sim ? ghostsOf(sim, input.view.bricks, g.n) : [];
    const ids = new Set(ghosts.map((gh) => gh.id));
    for (const id of this.ghosts.keys()) if (!ids.has(id)) this.ghosts.delete(id);
    for (const ghost of ghosts) {
      const seat = this.seats.get(ghost.id);
      if (!seat) continue;
      const lo = -0.4;
      const hi = g.n - 0.6;
      const to = [Math.max(lo, Math.min(hi, ghost.x)), Math.max(lo, Math.min(hi, ghost.y))];
      const tw = this.ghosts.get(ghost.id);
      const pos = tw ? retarget(tw, to, now, this.ms(200), EASE) : still(to);
      this.ghosts.set(ghost.id, pos);
      if (!settled(pos, now)) this.busy = true;
      const [x, y] = tweenAt(pos, now) as [number, number];
      const [cx, cy] = tileCenter(g, x, y);
      ctx.save();
      ctx.globalAlpha = ghost.falls ? 0.6 : 0.45;
      this.brick(g, seat, ghost.falls ? "sad" : "wow", cx, cy, ghost.falls ? "ghost-falls" : "ghost");
      ctx.restore();
      const me = ghost.id === input.me;
      const label = ghost.falls ? (me ? "You'd fall!" : `${seat.name} falls! +150`) : me ? "You" : seat.name;
      this.pill(g, label, cx, cy - g.cell / 2 - 14, "top", ghost.falls ? C.coral : C.ink, C.paper, null);
    }
  }

  private brick(
    g: Geometry,
    seat: Seat,
    mood: Parameters<SpriteCache["get"]>[1],
    cx: number,
    cy: number,
    variant: SpriteVariant = "normal",
  ) {
    const sprite = this.sprites.get(seat.avatar, mood, g.em, this.dpr, variant);
    const left = cx - sprite.brickWidth / 2 + sprite.ox;
    const top = cy + (BRICK_DROP - BRICK_HEIGHT / 2) * g.em + sprite.oy;
    this.ctx.drawImage(sprite.image, left, top, sprite.width, sprite.height);
  }

  private drawBricks(g: Geometry, input: ArenaInput, now: number) {
    const { ctx } = this;
    const { view, me } = input;
    const replaying = view.phase === "replay";
    const reached = (s: number) => replaying && this.stage !== null && this.stage >= s;
    const has = (kinds: BrawlEvent["kind"][], id: PlayerId) =>
      view.events.some((e) => kinds.includes(e.kind) && "id" in e && e.id === id);
    const lo = -0.4;
    const hi = g.n - 0.6;

    const shown = [...this.pieces.values()].flatMap((piece) => {
      const seat = this.seats.get(piece.brick.id);
      const out = tweenAt(piece.out, now)[0]!;
      if (!seat || out >= 0.999) return [];
      if (!settled(piece.pos, now) || !settled(piece.out, now)) this.busy = true;
      const [x, y] = tweenAt(piece.pos, now) as [number, number];
      return [{ piece, seat, out, x: Math.max(lo, Math.min(hi, x)), y: Math.max(lo, Math.min(hi, y)) }];
    });
    // Lower rows in front, so hats tuck behind the bricks below them.
    shown.sort((a, b) => a.y - b.y);

    const placed = shown.map(({ piece, seat, out, x, y }) => {
      const b = piece.brick;
      const bumped = reached(0) && has(["bump"], b.id);
      const shielded = reached(0) && has(["block"], b.id);
      const hit = reached(1) && has(["shove", "ram"], b.id);
      const threatened = b.id === me && this.danger.length > 0;
      const [bx] = bumped
        ? keyframes(this.progress(now, this.stageStart[0], 400), [
            [0, [0]],
            [0.3, [6]],
            [0.6, [-6]],
            [1, [0]],
          ])
        : [0];
      const [hs, glow] = hit
        ? keyframes(this.progress(now, this.stageStart[1], 450), [
            [0, [1, 0]],
            [0.2, [1.25, 0.4]],
            [1, [1, 0]],
          ])
        : [1, 0];
      const [wy] = threatened
        ? keyframes(
            this.loop(now, 900),
            [
              [0, [0]],
              [0.5, [-3]],
              [1, [0]],
            ],
            EASE_IN_OUT,
          )
        : [0];
      const [cx, cy] = tileCenter(g, x, y);
      // Knocked out: spins, shrinks and drops away as it fades.
      const transform = () => {
        ctx.translate(cx + bx!, cy + wy! + 30 * out);
        ctx.rotate((300 * out * Math.PI) / 180);
        const s = (1 - 0.85 * out) * hs!;
        ctx.scale(s, s);
      };
      ctx.save();
      ctx.globalAlpha = 1 - out;
      transform();
      if (shielded) {
        const k = POP(this.progress(now, this.stageStart[0], 500));
        ctx.save();
        ctx.globalAlpha *= Math.min(1, k);
        ctx.scale(0.3 + 0.7 * k, 0.3 + 0.7 * k);
        ctx.beginPath();
        ctx.arc(0, 0, g.cell * 0.46 - 2, 0, Math.PI * 2);
        ctx.fillStyle = C.bubbleFill;
        ctx.fill();
        ctx.strokeStyle = C.bubble;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }
      const mood = moodOf({ out: b.outAt !== null, dazed: b.dazed, hit, bumped, threatened });
      this.brick(g, seat, mood, 0, 0);
      if (glow! > 0) {
        // brightness(1.4): add the brick's own colors on top of it.
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (1 - out) * glow!;
        this.brick(g, seat, mood, 0, 0);
      }
      ctx.restore();
      return { b, seat, out, transform };
    });

    // Name tags and badges go on top of every brick, so they stay readable in a crowd.
    for (const { b, seat, out, transform } of placed) {
      ctx.save();
      ctx.globalAlpha = 1 - out;
      transform();
      const mine = b.id === me;
      this.pill(
        g,
        mine ? "You" : seat.name,
        0,
        g.cell / 2 + 6,
        "bottom",
        mine ? C.sun : C.paper,
        C.ink,
        C.ink,
      );
      const badges: ("ready" | IconName)[] = [];
      if (view.phase === "plan" && view.readyIds.includes(b.id)) badges.push("ready");
      if (b.dazed && b.outAt === null) badges.push("dizzy");
      if (mine && this.danger.length) badges.push("warning");
      const size = Math.max(12, Math.min(16, g.cell * 0.22));
      let right = g.cell / 2 - 2;
      for (const badge of badges) {
        const top = -g.cell / 2 - 4;
        if (badge === "ready") {
          const d = size * 1.25;
          ctx.beginPath();
          ctx.arc(right - d / 2, top + d / 2, d / 2 - 1, 0, Math.PI * 2);
          ctx.fillStyle = C.teal;
          ctx.fill();
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = C.paper;
          ctx.font = `900 ${size * 0.75}px ${TEXT_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("✓", right - d / 2, top + d / 2 + 1);
          right -= d + 2;
        } else {
          const d = size * 1.25;
          drawIcon(ctx, badge, right - d / 2, top + d / 2, d);
          right -= d + 2;
        }
      }
      ctx.restore();
    }
  }

  /** A rounded name label. `edge` says whether `y` is the label's top or its bottom. */
  private pill(
    g: Geometry,
    text: string,
    cx: number,
    y: number,
    edge: "top" | "bottom",
    bg: string,
    fg: string,
    border: string | null,
  ) {
    const { ctx } = this;
    const size = Math.max(9, Math.min(12, g.cell * 0.16));
    ctx.font = `900 ${size}px ${TEXT_FONT}`;
    const max = Math.round(g.cell * 2.2);
    const key = `${ctx.font}|${max}|${text}`;
    let label = this.labels.get(key);
    if (label === undefined) {
      label = fit(ctx, text, max);
      if (this.labels.size > 500) this.labels.clear();
      this.labels.set(key, label);
    }
    const pad = size * 0.55;
    const w = ctx.measureText(label).width + 2 * pad + (border ? 4 : 0);
    const h = size * 1.35 + (border ? 4 : 0);
    const top = edge === "top" ? y : y - h;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, top, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    if (border) {
      ctx.beginPath();
      ctx.roundRect(cx - w / 2 + 1, top + 1, w - 2, h - 2, h / 2 - 1);
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, top + h / 2 + size * 0.05);
  }

  /** Bricks dropped by knocked-out players, falling from above during the third beat. */
  private drawDrops(g: Geometry, now: number) {
    if (this.stage !== 2 || !this.replay) return;
    const { ctx } = this;
    const t = this.progress(now, this.stageStart[2], 550);
    const [opacity] = keyframes(
      t,
      [
        [0, [0]],
        [0.8, [1]],
        [1, [1]],
      ],
      FALL,
    );
    ctx.save();
    ctx.globalAlpha = opacity!;
    for (const e of this.replay.stages[2]!) {
      if (e.kind !== "drop") continue;
      const [cx, cy] = tileCenter(g, e.x, e.y);
      drawIcon(ctx, "brick", cx, cy - 260 * (1 - FALL(t)), Math.min(40, g.cell * 0.62));
    }
    ctx.restore();
  }
}

/** Cuts `text` short with an ellipsis so it fits in `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
