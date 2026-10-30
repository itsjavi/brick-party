---
id: TASK-35
title: Add Doodle Champions, where drawn fighters battle
priority: medium
labels: [phase-3, new-game, drawing]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A game where each player draws a fighter, part by part, and then everyone watches the fighters battle. How a fighter
moves comes from what was drawn, so the fun is seeing how a six-legged noodle or a legless blob gets around. It adds a
make-it-then-watch-it game with no typing.

## Acceptance criteria

- [x] Players draw a fighter on part layers: body (required), legs, arms and an optional weapon, reusing the Skip Logic
      canvas.
- [x] Stats come from the drawing's shapes alone, and the same drawing always gives the same stats. Colours are only
      for looks.
- [x] Fighters animate from their own strokes: each part is joined where it touches the body, legs swing from the hip,
      arms rotate at the shoulder, and a fighter without legs hops, rolls or slides.
- [x] Fights are seen from the side: fighters move along a 2D floor by simple rules for stepping, jumping, hitting and
      knockback, set by their stats, with the drawn parts animated on top.
- [x] The server resolves each fight from a seeded `rng.ts`, and every client replays the same fight.
- [x] Short duels run side by side, scoring points for wins, and the game ends with one free-for-all, so a big room
      doesn't wait through a long knockout bracket.
- [x] Players bet points on duels, so players with weak fighters still have something to play for.
- [x] Claude names fighters and commentates fights, with stock lines as the offline fallback.
- [x] Retro Report awards for the game, such as most legs, won without arms, or knocked out by a noodle.
- [x] A "How to play" screen, and tests for stat derivation and fight resolution.
- [x] The bot CLI plays the game: `todoFor`, `botLines` and `sharedLines` in `apps/cli/src/moves.ts` cover it, with
      an autopilot fallback move for a bot that runs out of time, and tests next to the existing ones.
- [x] The playtest `playtest-driver` agent knows how to play it in character (`.claude/agents/playtest-driver.md`), and
      a full `/playtest` match with bots gets through the game.
- [x] Bots can draw each part: the `brick shapes` drawing language in `apps/cli/src/draw.ts` can tag shapes with a
      part, and `brick look` shows a bot the fighters it has to bet on.

## Notes

- Stat ideas, to tune in playtests:
  - **Body**: a bigger area means more weight and health, but slower and harder to knock back. Round bodies roll, tall
    ones topple.
  - **Legs**: the number and length decide movement. Long legs stride and jump, many short legs scuttle, and no legs
    means hop, roll or slide.
  - **Arms**: longer arms reach further, and more arms hit more often.
  - **Weapon**: more ink does more damage, and a longer weapon reaches further but swings slower.
- Each stroke gets an optional part tag, added to the stroke format the same way DECISION-16 added the kind `k`.
- The fight model is DECISION-18: simple rules in side view, not a physics simulation, and stats from shape only.
- Built (not yet playtested): the game is `packages/game/src/games/doodle-champions.ts`; shapes, stats, rig, fight
  rules, stock names and commentary are in `doodle-fighter.ts`; the screen is
  `apps/web/app/components/games/DoodleChampions.stsx` with the replay in `doodle/FightArena.stsx` and `doodle/pose.ts`.
- Strokes carry the part as `t` (`body`, `legs`, `arms`, `weapon`); untagged strokes count as body (DECISION-16 style).
  `brick shapes` has `part NAME`. A fighter is capped at 120 strokes and 4,000 point values (`DOODLE_LIMITS`).
- Format: everyone draws (90 s), a weigh-in (14 s), then up to three duel rounds paired round-robin with no rematches,
  then one free-for-all of the players' fighters. An odd count adds a house "Training Dummy" to the duels. Each round
  has a betting window (20 s first, then 15 s), the fights (as long as the longest, about 10 s), and results (9 s).
  About 5 minutes for 4 to 6 players.
- Bets: one fighter per round, stake 25, 50 or 100. A win pays stake x odds, a loss costs the stake, so a game score
  can drop. Odds come from each fighter's power squared, which matched how often the stronger fighter won over many
  random fights; favorites win about 80% of duels.
- Claude: one Haiku call at the weigh-in (`nameFighters` in packages/content/src/ai.ts, 12 s timeout, budget-gated,
  never in test rooms) names every fighter and writes three lines per fight. The server resolves every fight of the
  game at the weigh-in for that call, then again with frames when each round starts. Stock names and lines otherwise.
- CPU: the weigh-in for 12 fighters at the size cap took about 5 ms on a laptop, a round's fights about 3 ms.
- Not seen in a browser yet: the part tabs on the canvas and the replay typecheck, and the pose math has unit tests
  (`doodle/pose.test.ts`), but nobody has watched a fight. The playtest should check both criteria left open.

Verified: a "Test it" room in the browser (part tabs, live animated preview with stats, weigh-in cards,
bets with odds, side-by-side fight replays with toppling and hit effects) and a `/playtest` match with three
Claude-drawn fighters: no act errors, no missed deadlines. Fixes from the playtest: Doodle knockouts use their own
stat (`fighterKos`, Knockout Artist award) instead of Brick Brawl's, a player's game score never ends below 0 after
lost bets, and odds stay between x0.5 and x3 (x4 in the free-for-all). To tune with the team: noodle-thin fighters
lose almost every fight.
