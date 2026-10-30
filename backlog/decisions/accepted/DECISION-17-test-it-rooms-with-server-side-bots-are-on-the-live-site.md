---
id: DECISION-17
title: Test it rooms with server-side bots are on the live site
date: 2026-10-30
tasks: [TASK-39]
---

## Context

People want to try one game without gathering other players. A "Test it" button on each homepage game card starts a
private room for that game, with bots playing the other seats on the server. It could be a tool for local development
only, or part of the live site.

## Decision

"Test it" is on the live site for everyone, not only in local development.

## Consequences

- Anyone can learn a game before a session, and new games can be checked on the deployed site.
- Test rooms use real Durable Object and request quota, so they make no Claude calls, count towards the room rate
  limits and are cleaned up like other rooms.
- Bot moves must run on the server and be good enough for the public to see, not only for developers.
- Test games are kept out of scores, awards, the Hall of Fame and shareable reports.
