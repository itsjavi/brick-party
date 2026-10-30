---
id: DECISION-10
title: Write components in STSX with plain CSS, shared tokens in tokens.css, and one stylesheet
date: 2026-10-30
tasks: []
---

## Context

The user asked for Lumiose STSX components with plain CSS instead of Tailwind, and for the CSS not to be split into
many files (DECISION-4). The shared tokens then lived in a `<style global>` block inside `Stage.stsx`, where nobody
looking for them found them. The user asked for the tokens to have a file of their own.

## Decision

Components are `.stsx` files with scoped `<style>` blocks in plain CSS, using the class scoping strategy. The shared
tokens (palette, fonts, outline width, radii, drop shadows) live in `apps/web/app/tokens.css`, which `root.tsx` imports.
The base element styles (resets, body font, focus ring, `.sr-only`, reduced motion) stay in the `<style global>` block
in `Stage.stsx`. The build still emits one stylesheet (`build.cssCodeSplit: false`).

## Consequences

- No Tailwind or CSS-in-JS runtime.
- New shared tokens go in `tokens.css`, not in a component. Custom properties that only one component uses stay in
  that component's `<style>` block.
- `tokens.css` is a side-effect import, not a `links` entry, so Vite bundles it into the one stylesheet.
- Styling another component's elements needs class passthrough or `:deep()`.
- Vite's dependency scanner reads the STSX shadow files through a small plugin in `vite.config.ts`.
