import { describe, expect, test } from "vitest";
import { GRACE_MS } from "../engine";
import { createRng } from "../rng";
import { players } from "../test-helpers";
import { fighterRig, fighterStats } from "./doodle-fighter";
import {
  SMASH_POINTS,
  doodleSmash,
  fightSight,
  doodleSmashActionSchema,
  randomSmashFighter,
  type DoodleSmashState,
} from "./doodle-smash";
import { SMASH_INPUT_GAP_MS, SmashInputQueue } from "./smash-input";
import {
  AIR_JUMPS,
  BLAST,
  CHARGE_TICKS,
  GO_TICK,
  KEY,
  RESPAWN_INVINCIBLE,
  RESPAWN_TICKS,
  SHIELD_BREAK_STUN,
  SMASH_LIVES,
  SMASH_TICK_MS,
  STAGES,
  STAGE_IDS,
  applyInput,
  fightPlacing,
  newFight,
  pickStage,
  smashBot,
  smashSpec,
  stepFight,
  stepFighter,
  type SmashFight,
  type SmashSpec,
  type StageId,
} from "./smash-sim";

const T0 = 1_000_000;

const SPEC: SmashSpec = {
  w: 40,
  h: 60,
  weight: 1,
  run: 12,
  jump: 26,
  weapon: "blade",
  reach: 50,
  damage: 10,
  cooldown: 8,
  shot: 10,
};

/** A fight on `stage` just past the countdown, with everyone parked far away until a test places them. */
function arena(cast: SmashSpec[], stage: StageId = "sketchbook"): SmashFight {
  const f = newFight(stage, cast.length, 1);
  f.tick = GO_TICK;
  f.nextItem = Number.POSITIVE_INFINITY;
  f.bodies.forEach((b, i) => {
    b.x = 340 + i * 60;
    b.y = 220;
    b.gr = 0;
  });
  return f;
}

function place(f: SmashFight, i: number, x: number, y: number, face: 1 | -1 = 1) {
  const b = f.bodies[i]!;
  Object.assign(b, { x, y, vx: 0, vy: 0, face, gr: -1 });
}

function press(f: SmashFight, i: number, held: number, attack: "press" | "release" | null = null) {
  applyInput(f.bodies[i]!, held, attack, f.bodies[i]!.ack + 1);
}

function run(f: SmashFight, cast: SmashSpec[], ticks: number): SmashFight {
  for (let k = 0; k < ticks; k++) f = stepFight(f, cast);
  return f;
}

/** Lets fighter `i` land wherever it is. */
const settle = (f: SmashFight, cast: SmashSpec[]) => run(f, cast, 4);

