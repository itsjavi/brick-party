# Development backlog

The project's plan, tasks and decisions, kept as plain Markdown in the repository so people and agents work from the
same list. It's a lightweight, portable take on [Backlog.md](https://github.com/MrLesk/Backlog.md): no tool to install,
just files and one Python script. Because it lives in git, it is also the agents' durable memory: it survives new
sessions, clones and machines.

```
backlog/
├── backlog.md          This guide
├── backlog.py          The tool to read and change the backlog
├── ROADMAP.md          High-level goals, one section per phase
├── decisions/          Decision records: what was decided and why
│   ├── proposed/       Suggested, not binding yet
│   ├── accepted/       Approved by the user; binding for all work
│   └── deprecated/     Obsolete, kept for history
└── tasks/
    ├── draft/          Ideas and work that isn't ready to start
    ├── todo/           Ready to start
    ├── in-progress/    Being worked on
    ├── done/           Finished and verified
    └── wont-do/        Won't be done
```

## Tasks

Each task is one file named `TASK-N-short-title.md`. The folder it sits in is its state; there is no status field to
keep in sync.

```markdown
---
id: TASK-3
title: Let users reset their password
priority: high
labels: [phase-1, auth]
depends_on: [TASK-2]
created: 2026-01-15
---

## Goal

What should be true when this is done, and why.

## Acceptance criteria

- [ ] Checkable outcomes, ticked as they're met

## Notes

Findings, decisions, links, open questions.
```

| Field                 | Rules                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | `TASK-N`. Numbers increase and are never reused or renumbered.                                                                                                                      |
| `title`               | One line, imperative ("Add…", "Fix…", "Let users…").                                                                                                                                |
| `priority`            | `high`, `medium` or `low`.                                                                                                                                                          |
| `labels`              | Optional, `[a, b]`, lowercase-kebab-case. Every task gets its phase (`phase-0`, `phase-1`, …, see [ROADMAP.md](ROADMAP.md)) plus area labels such as `auth`, `ui`, `build`, `docs`. |
| `depends_on`          | Optional, `[TASK-1, TASK-2]`. A task isn't ready until these are done.                                                                                                              |
| `created`             | `YYYY-MM-DD`.                                                                                                                                                                       |
| `completed`, `closed` | Dates the script adds when a task moves to `done` or `wont-do`.                                                                                                                     |

The frontmatter is a strict subset of YAML: one `key: value` per line, lists in `[a, b]` form, no comments or nested
values.

## Decisions

Each decision is one file named `DECISION-N-short-title.md`. Like tasks, the folder it sits in is its status, so there
is no status field. Record a decision whenever a choice constrains future work: product scope, privacy and security
trade-offs, architecture, dependencies, anything someone might otherwise undo by accident.

```markdown
---
id: DECISION-4
title: Password reset links expire after one hour
date: 2026-01-15
tasks: [TASK-3]
---

## Context

The problem and the forces at play.

## Decision

What was decided.

## Consequences

What follows from it, including the downsides.
```

| Field         | Rules                                                                |
| ------------- | -------------------------------------------------------------------- |
| `id`          | `DECISION-N`, never reused or renumbered.                            |
| `date`        | `YYYY-MM-DD`, when it was recorded.                                  |
| `tasks`       | Optional, `[TASK-1]`: the tasks it came from or affects.             |
| `replaced_by` | Optional on deprecated decisions: the `DECISION-N` that replaces it. |

The status folders:

- **proposed**: suggested, not yet approved. Agents can propose decisions on their own (`decide` creates them as
  proposed). A proposal is not binding.
- **accepted**: approved by the user. Only accepted decisions are valid for any agent work. An agent sets this status
  only when the user decides or approves (`accept`); the user's answer to an agent's question counts.
- **deprecated**: obsolete. Kept for history; `replaced_by` points to its replacement, if any.

Don't edit an accepted decision to change its meaning. Record a new one and, once it's accepted, deprecate the old one
with `--replaced-by`.

## Task states

- **draft**: an idea or a task still missing a clear goal or acceptance criteria.
- **todo**: ready to start. It has a goal and acceptance criteria.
- **in-progress**: someone is working on it. Keep it to one task per person or agent.
- **done**: every acceptance criterion is met and verified, and the work is committed. Gets a `completed` date.
- **wont-do**: won't be done. Say why in its Notes. Gets a `closed` date, and `list` hides it unless you ask for it
  (`list wont-do`). Tasks that depend on it need a new plan.

## The script

Run it from the repository root. It needs only Python 3.

```bash
backlog/backlog.py status                 # counts, in progress, next up, waiting
backlog/backlog.py next                   # the task to pick up next
backlog/backlog.py list todo --label auth
backlog/backlog.py show TASK-3
backlog/backlog.py new "Rate-limit sign-in attempts" --priority medium --labels phase-1,auth --state draft
backlog/backlog.py move TASK-3 in-progress
backlog/backlog.py decisions --task TASK-3
backlog/backlog.py show DECISION-4
backlog/backlog.py decide "Send email through the provider's API" --tasks TASK-6   # proposed
backlog/backlog.py accept DECISION-5      # only when the user approves
backlog/backlog.py deprecate DECISION-2 --replaced-by DECISION-5
backlog/backlog.py check                  # validate every task and decision
```

`show TASK-N` also lists the decisions linked to that task. `status` lists proposed decisions waiting for the user.

**Next up** is the highest-priority task in `todo` whose dependencies are all done; ties go to the lowest number.

## Workflow

1. Check `status` before starting work, including proposed decisions waiting for the user.
2. Take `next`, unless someone asked for something specific. Move the task to `in-progress`. Read its accepted
   decisions, and any others for the area you're changing.
3. Do the work. Tick acceptance criteria as they're met and add findings to Notes. Record choices made along the way
   with `decide`: proposed, or accepted when the user made the call.
4. When everything is verified, move the task to `done` and commit the move with the change. If it won't be done, move
   it to `wont-do` and say why.
5. Put follow-up work you discover in a new task (`draft` if it's unclear, `todo` if it's ready) instead of growing the
   current one.
6. Run `check` before committing backlog changes.

Changes to the backlog system itself (this guide, the script, the folder layout) are made directly. They never get
tasks. Project-specific rules for using the backlog belong in the project's `AGENTS.md`, so this guide and the script
can be upgraded in place.
