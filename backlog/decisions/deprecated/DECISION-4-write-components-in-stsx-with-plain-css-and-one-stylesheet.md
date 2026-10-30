---
id: DECISION-4
title: Write components in STSX with plain CSS and one stylesheet
date: 2026-10-30
tasks: []
replaced_by: DECISION-10
---

## Context

The user asked for Lumiose STSX components with plain CSS instead of Tailwind, and for the CSS not to be split into
many files.

## Decision

Components are `.stsx` files with scoped `<style>` blocks in plain CSS, using the class scoping strategy. Global
tokens live in a `<style global>` block in `Stage.stsx`. The build emits one stylesheet (`build.cssCodeSplit: false`).

## Consequences

- No Tailwind or CSS-in-JS runtime.
- Styling another component's elements needs class passthrough or `:deep()`.
- Vite's dependency scanner reads the STSX shadow files through a small plugin in `vite.config.ts`.
