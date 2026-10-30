---
id: TASK-44
title: Add Make It Worse, build a hostile survey and race through the others'
priority: medium
labels: [phase-3, new-game]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

A game about bad UX and accessibility, in the spirit of web games like User Inyerface. Each player gets the same short
survey and a form builder with a palette of terrible components, and makes the form fight the user. Then everyone races
to fill in each other's forms with the answers they're given. Like Skip Logic, players make something and the others
play it, but here the others have to get through to Submit. Every trap has a trick that gets you past it, and the
reveal after each form shows the trick and the real-world fix. Almost no typing.

## Acceptance criteria

- [x] Build phase: a form builder over a base survey of 3 to 5 questions. Players place traps from a preset palette on
      questions and buttons by clicking, with no typing. A budget limits how many traps a form gets: traps cost 1 to 3
      points, each trap fits once per form, and the builder shows what's left (DECISION-20).
- [x] At least 10 traps, each with a trick that gets you past it and a short "real-world fix" line for the reveal. A
      starting set:
  - Runaway button: Next or Submit dodges the cursor. Trick: Tab to it and press Enter.
  - Modal loop: closing a modal opens another one. Trick: Esc closes the whole stack.
  - Tab order maze: clicks don't focus the fields and Tab jumps around in a scrambled order. Trick: follow the focus
    ring, Shift+Tab back.
  - Impossible CAPTCHA or a "prove you're human" labyrinth that can't be solved. Trick: the small "accessible version"
    link.
  - Reversed or shuffled rating scale. Trick: read the labels.
  - Double-negative checkbox ("Uncheck to not stop receiving emails"). Trick: read it twice.
  - Confirmshaming: a big "Yes" next to a tiny "No, I like wasting money". Trick: the small link.
  - Ghost text: questions in almost-white on white. Trick: select the text to highlight it.
  - Slider for a number that should be typed, such as an age or a phone number. Trick: arrow keys step one at a time.
  - Disguised buttons: Submit looks disabled, the bright button resets the form. Trick: read the button, not the
    colour.
  - Terms box that must be scrolled to the bottom before Accept works. Trick: End or Page Down.
- [x] Play phase: forms are played one at a time and everyone except the designer fills it in at once, with the answers
      to give on a sticky note. The designer and the shared screen watch everyone's progress live.
- [x] Scoring: players earn points for finishing fast and for each correct answer. The designer earns points for every
      wrong answer and every second the form costs the others, but scores nothing when fewer than half the players
      finish ("Sued").
- [x] Reveal after each form: every trap, who fell for it, its trick and its real-world fix.
- [x] Bots can play it: the designer bot places random traps within the budget; the player bot finishes after a delay
      per trap, sometimes giving a wrong answer on reading traps. Moves in `packages/game/src/bots.ts`, `state` lines in
      `apps/cli/src/moves.ts`, and play notes in `.claude/agents/playtest-driver.md`.
- [x] Plays to the end in a "Test it" room, pauses cleanly, and gets through a `/playtest` match with bots.
- [x] A "How to play" screen, awards (for example Dark Lord of UX, Escape Artist, Read the Fine Print, Most Sued),
      sounds, and tests for the rules.

## Notes

- Ideas from the chat that fit as traps: the Tab order maze and the impossible CAPTCHA or human-proof labyrinth.
- Inspiration: User Inyerface (a whole form that fights you) and the escalating rules of browser games like The
  Password Game and I'm Not a Robot. Take the idea, not their content.
- The traps make fun of the designer, never of the person filling in the form or of anyone who relies on accessible
  design ("nothing punches down" in the roadmap).
- Traps run on the player's screen. The server only checks what a player submits against the answers they were asked
  to give, and the time it took; players could cheat, which is fine for a team game.
- The open questions are settled in DECISION-22: keyboard-only traps stay as they are on phones, the base surveys come
  from a hand-written pack, and only 4 random forms are played, with the rest in a gallery in the reveal.