describe("Doodle Smash movement", () => {
  test("runs at its speed, walks off an edge and falls, and lands on what's below", () => {
    const cast = [SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 800, 222);
    f = settle(f, cast);
    expect(f.bodies[0]).toMatchObject({ gr: 0, y: 220 });
    press(f, 0, KEY.right);
    const x0 = f.bodies[0]!.x;
    f = run(f, cast, 10);
    expect(f.bodies[0]!.vx).toBeCloseTo(SPEC.run, 5);
    expect(f.bodies[0]!.x - x0).toBeGreaterThan(SPEC.run * 8);
    expect(f.bodies[0]!.face).toBe(1);
    // On to the stage's right edge, and off it.
    f = run(f, cast, 60);
    expect(f.bodies[0]!.gr).toBe(-1);
    expect(f.bodies[0]!.y).toBeLessThan(220);
  });

  test("jumps up through thin platforms, drops down through them, but never through the stage", () => {
    const cast = [{ ...SPEC, jump: 31 }, SPEC];
    let f = arena(cast);
    place(f, 0, 550, 222);
    f = settle(f, cast);
    press(f, 0, KEY.up);
    f = run(f, cast, 1);
    press(f, 0, 0);
    f = run(f, cast, 30);
    // The ledge over the stage at 420-680, 400 high.
    expect(f.bodies[0]).toMatchObject({ gr: 1, y: 400 });
    press(f, 0, KEY.down);
    f = run(f, cast, 1);
    press(f, 0, 0);
    f = run(f, cast, 20);
    expect(f.bodies[0]).toMatchObject({ gr: 0, y: 220 });
    press(f, 0, KEY.down);
    f = run(f, cast, 10);
    expect(f.bodies[0]).toMatchObject({ gr: 0, y: 220 });
  });

  test("jumps once more in the air, then not again until it lands; holding down falls fast", () => {
    const cast = [SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 800, 222);
    f = settle(f, cast);
    const tap = () => {
      press(f, 0, KEY.up);
      f = run(f, cast, 1);
      press(f, 0, 0);
    };
    tap();
    expect(f.bodies[0]!.vy).toBeGreaterThan(SPEC.jump - 3);
    f = run(f, cast, 8);
    tap();
    expect(f.bodies[0]!.aj).toBe(AIR_JUMPS - 1);
    expect(f.bodies[0]!.vy).toBeGreaterThan(SPEC.jump * 0.92 - 3);
    // A second air jump, as in Smash: room to recover.
    f = run(f, cast, 8);
    tap();
    expect(f.bodies[0]!.aj).toBe(0);
    expect(f.bodies[0]!.vy).toBeGreaterThan(SPEC.jump * 0.92 - 3);
    f = run(f, cast, 12);
    const before = f.bodies[0]!.vy;
    tap();
    expect(f.bodies[0]!.vy).toBeLessThan(before);
    press(f, 0, KEY.down);
    f = run(f, cast, 1);
    expect(f.bodies[0]!.vy).toBeLessThanOrEqual(-34);
    f = run(f, cast, 30);
    expect(f.bodies[0]).toMatchObject({ gr: 0, aj: AIR_JUMPS });
  });

  test("moving platforms carry whoever stands on them", () => {
    const cast = [SPEC, SPEC];
    let f = arena(cast, "bridge");
    const cloud = STAGES.bridge.platforms[3]!;
    f.tick = 0;
    place(f, 0, (cloud.x0 + cloud.x1) / 2, cloud.y + 1);
    f = run(f, cast, 3);
    expect(f.bodies[0]!.gr).toBe(3);
    const x = f.bodies[0]!.x;
    f = run(f, cast, 20);
    expect(f.bodies[0]!.gr).toBe(3);
    expect(f.bodies[0]!.x).toBeGreaterThan(x + 50);
  });
});

