---
id: DECISION-5
title: Use the Toybox art direction, laptop first
date: 2026-10-30
tasks: []
---

## Context

The user asked for something that looks and feels like a game rather than a website, chose the Toybox direction out
of three proposals, and asked for laptops first with phones still working.

## Decision

Every screen uses the Toybox look: chunky plastic bricks, thick ink outlines, hard drop shadows, Lilita One and
Nunito, and a sky-blue studded stage. Layouts are designed for laptops on a video call and stack on phones.

## Consequences

- New screens follow the existing tokens and components (`Brick`, `Button`, `Panel`, `Title`, `GameHud`).
- Game screens should fit a laptop viewport (about 1280 by 800) without scrolling where possible.