- The user chose to build it alongside the polish tasks (TASK-49, TASK-52, TASK-53), on its own branch. When those land,
  merge main in and use their icons and sounds instead of emojis or placeholder sounds.

### Build notes

- Rules: `packages/game/src/games/make-it-worse.ts`. Phases: build (90 s, ends early when everyone locks), then per
  played form ready (6 s, the sticky note), play (75 s, ends when every filler submits) and reveal (16 s), then a
  gallery (12 s) for unplayed forms. 12 traps (the 11 above plus "Microscopic targets" for choice questions), budget 7.
  Forms left empty at the end of building get random traps, marked "random traps".
- Every trap also gives in to brute force after a while (runaway: 14 dodges, modal loop: 6 closes, Tab maze: 10 blocked
  clicks, CAPTCHA: 5 failed tries), so every form can be finished by construction (DECISION-20) and phone players have
  a harder time, not an impossible one (DECISION-22). The trick is just much faster.
- Survey answers: choice option, rating 1-5 (never 3, which a backwards scale leaves in place), a number, a ticked box.
  The double negative comes pre-ticked and ticked means no.
- Scoring (`MIW_POINTS`): fillers get 50 per right answer, 100 for finishing and up to 200 for speed, minus 100 for
  buying Premium. The designer gets 50 per wrong answer or upsell and 3 per second each filler spends (the whole 75 s
  for anyone who doesn't finish), scaled as if 3 players filled it in, so room size doesn't matter. "Sued" (nothing)
  when fewer than half finish. "Who fell for it": reading traps from wrong answers on their question (server-side),
  the others as reported by the player's screen, plus whatever a non-finisher was stuck on.
- Content: `packages/content/packs/make-it-worse.json`, 8 surveys (5 mild, 3 spicy: office, engineering, ai, product,
  formbricks and surreal), written with the add-content skill; Claude never writes these (`MAIN_LIST` is empty). The
  skill's `check.py` got a `miw_survey` shape rule.
- Awards: Dark Lord of UX (`darkLord`), Escape Artist (`escapes`), Read the Fine Print (`finePrint`), Most Sued
  (`sued`), Premium Member (`upsold`).
- Sounds use existing effects (pop, whoosh, bump, error, thud, start, reveal, lose, drop); music is think, tension and
  reveal. Icons in the game are inline SVG in the Toybox style (`games/worse/TrapIcon.stsx`). The game and award
  `emoji` fields stay only because this branch's types still require them: TASK-57 moves everything onto the shared
  icon module (DECISION-23 on main) and the reworked sounds once main is merged in.
- Verified: typecheck and every test suite. A "Test it" room played to the Retro Report with the awards; the pause
  held the clock and the bots, and the paused time didn't count against a filler. Tried every trap by hand: runaway
  dodging the mouse and Tab+Enter, modal loop growing and Esc (and giving up after 6 closes), Tab maze blocking clicks
  with a scrambled tab order and a visible focus ring, CAPTCHA failing and its accessible version, terms refusing until
  End, disguised buttons, confirmshaming (yes and no), backwards scale, double negative, ghost text, slider with arrow
  keys, microscopic targets with Tab and arrows. A `/playtest` match (room of 4, one human) ran to the report with no
  missed deadlines, no `[auto]` or `[late]` lines and no `act` errors.
- Playtest follow-ups applied: bots' state shows points left while building; popups stick to the screen on a long
  form; a stale notice clears once you get past it; upsell penalty 50 to 100; designer per-second 2 to 3 (bots got
  through a 7-point keyboard form in about 25 s, so its designer earned only 162 against about 430 per filler).
- Worth watching with people: whole-form traps cost bots more time than reading traps, which bots only fall for 30% of
  the time, so bot-played scoring may favour whole-form traps. Build takes 90 s, which bots finish in seconds; people
  need it.