describe("Doodle Smash attacks", () => {
  /** Fighter 0 attacks fighter 1 standing `gap` in front of it, holding `held`. */
  function swing(spec: SmashSpec, gap: number, held = 0, victimSpec = SPEC) {
    const cast = [spec, victimSpec];
    let f = arena(cast);
    place(f, 0, 700, 222, 1);
    place(f, 1, 700 + spec.w / 2 + gap + victimSpec.w / 2, 222, -1);
    f = settle(f, cast);
    press(f, 0, held, "press");
    f = run(f, cast, 3);
    return f;
  }

  test("a blade hits in front within its reach, not behind and not past it", () => {
    expect(swing(SPEC, SPEC.reach * 0.6).bodies[1]!.dmg).toBe(SPEC.damage);
    expect(swing(SPEC, SPEC.reach * 1.5).bodies[1]!.dmg).toBe(0);
    const cast = [SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 700, 222, 1);
    place(f, 1, 660, 222);
    f = settle(f, cast);
    press(f, 0, 0, "press");
    f = run(f, cast, 3);
    expect(f.bodies[1]!.dmg).toBe(0);
  });

  test("no weapon means punches: shorter and lighter than the same fighter's blade", () => {
    const rng = createRng(3);
    const strokes = randomSmashFighter(rng.next).strokes;
    const armed = [...strokes, { c: 0, w: 2, p: [700, 500, 900, 300], t: "weapon" as const }];
    const rig = fighterRig(armed);
    const blade = smashSpec(fighterStats(armed, rig), rig, "blade");
    const bareRig = fighterRig(strokes.filter((s) => s.t !== "weapon"));
    const fists = smashSpec(
      fighterStats(
        strokes.filter((s) => s.t !== "weapon"),
        bareRig,
      ),
      bareRig,
      "blaster",
    );
    expect(fists.weapon).toBe("fists");
    expect(fists.reach).toBeLessThan(blade.reach);
    expect(fists.damage).toBeLessThan(blade.damage);
    const punch = { ...SPEC, weapon: "fists" as const, reach: 20, damage: 8 };
    expect(swing(punch, 15).bodies[1]!.dmg).toBe(8);
    expect(swing(punch, 35).bodies[1]!.dmg).toBe(0);
  });

  test("a blaster shoots ahead: the shot flies and hits far away, and the cooldown spaces shots out", () => {
    const blaster = { ...SPEC, weapon: "blaster" as const, cooldown: 12 };
    const cast = [blaster, SPEC];
    let f = arena(cast);
    place(f, 0, 400, 222, 1);
    place(f, 1, 1000, 222, -1);
    f = settle(f, cast);
    press(f, 0, 0, "press");
    f = run(f, cast, 2);
    expect(f.shots).toHaveLength(1);
    expect(f.events.some((e) => e.k === "shot" && e.a === 0)).toBe(true);
    press(f, 0, 0, "release");
    press(f, 0, 0, "press");
    f = run(f, cast, 2);
    expect(f.shots).toHaveLength(1);
    f = run(f, cast, 30);
    expect(f.bodies[1]!.dmg).toBe(blaster.damage);
    expect(f.events.some((e) => e.k === "hit" && e.a === 0 && e.b === 1)).toBe(true);
  });

  test("up attacks hit above, and a down attack in the air sends the one below downwards", () => {
    const cast = [SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 700, 222);
    place(f, 1, 700, 222 + SPEC.h + 10);
    f = run(f, cast, 1);
    press(f, 0, KEY.up, "press");
    f = run(f, cast, 3);
    expect(f.bodies[1]!.dmg).toBe(SPEC.damage);
    expect(f.bodies[1]!.vy).toBeGreaterThan(0);

    f = arena(cast);
    place(f, 0, 1450, 700);
    place(f, 1, 1450, 700 - SPEC.h - 20);
    f.bodies[1]!.vy = 0;
    press(f, 0, KEY.down, "press");
    f = run(f, cast, 2);
    expect(f.bodies[1]!.dmg).toBe(SPEC.damage);
    expect(f.bodies[1]!.vy).toBeLessThan(0);
  });

  test("holding attack fills the gauge, and letting go lands a boosted hit", () => {
    const cast = [SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 700, 222, 1);
    place(f, 1, 760, 222, -1);
    f = settle(f, cast);
    // Out of reach while charging: the press's own swing misses.
    f.bodies[1]!.x = 1100;
    press(f, 0, 0, "press");
    f = run(f, cast, CHARGE_TICKS + 10);
    expect(f.bodies[0]!.chg).toBe(CHARGE_TICKS);
    f.bodies[1]!.x = 760;
    press(f, 0, 0, "release");
    f = run(f, cast, 3);
    expect(f.bodies[0]!.chg).toBe(0);
    expect(f.bodies[1]!.dmg).toBeCloseTo(SPEC.damage * 2.5, 5);
    // A short tap is just the plain hit.
    f = arena(cast);
    place(f, 0, 700, 222, 1);
    place(f, 1, 760, 222, -1);
    f = settle(f, cast);
    press(f, 0, 0, "press");
    f = run(f, cast, 2);
    press(f, 0, 0, "release");
    f = run(f, cast, 4);
    expect(f.bodies[1]!.dmg).toBe(SPEC.damage);
  });

  test("each block in a row lets more through, a broken shield leaves you dizzy, and rest restores it", () => {
    const cast = [{ ...SPEC, cooldown: 5 }, SPEC];
    let f = arena(cast);
    place(f, 0, 700, 222, 1);
    place(f, 1, 760, 222, -1);
    f = settle(f, cast);
    press(f, 1, KEY.shield);
    const taken: number[] = [];
    for (let k = 0; k < 4; k++) {
      const before = f.bodies[1]!.dmg;
      f.bodies[1]!.x = 760;
      f.bodies[1]!.vx = 0;
      press(f, 0, 0, "press");
      f = run(f, cast, 2);
      press(f, 0, 0, "release");
      f = run(f, cast, 6);
      taken.push(Math.round((f.bodies[1]!.dmg - before) * 10) / 10);
    }
    expect(taken).toEqual([0, 3, 6, 10]);
    expect(f.events.some((e) => e.k === "break" && e.b === 1)).toBe(true);
    expect(f.bodies[1]!.stun).toBeGreaterThan(SHIELD_BREAK_STUN - 10);

    // One block, then a rest without shielding: the next block takes nothing again.
    f = arena(cast);
    place(f, 0, 700, 222, 1);
    place(f, 1, 760, 222, -1);
    f = settle(f, cast);
    press(f, 1, KEY.shield);
    press(f, 0, 0, "press");
    f = run(f, cast, 8);
    expect(f.bodies[1]!.wear).toBe(1);
    press(f, 1, 0);
    press(f, 0, 0, "release");
    f = run(f, cast, 25);
    expect(f.bodies[1]!.wear).toBe(0);
  });

  test("knockback grows with damage % and shrinks with weight", () => {
    const launch = (dmg: number, weight: number) => {
      const cast = [SPEC, { ...SPEC, weight }];
      let f = arena(cast);
      place(f, 0, 700, 222, 1);
      place(f, 1, 760, 222, -1);
      f = settle(f, cast);
      f.bodies[1]!.dmg = dmg;
      press(f, 0, KEY.right, "press");
      f = run(f, cast, 2);
      return Math.hypot(f.bodies[1]!.vx, f.bodies[1]!.vy);
    };
    expect(launch(100, 1)).toBeGreaterThan(launch(0, 1) * 2);
    expect(launch(100, 1.6)).toBeLessThan(launch(100, 1) * 0.7);
  });
});

