---
id: DECISION-2
title: Store data in D1 through Prisma
date: 2026-10-30
tasks: []
---

## Context

With storage on Cloudflare, D1 is the database. The user wanted to keep Prisma, and to drop D1 if the two weren't
compatible; they are, through `@prisma/adapter-d1`.

## Decision

`packages/db` uses Prisma with the SQLite provider and `@prisma/adapter-d1`. Migrations are generated from the Prisma
schema with `prisma migrate diff` and applied with `wrangler d1 migrations apply`.

## Consequences

- D1 has no transactions through Prisma's adapter, so multi-row writes such as saving a match happen one statement at
  a time and can stop partway.
- JSON columns are stored as text.
- Prisma's query engine is part of the Worker bundle (about 1.6 MB raw).
