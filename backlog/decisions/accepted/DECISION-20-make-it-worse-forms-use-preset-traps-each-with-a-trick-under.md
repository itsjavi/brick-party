---
id: DECISION-20
title: Make It Worse forms use preset traps, each with a trick, under a budget
date: 2026-10-30
tasks: [TASK-44]
---

## Context

In Make It Worse players build forms that fight the user, and the others have to get through them. A free-form builder
would let one player stack dozens of traps or build a form nobody can finish, and the game would stop being fun or
fair. The user asked for components that each have a trick, and for a limit on how many bad patterns a form gets.

## Decision

- Forms are built only from a preset palette of traps. There is no free-form editing.
- Every trap has a trick that gets you past it, so every form can be finished by construction.
- Each form has a budget: traps cost points by how nasty they are, and each trap fits once per form.

## Consequences

- New traps are added by writing a component, its trick and its real-world fix, not by players.
- The palette needs enough variety that forms don't all look alike.
- Traps that rely on hover or a keyboard need a touch trick, or must be left out for phone players.