describe("Doodle Smash lives", () => {
  test("a ring-out costs a life and credits whoever hit last; you come back invincible, and after 3 you're out", () => {
    const cast = [SPEC, SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 700, 222, 1);
    place(f, 1, 760, 222, -1);
    f = settle(f, cast);
    f.bodies[1]!.dmg = 400;
    press(f, 0, KEY.right, "press");
    f = run(f, cast, 60);
    expect(f.bodies[1]!.lives).toBe(SMASH_LIVES - 1);
    expect(f.tally[0]!.kos).toBe(1);
    expect(f.events.some((e) => e.k === "ko" && e.a === 0 && e.b === 1)).toBe(true);

    // Out for a moment, then back above the stage, fresh and invincible.
    f = arena(cast);
    place(f, 2, BLAST.right + 10, 400);
    f = run(f, cast, 1);
    expect(f.bodies[2]).toMatchObject({ lives: SMASH_LIVES - 1, out: RESPAWN_TICKS });
    expect(f.tally[2]!.selfKos).toBe(1);
    f.bodies[2]!.dmg = 80;
    f = run(f, cast, RESPAWN_TICKS);
    expect(f.bodies[2]).toMatchObject({ out: 0, dmg: 0, inv: RESPAWN_INVINCIBLE });
    expect(f.events.some((e) => e.k === "respawn" && e.a === 2)).toBe(true);
    // Hits don't land while invincible.
    f = run(f, cast, 30);
    place(f, 0, f.bodies[2]!.x - 50, f.bodies[2]!.y + 2, 1);
    f.bodies[0]!.cd = 0;
    press(f, 0, 0, "press");
    f = run(f, cast, 3);
    expect(f.bodies[2]!.dmg).toBe(0);

    // Two more ring-outs and it's out for good; with one fighter left standing, the fight is decided.
    for (const k of [1, 2]) {
      place(f, 2, BLAST.left - 10, 400);
      f = run(f, cast, 1);
      expect(f.bodies[2]!.lives).toBe(SMASH_LIVES - 1 - k);
      f = run(f, cast, RESPAWN_TICKS + 1);
    }
    expect(f.bodies[2]!.out).toBe(-1);
    expect(f.outOrder).toEqual([2]);
    expect(f.over).toBe(-1);
    f.bodies[1]!.lives = 1;
    place(f, 1, 800, BLAST.bottom - 10);
    f = run(f, cast, 1);
    expect(f.over).toBe(f.tick);
    expect(fightPlacing(f)).toEqual([0, 1, 2]);
  });
});

