import {
  GO_TICK,
  SMASH_TICK_MS,
  STAGES,
  applyInput,
  stepFighter,
  unpackBody,
  unpackShot,
  type SmashBody,
  type SmashFightView,
  type SmashItem,
  type SmashShot,
  type SmashSpec,
  type StageId,
} from "@brick/game";

/**
 * The fight on one screen (DECISION-19): everyone else drawn a little in the past, smoothly in between the server's
 * updates, and your own fighter moved at once from your keys with the server's own rules (`stepFighter`), then
 * nudged towards what the server says. Hits, knockbacks and ring-outs come from the server: when it says yours was
 * hit, your fighter follows it.
 */

/** How far behind the latest update everyone else is drawn, in ticks (100 ms). */
export const INTERP_TICKS = 2;
/** Past this distance from the server, your fighter jumps to where the server has it. */
const SNAP_DISTANCE = 140;
/** The share of the gap to the server closed with each update. */
const NUDGE = 0.3;
/** Updates kept, about a second's worth. */
const KEEP = 24;
const HISTORY = 64;

interface Snapshot {
  tick: number;
  /** Local time it arrived, in ms. */
  at: number;
  bodies: SmashBody[];
  shots: SmashShot[];
  items: SmashItem[];
}

export interface Frame {
  /** The tick being drawn for everyone else (fractional). */
  tick: number;
  /** The tick your own fighter is at, for platforms that move. */
  localTick: number;
  bodies: SmashBody[];
  shots: SmashShot[];
  items: SmashItem[];
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** A move between two ticks longer than this is a teleport (a snap, a respawn): shown as is, not glided. */
const GLIDE_LIMIT = 300;

export class FightClient {
  #snaps: Snapshot[] = [];
  /** Your fighter as this screen sees it, or `null` for spectators. */
  local: SmashBody | null = null;
  #tick = 0;
  /** Where your fighter was one tick before `#tick`: its last step, to glide on between ticks. */
  #prev: { x: number; y: number } | null = null;
  /** Where your fighter was at each tick, to compare with the server's older news. */
  #history = new Map<number, { x: number; y: number }>();
  /** The tick each input message went out at, by `seq`. */
  #sentAt = new Map<number, number>();
  /** Ticks between sending keys and the server's updates showing them: the input delay. */
  #delay = 3;
  #keys = { held: 0, attack: false };
  /** What happened to your fighter here since `takeMoves` (`MOVED` bits), for sounds. */
  #moved = 0;
  #pausedAt: number | null = null;

  constructor(
    readonly me: number,
    readonly cast: SmashSpec[],
    readonly stage: StageId,
  ) {}

  /** The latest tick the server has told us about. */
  get serverTick(): number {
    return this.#snaps.at(-1)?.tick ?? 0;
  }

  /** Your fighter's tick. */
  get localTick(): number {
    return this.#tick;
  }

  /** The input delay in ticks, as measured. */
  get delay(): number {
    return this.#delay;
  }

