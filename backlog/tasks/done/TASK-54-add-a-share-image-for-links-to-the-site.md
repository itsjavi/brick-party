---
id: TASK-54
title: Add a share image for links to the site
priority: high
labels: [phase-3, ui]
depends_on: []
created: 2026-10-30
completed: 2026-10-30
---

## Goal

When someone pastes a link to the site in a chat app or on a social site, the preview shows a Brick Party card: the
logo, what the game is, and a crowd of bricks. Room invite links get the same card.

## Acceptance criteria

- [x] A 1200×630 share card in the Toybox style, with no emojis, laid out at `/dev/og` (local only)
- [x] `pnpm og-image` renders the card into `apps/web/public/og-image.png`
- [x] Every page has `og:` and `twitter:` tags with an absolute image URL, room and test pages included
- [x] Typecheck and tests pass

## Notes

- The tags live in `root.tsx`'s `Layout` (`ShareTags`) rather than the root `meta`, because a page's own `meta`
  replaces the root's: the room page sets its own title. The root loader returns the request's origin, since previewers
  need an absolute `og:image` URL.
- Rooms, test rooms and the profile redirect visitors without a name to the home page; previewers follow the redirect
  and get the home page's tags, which are the same card. Signed-in, the room page keeps its title and has the tags.
- The card counts the games from `GAME_IDS`, but the PNG is a committed file: run `pnpm og-image` (with the dev server
  up) again after adding a game or changing the card.
- Not checked on the live site: previewers cache cards, so after deploying, check a link with a preview tool such as
  the one in the chat app the team uses.