describe("Doodle Smash power-ups", () => {
  test("they spawn on fixed platforms now and then, and touching one uses it", () => {
    const cast = [SPEC, SPEC];
    let f = arena(cast, "split");
    f.nextItem = f.tick + 1;
    f.bodies.forEach((b) => (b.out = -1));
    f = run(f, cast, 1);
    expect(f.items).toHaveLength(1);
    const item = f.items[0]!;
    const fixed = STAGES.split.platforms.filter((p) => !p.move);
    expect(fixed.some((p) => item.x >= p.x0 && item.x <= p.x1 && item.y > p.y)).toBe(true);
    expect(f.nextItem).toBeGreaterThan(f.tick + 100);
  });

  test.each([
    ["heal", { dmg: 60 }, { dmg: 20 }],
    ["speed", {}, { fast: 160 }],
    ["power", {}, { big: true }],
    ["shield", { wear: 2 }, { wear: 0, guard: 200 }],
  ] as const)("%s", (kind, before, after) => {
    const cast = [SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 800, 222);
    f = settle(f, cast);
    Object.assign(f.bodies[0]!, before);
    f.items = [{ id: 1, kind, x: 800, y: 240, ttl: 100 }];
    f = run(f, cast, 1);
    expect(f.items).toHaveLength(0);
    expect(f.bodies[0]).toMatchObject(after);
    expect(f.tally[0]!.powerUps).toBe(1);
    expect(f.events.at(-1)).toMatchObject({ k: "power", a: 0, p: kind });
  });

  test("a big hit makes the next attack a full-power one", () => {
    const cast = [SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 700, 222, 1);
    place(f, 1, 760, 222, -1);
    f = settle(f, cast);
    f.bodies[0]!.big = true;
    press(f, 0, 0, "press");
    f = run(f, cast, 2);
    expect(f.bodies[1]!.dmg).toBeCloseTo(SPEC.damage * 2.5, 5);
    expect(f.bodies[0]!.big).toBe(false);
  });
});

describe("Doodle Smash stages", () => {
  test("each fight picks one of at least four stages, each with platforms on several levels", () => {
    expect(STAGE_IDS.length).toBeGreaterThanOrEqual(4);
    const picked = new Set(Array.from({ length: 200 }, (_, seed) => pickStage(seed)));
    expect(picked).toEqual(new Set(STAGE_IDS));
    for (const id of STAGE_IDS) {
      const stage = STAGES[id];
      expect(new Set(stage.platforms.map((p) => p.y)).size).toBeGreaterThanOrEqual(3);
      expect(stage.platforms.some((p) => !p.solid)).toBe(true);
      expect(stage.platforms.some((p) => p.solid)).toBe(true);
      // Everyone starts standing on something.
      for (const [x, y] of stage.spawns)
        expect(stage.platforms.some((p) => p.y === y && x >= p.x0 && x <= p.x1)).toBe(true);
    }
  });

  test("twelve fighters start on platforms on every stage", () => {
    const cast = Array.from({ length: 12 }, () => SPEC);
    for (const id of STAGE_IDS) {
      const f = run(newFight(id, 12, 5), cast, GO_TICK);
      expect(f.bodies.every((b) => b.gr >= 0 && b.lives === SMASH_LIVES)).toBe(true);
    }
  });
});

describe("Doodle Smash determinism", () => {
  const botFight = (ticks: number) => {
    const rng = createRng(11);
    const cast = Array.from({ length: 6 }, () => {
      const d = randomSmashFighter(rng.next);
      const rig = fighterRig(d.strokes);
      return smashSpec(fighterStats(d.strokes, rig), rig, d.weapon);
    });
    let f = newFight("tower", 6, 77);
    for (let k = 0; k < ticks; k++) {
      f.bodies.forEach((b, i) => {
        const want = smashBot(f, cast, i);
        applyInput(
          b,
          want.held,
          want.attack === b.atkHeld ? null : want.attack ? "press" : "release",
          b.ack + 1,
        );
      });
      f = stepFight(f, cast);
    }
    return f;
  };

  test("the same fight and inputs always give the same fight", () => {
    expect(JSON.stringify(botFight(600))).toBe(JSON.stringify(botFight(600)));
  });

  test("a screen predicting its own fighter with stepFighter matches the server's tick", () => {
    const cast = [SPEC, SPEC];
    let f = arena(cast);
    place(f, 0, 600, 222);
    f = settle(f, cast);
    const local = { ...f.bodies[0]! };
    const script = [
      KEY.right,
      KEY.right,
      KEY.right | KEY.up,
      KEY.right,
      0,
      KEY.left,
      KEY.left | KEY.up,
      KEY.left,
      0,
      0,
    ];
    for (let k = 0; k < 40; k++) {
      const held = script[k % script.length]!;
      press(f, 0, held);
      applyInput(local, held, null, local.ack + 1);
      f = stepFight(f, cast);
      stepFighter(local, cast[0]!, STAGES[f.stage], f.tick, 0, true);
      expect(local).toEqual(f.bodies[0]);
    }
  });

  test("nobody moves before the countdown ends", () => {
    const cast = [SPEC, SPEC];
    let f = newFight("sketchbook", 2, 1);
    f = run(f, cast, 5);
    const x = f.bodies[0]!.x;
    press(f, 0, KEY.right, "press");
    f = run(f, cast, 10);
    expect(f.bodies[0]!.x).toBe(x);
    expect(f.bodies[0]!.atk).toBe(0);
  });
});