  /** A view's fight, arrived at local time `now` (ms). */
  receive(v: SmashFightView, now: number) {
    const last = this.#snaps.at(-1);
    if (last && v.tick <= last.tick) return;
    const bodies = v.bodies.map(unpackBody);
    this.#snaps.push({ tick: v.tick, at: now, bodies, shots: v.shots.map(unpackShot), items: v.items });
    if (this.#snaps.length > KEEP) this.#snaps.shift();
    const server = v.mine;
    if (this.me < 0 || !server) return;
    // How long the server took to show our keys: a sample of the input delay.
    const sent = this.#sentAt.get(server.ack);
    if (sent !== undefined) {
      this.#delay = this.#delay * 0.8 + Math.max(1, v.tick - sent) * 0.2;
      for (const seq of this.#sentAt.keys()) if (seq <= server.ack) this.#sentAt.delete(seq);
    }
    this.reconcile(server, v.tick);
  }

  /** The keys held here, which move your fighter at once. */
  input(held: number, attack: boolean) {
    if (!this.local) return;
    const change = attack === this.#keys.attack ? null : attack ? "press" : "release";
    this.#keys = { held, attack };
    applyInput(this.local, held, change, this.local.ack);
  }

  /** An input message went out. */
  sent(seq: number) {
    this.#sentAt.set(seq, this.#tick);
    if (this.#sentAt.size > 64) this.#sentAt.delete(this.#sentAt.keys().next().value!);
  }

  /** Where the server is now, in ticks, as best we know: the latest update plus the time since. */
  estimate(now: number): number {
    const last = this.#snaps.at(-1);
    if (!last) return 0;
    return last.tick + ((this.#pausedAt ?? now) - last.at) / SMASH_TICK_MS;
  }

  /** Holds everything while the match is paused, and picks up where it was after. */
  hold(paused: boolean, now: number) {
    if (paused && this.#pausedAt === null) this.#pausedAt = now;
    if (!paused && this.#pausedAt !== null) {
      const gap = now - this.#pausedAt;
      for (const s of this.#snaps) s.at += gap;
      this.#pausedAt = null;
    }
  }

  /** What your fighter did here since the last call (`MOVED` bits). */
  takeMoves(): number {
    const moved = this.#moved;
    this.#moved = 0;
    return moved;
  }

  /** Moves your fighter up to `now` with the keys held here. */
  advance(now: number) {
    const local = this.local;
    if (!local || this.#pausedAt !== null) return;
    const target = Math.floor(this.estimate(now));
    // Way behind (a hidden tab, a stall): start again from the server.
    if (target - this.#tick > 20) {
      const last = this.#snaps.at(-1)?.bodies[this.me];
      if (last) this.local = { ...last, held: this.#keys.held, atkHeld: this.#keys.attack };
      this.#tick = target;
      this.#prev = null;
      return;
    }
    const spec = this.cast[this.me]!;
    const stage = STAGES[this.stage];
    while (this.#tick < target) {
      this.#prev = { x: this.local!.x, y: this.local!.y };
      this.#tick += 1;
      this.#moved |= stepFighter(this.local!, spec, stage, this.#tick, this.me, this.#tick > GO_TICK);
      this.#history.set(this.#tick, { x: this.local!.x, y: this.local!.y });
      this.#history.delete(this.#tick - HISTORY);
    }
  }

  /** Brings your fighter in line with the server's news of it at `tick`. */
  private reconcile(server: SmashBody, tick: number) {
    const local = this.local;
    // The server decides when you're hit, flying, out or back: follow it, then catch up with your keys.
    if (!local || server.out !== 0 || local.out !== 0 || server.stun > 0 || server.freeze > 0) {
      this.local = {
        ...server,
        held: this.#keys.held,
        atkHeld: this.#keys.attack,
        edges: 0,
        press: false,
        release: false,
      };
      if (!local) this.#tick = tick;
      const spec = this.cast[this.me];
      if (spec) {
        const stage = STAGES[this.stage];
        for (let t = tick + 1; t <= this.#tick; t++)
          stepFighter(this.local, spec, stage, t, this.me, t > GO_TICK);
      }
      return;
    }
    // What this screen had at the moment the server is telling us about, keys delayed and all.
    const then = this.#history.get(Math.round(tick - this.#delay)) ??
      this.#history.get(tick) ?? { x: local.x, y: local.y };
    const dx = server.x - then.x;
    const dy = server.y - then.y;
    if (Math.abs(dx) > SNAP_DISTANCE || Math.abs(dy) > SNAP_DISTANCE) {
      local.x += dx;
      local.y += dy;
      this.#prev = null;
      local.vx = server.vx;
      local.vy = server.vy;
      local.gr = -1;
    } else {
      local.x += dx * NUDGE;
      if (local.gr < 0) local.y += dy * NUDGE;
    }
    // What only the server knows.
    local.dmg = server.dmg;
    local.lives = server.lives;
    local.wear = server.wear;
    local.fast = server.fast;
    local.big = server.big;
    local.guard = server.guard;
    local.inv = server.inv;
    local.ack = server.ack;
  }

  /**
   * Your fighter for a frame at `now`: carried on from its latest predicted tick by the last step's motion, so it moves
   * smoothly at any frame rate instead of stepping 20 times a second.
   * A snap or a respawn (a big jump) shows at once.
   */
  #glide(now: number): SmashBody {
    const local = this.local!;
    const prev = this.#prev;
    if (!prev || this.#pausedAt !== null) return local;
    const u = Math.max(0, Math.min(1, this.estimate(now) - this.#tick));
    if (Math.abs(local.x - prev.x) > GLIDE_LIMIT || Math.abs(local.y - prev.y) > GLIDE_LIMIT) return local;
    // Carried on from the latest tick by its last step, so the glide adds no delay to your keys.
    return { ...local, x: local.x + (local.x - prev.x) * u, y: local.y + (local.y - prev.y) * u };
  }

  /** Everything to draw at local time `now`: everyone else in the recent past, your fighter as predicted. */
  frame(now: number): Frame | null {
    const snaps = this.#snaps;
    const latest = snaps.at(-1);
    if (!latest) return null;
    const tick = Math.max(snaps[0]!.tick, this.estimate(now) - INTERP_TICKS);
    let a = snaps[0]!;
    let b = a;
    for (const s of snaps) {
      if (s.tick <= tick) a = s;
      if (s.tick >= tick) {
        b = s;
        break;
      }
      b = s;
    }
    const u = b.tick > a.tick ? Math.min(1, (tick - a.tick) / (b.tick - a.tick)) : 0;
    const bodies = a.bodies.map((p, i) => {
      if (i === this.me && this.local) return this.#glide(now);
      const q = b.bodies[i] ?? p;
      // A ring-out or a comeback in between is a jump, not a glide.
      if (q.out !== p.out || Math.abs(q.x - p.x) > 300 || Math.abs(q.y - p.y) > 300) return u < 0.5 ? p : q;
      return {
        ...(u < 0.5 ? p : q),
        x: lerp(p.x, q.x, u),
        y: lerp(p.y, q.y, u),
        vx: lerp(p.vx, q.vx, u),
        vy: lerp(p.vy, q.vy, u),
      };
    });
    // Shots fly straight: from the latest update, carried on to now.
    const ahead = Math.max(0, this.estimate(now) - latest.tick);
    const shots = latest.shots.map((s) => ({ ...s, x: s.x + s.vx * ahead, y: s.y + s.vy * ahead }));
    return { tick, localTick: this.local ? this.#tick : tick, bodies, shots, items: latest.items };
  }
}
