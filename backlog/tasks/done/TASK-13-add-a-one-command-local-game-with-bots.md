---
id: TASK-13
title: Add a one-command local game with bots
priority: medium
labels: [phase-1, tooling]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

One command gets a developer into a local room with bots, without copying a room code by hand.

## Acceptance criteria

- [x] `pnpm play [count]` starts the dev server, or reuses one that's already running.
- [x] It opens a new room in the default browser.
- [x] Once you're in that room, it adds `count` bots to it (default 3), and you're the host.
- [x] Ctrl+C removes the bots and stops the dev server it started.
- [x] The README mentions it.

## Notes

- The script picks a random room code and opens `/r/CODE`; any valid code is a room. It watches the open-rooms list
  (`/parties/lobby-registry/main`) for that code, which shows up once you're online in it, so the bots always join
  after you.
- The first version waited for you to press "Create a room" and took the first lobby reported after the script
  started. That failed in testing: a tab still open on an older room reconnected when the dev server came up, and the
  bots joined that room before anyone created one. The list can't tell a new room from a reconnect.
- pnpm ignores SIGTERM, and the pnpm it starts runs the dev server in a process group of its own, so the script stops
  it with SIGINT. Playwright's own SIGINT handler exits the process with code 130 after closing its browsers, which
  raced the script's cleanup and left the dev server running. `scripts/lib/bots.mjs` launches with
  `handleSIGINT: false`, and both scripts close the bots themselves.
- `pnpm bots BRKZ 3` still adds bots to a room that's already open, and uses the same bot code.
- Verified on the real dev server with nothing running beforehand: `pnpm play 2` started it in about 6 seconds and
  opened a new room. An old room tab that reconnected was ignored, and both bots joined once a player opened the room
  link, with that player as host. SIGINT to `pnpm play` (what Ctrl+C sends) stopped the bots, the script and the
  whole dev server within a second. Also checked: reusing a running server, `pnpm bots` joining and leaving on Ctrl+C,
  and counts outside 1 to 11 printing the usage line. The browser was opened with a stand-in for `open`, which logged
  the room URL.