describe("Doodle Smash input", () => {
  test("sends key changes at once, then no faster than the gap, with the latest keys", () => {
    const q = new SmashInputQueue();
    q.set(KEY.right, false);
    expect(q.take(0)).toEqual({ type: "input", held: KEY.right, attack: null, seq: 1 });
    q.set(KEY.right | KEY.up, false);
    expect(q.take(50)).toBeNull();
    q.set(KEY.left, false);
    // The jump pressed in between still goes out, held once.
    expect(q.take(SMASH_INPUT_GAP_MS)).toMatchObject({ held: KEY.left | KEY.up, seq: 2 });
    expect(q.take(2 * SMASH_INPUT_GAP_MS)).toMatchObject({ held: KEY.left, seq: 3 });
    expect(q.take(3 * SMASH_INPUT_GAP_MS)).toBeNull();
  });

  test("a quick tap of attack goes out as a press, then a release", () => {
    const q = new SmashInputQueue();
    q.set(0, true);
    q.set(0, false);
    expect(q.take(0)).toMatchObject({ attack: "press" });
    expect(q.take(SMASH_INPUT_GAP_MS)).toMatchObject({ attack: "release" });
    expect(q.take(2 * SMASH_INPUT_GAP_MS)).toBeNull();
  });

  test("mashing keys stays within the room's message limits", () => {
    // The room's bucket (DECISION-11): 8 a second on average, bursts of 20.
    let tokens = 20;
    let at = 0;
    let dropped = 0;
    let sent = 0;
    const take = (now: number) => {
      tokens = Math.min(20, tokens + ((now - at) / 1000) * 8);
      at = now;
      if (tokens < 1) dropped += 1;
      else tokens -= 1;
    };
    const q = new SmashInputQueue();
    const rng = createRng(5);
    for (let now = 0; now < 120_000; now += 16) {
      q.set(rng.int(32), rng.next() < 0.5);
      if (q.take(now)) {
        sent += 1;
        take(now);
      }
      // Some chat as well, every 3 seconds.
      if (now % 3000 < 16) take(now);
    }
    expect(dropped).toBe(0);
    expect(sent / 120).toBeLessThanOrEqual(1000 / SMASH_INPUT_GAP_MS);
  });
});

