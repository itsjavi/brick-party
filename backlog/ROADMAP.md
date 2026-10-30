# Roadmap

Brick Party is a browser party game for the Formbricks team to play together on a video call: four survey-themed
mini-games, 30 to 60 minutes or more, ending in a Retro Report with scores and awards. Each phase below is a goal; its
tasks carry the phase's label. See `backlog/backlog.py list --label phase-N`.

## Phase 0: Playable locally (`phase-0`), done

The whole game runs on one machine with `pnpm --dir apps/web dev`, and the tests pass.

- Players make a brick avatar with a nickname and get a recovery key to use it in other browsers.
- Rooms with a 4-letter code, an open-rooms list, chat, reactions, host controls and reconnection.
- Worst Feedback Ever, Bot or Not, Survey Says and Skip Logic, each with a "How to play" screen.
- Playlists of about 30 minutes, an hour, endless or custom, then a Retro Report, the Hall of Fame and shareable reports.
- Claude writes prompts and judges Bot or Not and Skip Logic, with hand-written packs and keyword judging as fallbacks.
- Procedural music and sound effects with volume controls.

## Phase 1: Live for the team (`phase-1`), in progress

The team can open a public URL and play a real session together.

- Deployed as one Cloudflare Worker with its D1 database and secrets.
- Claude-generated content and judging checked with a real API key.
- A first team playtest of 30 to 60 minutes, with what worked and what didn't written down as tasks.

## Phase 2: Polish from playtests (`phase-2`)

What the team learned while playing makes the next session better.

- Timers, scoring and prompts tuned from playtest feedback.

## Phase 3: More games, less typing (`phase-3`)

Three of the four games are about writing, so the next games need little or no typing and add what the playlist lacks:
playing as a team, strategy, and a show to watch together.

| Game                       | How you play                           | Pace                      | What it adds                                                          |
| -------------------------- | -------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| Doodle Champions (TASK-35) | Draw a fighter, then watch it fight    | Calm drawing, then a show | Players make something and cheer for it                               |
| Brick Brawl (TASK-36)      | Arena battle, everyone moving at once  | Quick 10-second turns     | Strategy and reading the other players, with no drawing and no words  |
| Fake Artist (TASK-37)      | Find the hidden player                 | Short, lots of talking    | Bluffing about a picture instead of words                             |
| In Order (TASK-38)         | Play numbers in order, as a team       | Tense, under 5 minutes    | Everyone wins or loses together, a breather between competitive games |
| Paint Grab (TASK-41)       | Paint the shared canvas in your colour | Real time, 45s rounds     | Frantic and wordless, the playlist's one real-time game               |
| Hue Clue (TASK-42)         | Clue a colour, everyone pins a guess   | Quick rounds, chatty      | Almost no reading, all about colour and gut feeling                   |
| Doodle Smash (TASK-43)     | Draw a fighter, then fight with it     | One live 2.5-minute brawl | Doodle Champions you play yourself, a platform fighter for everyone   |
| Make It Worse (TASK-44)    | Build a hostile form, race the others' | Build, then a short race  | Bad UX and accessibility as a game: every trap has a trick            |
| Pop-up Blaster (TASK-45)   | Shoot pop-ups onto the others' screens | Real time, frantic        | A Tetris 99-style fight against the web's worst pop-ups, no words     |

- Battles use simultaneous turns resolved by the server rather than real time, so they stay fair whatever each
  player's network delay. Doodle Smash is the exception: it runs live at fixed ticks on the server (DECISION-19).

## Always

- Content stays workplace-safe at both spice levels: no sexual content, slurs, politics, religion or body shaming, and
  nothing that punches down.
- Content works for an international audience: no city, country or language in-jokes.
- Every AI feature has an offline fallback, so a game never stalls when Claude is slow or unavailable.
- A player's view never includes another player's secrets, such as the Bot's question or who wrote an answer before
  the reveal.
- It looks and plays like a game rather than a website: the Toybox look, laptop first, still playable on phones.
- Hosting fits Cloudflare's free plan unless the 10 ms CPU limit forces Workers Paid.

## Not planned

Built-in voice chat (players talk on the team call), passwords or sign-in providers (a nickname and a recovery key are
the identity), hosting on Vercel, and two-player games (every game needs at least 3 players to work).
