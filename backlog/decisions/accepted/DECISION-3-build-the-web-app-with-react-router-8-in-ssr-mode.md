---
id: DECISION-3
title: Build the web app with React Router 8 in SSR mode
date: 2026-10-30
tasks: []
---

## Context

Next.js was the first idea. The user asked for React Router in SSR mode instead, and for version 8.

## Decision

The web app uses React Router 8 in framework mode with server rendering, through `@cloudflare/vite-plugin`. Route
modules stay `.tsx` files.

## Consequences

- No Next.js APIs or conventions.
- Route modules can't be STSX files, so their markup lives in STSX components they render.