describe("Doodle Smash game", () => {
  const ps = players(3);
  const init = () =>
    doodleSmash.init({ players: ps, content: {}, spice: "mild", seed: 9, now: T0, pace: 1 }).state;
  const act = (s: DoodleSmashState, playerId: string, action: unknown, now = T0) =>
    doodleSmash.reduce(s, { type: "action", playerId, action: doodleSmashActionSchema.parse(action), now })
      .state;
  const tick = (s: DoodleSmashState, now: number) => doodleSmash.reduce(s, { type: "tick", now }).state;
  const drawing = (seed: number) => randomSmashFighter(createRng(seed).next).strokes;

  /** Everyone has drawn; the fight starts at `T0 + 1000`. */
  function toFight() {
    let s = init();
    s = act(s, "p0", { type: "fighter", strokes: drawing(1), weapon: "blaster" });
    s = act(s, "p1", { type: "fighter", strokes: drawing(2) });
    s = act(s, "p2", { type: "fighter", strokes: drawing(3), weapon: "blade" });
    expect(s.phase).toBe("weighin");
    s = tick(s, T0 + 1000 + 12_000);
    expect(s.phase).toBe("fight");
    return s;
  }

  test("drawings stay secret, the weapon toggle is kept (blade when left out), and the weigh-in picks a stage", () => {
    let s = init();
    s = act(s, "p0", { type: "fighter", strokes: drawing(1), weapon: "blaster" });
    expect(doodleSmash.view(s, "p1").myDrawing).toBeNull();
    expect(doodleSmash.view(s, "p0").myDrawing?.weapon).toBe("blaster");
    expect(doodleSmash.view(s, "p1").fighters).toEqual([]);
    s = act(s, "p1", { type: "fighter", strokes: drawing(2) });
    expect(s.drawings.p1!.weapon).toBe("blade");
    // Time runs out on p2: the game draws one.
    s = tick(s, s.phaseEndsAt + GRACE_MS);
    expect(s.phase).toBe("weighin");
    expect(s.fighters.map((f) => [f.id, f.auto])).toEqual([
      ["p0", false],
      ["p1", false],
      ["p2", true],
    ]);
    expect(s.fighters[0]!.weapon).toBe("blaster");
    expect(STAGE_IDS).toContain(s.stage);
    const view = doodleSmash.view(s, "p0");
    expect(view.withDrawings).toBe(true);
    expect(view.fighters[2]!.strokes?.length).toBeGreaterThan(0);
  });

  test("the fight runs live: the room's ticks step it by the clock, and players' keys move their fighters", () => {
    let s = toFight();
    expect(doodleSmash.live!(s)).toEqual({ tickMs: SMASH_TICK_MS });
    const start = s.fightStartedAt;
    s = tick(s, start + 49);
    expect(s.fight!.tick).toBe(0);
    s = tick(s, start + 5 * SMASH_TICK_MS + 5);
    expect(s.fight!.tick).toBe(5);
    // A long stall is skipped rather than replayed all at once.
    s = tick(s, start + 200 * SMASH_TICK_MS);
    expect(s.fight!.tick).toBe(13);
    s = tick(s, start + 205 * SMASH_TICK_MS);
    expect(s.fight!.tick).toBe(18);
    // Past the countdown, nobody has moved yet.
    let t = 205;
    while (s.fight!.tick <= GO_TICK + 5) s = tick(s, start + (t += 4) * SMASH_TICK_MS);
    const x = s.fight!.bodies[0]!.x;
    const before = s;
    s = act(s, "p0", { type: "input", held: KEY.left, attack: null, seq: 1 }, start + t * SMASH_TICK_MS);
    // A tick and a move copy the fight, never the drawings, and leave the old state alone.
    expect(s.fighters).toBe(before.fighters);
    expect(before.fight!.bodies[0]!.held).toBe(0);
    expect(s.fight!.bodies[0]).toMatchObject({ held: KEY.left, ack: 1 });
    s = tick(s, start + (t + 8) * SMASH_TICK_MS);
    expect(s.fight!.bodies[0]!.x).toBeLessThan(x - 50);
    // Spectators and unknown players can't steer anything.
    const same = act(s, "p9", { type: "input", held: KEY.right, seq: 1 });
    expect(same).toBe(s);
  });

  test("views carry the drawings in the countdown and when a screen asks, and stay small otherwise", () => {
    let s = toFight();
    const start = s.fightStartedAt;
    expect(doodleSmash.view(s, "p0").withDrawings).toBe(true);
    for (let t = 4; t <= GO_TICK + 40; t += 4) s = tick(s, start + t * SMASH_TICK_MS + 1);
    // Every second, the names and specs, without the drawings.
    let view = doodleSmash.view(s, "p0");
    expect(view.withDrawings).toBe(false);
    expect(view.fighters[0]).not.toHaveProperty("strokes");
    expect(view.fighters[0]!.spec).toEqual(s.cast[0]);
    s = tick(s, start + (GO_TICK + 44) * SMASH_TICK_MS + 1);
    view = doodleSmash.view(s, "p0");
    expect(view.fighters).toEqual([]);
    expect(view.me).toBe(0);
    expect(view.drawingsVersion).toBe(doodleSmash.view(s, "p1").drawingsVersion);
    // Your own fighter in full, everyone packed, positions to a tenth of a unit: a small update.
    expect(view.fight!.mine).toMatchObject({ lives: 3, held: 0, ack: 0 });
    expect(fightSight(view.fight!, 0).bodies[1]).toMatchObject({
      lives: 3,
      x: Math.round(s.fight!.bodies[1]!.x * 10) / 10,
    });
    expect(JSON.stringify(view).length).toBeLessThan(1500);
    for (let t = GO_TICK + 48; t < 400; t += 4) s = tick(s, start + t * SMASH_TICK_MS + 1);
    s = tick(s, start + 400 * SMASH_TICK_MS + 1);
    // Players' screens don't get the drawings again unless they ask; spectators get them now and then.
    expect(doodleSmash.view(s, "p0").withDrawings).toBe(false);
    expect(doodleSmash.view(s, null).withDrawings).toBe(true);
    s = doodleSmash.reduce(s, { type: "action", playerId: "p1", action: { type: "drawings" }, now: start + 400 * SMASH_TICK_MS + 2 }).state;
    expect(doodleSmash.view(s, "p1").withDrawings).toBe(true);
    expect(doodleSmash.view(s, "p0").withDrawings).toBe(false);
  });

  test("the last fighter standing ends it soon after; points for placing and KOs, stats for the awards", () => {
    let s = toFight();
    const start = s.fightStartedAt;
    s = tick(s, start + (GO_TICK + 2) * SMASH_TICK_MS);
    // p0 knocks out p2 three times; p1 falls off on its own.
    const fight = structuredClone(s.fight!);
    fight.bodies[2]!.lives = 1;
    fight.bodies[1]!.lives = 1;
    Object.assign(fight.bodies[2]!, { x: BLAST.right + 5, hitBy: 0, hitAt: fight.tick });
    fight.tally[0]!.kos = 2;
    fight.tally[0]!.powerUps = 1;
    Object.assign(fight.bodies[1]!, { x: BLAST.left - 5, y: 300 });
    s = { ...s, fight };
    const now = start + (GO_TICK + 3) * SMASH_TICK_MS;
    s = tick(s, now);
    expect(s.fight!.over).toBe(s.fight!.tick);
    expect(s.phaseEndsAt).toBeLessThanOrEqual(now + 2500);
    s = tick(s, s.phaseEndsAt);
    expect(s.phase).toBe("results");
    expect(s.placing![0]).toBe("p0");
    expect(s.points.p0).toBe(SMASH_POINTS.place[0] + 3 * SMASH_POINTS.ko);
    expect(doodleSmash.stats(s).p0).toMatchObject({ smashKos: 3, smashPowerUps: 1 });
    expect(doodleSmash.stats(s).p1).toMatchObject({ smashSelfKos: 1 });
    expect(doodleSmash.live!(s)).toBeNull();
    s = tick(s, s.phaseEndsAt);
    expect(doodleSmash.isOver(s)).toBe(true);
  });

  test("at the bell, the best standing wins; someone who left is out and gets nothing", () => {
    let s = toFight();
    s = doodleSmash.reduce(s, { type: "player_left", playerId: "p2", now: s.fightStartedAt + 100 }).state;
    expect(s.fight!.bodies[2]!.out).toBe(-1);
    const fight = structuredClone(s.fight!);
    fight.bodies[0]!.lives = 2;
    s = { ...s, fight };
    s = tick(s, s.phaseEndsAt);
    expect(s.placing).toEqual(["p1", "p0", "p2"]);
    expect(s.points).toEqual({ p0: SMASH_POINTS.place[1], p1: SMASH_POINTS.place[0], p2: 0 });
  });

  test("bots steer their fighters through the game's own bot input", () => {
    let s = toFight();
    const start = s.fightStartedAt;
    s = tick(s, start + (GO_TICK + 5) * SMASH_TICK_MS);
    let moves = 0;
    for (let t = GO_TICK + 6; t < GO_TICK + 200; t++) {
      for (const id of ["p0", "p1", "p2"]) {
        const action = doodleSmash.botInput!(s, id, start + t * SMASH_TICK_MS);
        if (!action) continue;
        expect(doodleSmashActionSchema.safeParse(action).success).toBe(true);
        moves += 1;
        s = act(s, id, action, start + t * SMASH_TICK_MS);
      }
      s = tick(s, start + t * SMASH_TICK_MS + 1);
    }
    expect(moves).toBeGreaterThan(20);
    expect(s.fight!.bodies.some((b) => b.dmg > 0)).toBe(true);
  });
});
