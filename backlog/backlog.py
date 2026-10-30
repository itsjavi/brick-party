#!/usr/bin/env python3
"""Development backlog: Markdown tasks in one folder per state, plus decision records.

Usage:
  backlog.py status                     Counts, tasks in progress, what's next, proposed decisions.
  backlog.py next                       The todo task to pick up next.
  backlog.py list [STATE ...] [--label LABEL] [--priority PRIORITY]
  backlog.py show TASK-N|DECISION-N     Print a task (with its decisions) or a decision.
  backlog.py new TITLE [--priority P] [--labels a,b] [--depends TASK-1,TASK-2] [--state S]
  backlog.py move TASK-N STATE          Move a task to another state.
  backlog.py decisions [--status S] [--task TASK-N]
  backlog.py decide TITLE [--tasks TASK-1,TASK-2] [--status S]
  backlog.py accept DECISION-N          Mark a proposed decision accepted (the user's call).
  backlog.py deprecate DECISION-N [--replaced-by DECISION-M]
  backlog.py check                      Validate every task and decision file.

See backlog.md, next to this script, for the formats and workflow.
"""

import argparse
import datetime
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TASKS = ROOT / "tasks"
STATES = ("draft", "todo", "in-progress", "done", "wont-do")
ACTIVE_STATES = ("draft", "todo", "in-progress")
# The date field each closing state stamps on a task when it moves there.
CLOSING_STAMPS = {"done": "completed", "wont-do": "closed"}
PRIORITIES = ("high", "medium", "low")
REQUIRED = ("id", "title", "priority", "created")
ID = re.compile(r"^TASK-(\d+)$")
LABEL = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DECISIONS = ROOT / "decisions"
DECISION_STATUSES = ("proposed", "accepted", "deprecated")
DECISION_REQUIRED = ("id", "title", "date")
DECISION_ID = re.compile(r"^DECISION-(\d+)$")


class BacklogError(Exception):
    pass


def shown(path):
    """A path relative to the working directory, usually the repository root."""
    return os.path.relpath(path)


@dataclass
class Task:
    path: Path
    state: str
    fields: dict
    body: str

    @property
    def id(self):
        return self.fields.get("id", "")

    @property
    def number(self):
        match = ID.match(self.id)
        return int(match.group(1)) if match else 0

    @property
    def title(self):
        return self.fields.get("title", "")

    @property
    def priority(self):
        return self.fields.get("priority", "")

    @property
    def labels(self):
        return self.fields.get("labels", [])

    @property
    def depends_on(self):
        return self.fields.get("depends_on", [])

    def sort_key(self):
        rank = PRIORITIES.index(self.priority) if self.priority in PRIORITIES else len(PRIORITIES)
        return (rank, self.number)

    def row(self, with_state=False):
        state = f"{self.state:<12}" if with_state else ""
        labels = f"  [{', '.join(self.labels)}]" if self.labels else ""
        return f"{self.id:<9}{state}{self.priority:<8}{self.title}{labels}"


def parse_value(value):
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        return [item.strip().strip("'\"") for item in value[1:-1].split(",") if item.strip()]
    return value.strip("'\"")


@dataclass
class Decision:
    path: Path
    status: str
    fields: dict

    @property
    def id(self):
        return self.fields.get("id", "")

    @property
    def number(self):
        match = DECISION_ID.match(self.id)
        return int(match.group(1)) if match else 0

    @property
    def tasks(self):
        return self.fields.get("tasks", [])

    def row(self):
        tasks = f"  ({', '.join(self.tasks)})" if self.tasks else ""
        return (f"{self.id:<13}{self.fields.get('date', ''):<12}{self.status:<11}"
                f"{self.fields.get('title', '')}{tasks}")


def read_frontmatter(path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise BacklogError(f"{path.relative_to(ROOT)}: missing frontmatter")
    end = text.find("\n---\n", 3)
    if end < 0:
        raise BacklogError(f"{path.relative_to(ROOT)}: frontmatter is not closed with ---")
    fields = {}
    for line in text[4:end].splitlines():
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep:
            raise BacklogError(f"{path.relative_to(ROOT)}: frontmatter line is not 'key: value': {line}")
        fields[key.strip()] = parse_value(value)
    return fields, text[end + 5:]


def set_field(text, key, value):
    """Sets a frontmatter field in a file's text, or removes it when value is None."""
    text = re.sub(rf"^{re.escape(key)}:.*\n", "", text, count=1, flags=re.M)
    if value is None:
        return text
    end = text.find("\n---\n", 3)
    return f"{text[:end]}\n{key}: {value}{text[end:]}"


def load():
    tasks = []
    for state in STATES:
        for path in sorted((TASKS / state).glob("*.md")):
            tasks.append(Task(path, state, *read_frontmatter(path)))
    return tasks


def load_decisions():
    decisions = [Decision(path, status, read_frontmatter(path)[0])
                 for status in DECISION_STATUSES
                 for path in (DECISIONS / status).glob("*.md")]
    return sorted(decisions, key=lambda d: d.number)


def find(tasks, task_id):
    for task in tasks:
        if task.id == task_id.upper():
            return task
    raise BacklogError(f"no task {task_id}")


def ready(task, by_id):
    """A todo task is ready when everything it depends on is done."""
    return all(by_id.get(dep) and by_id[dep].state == "done" for dep in task.depends_on)


def next_tasks(tasks):
    by_id = {task.id: task for task in tasks}
    todo = sorted((t for t in tasks if t.state == "todo"), key=Task.sort_key)
    return [t for t in todo if ready(t, by_id)], [t for t in todo if not ready(t, by_id)]


def cmd_status(tasks, args):
    counts = " · ".join(f"{state} {sum(t.state == state for t in tasks)}" for state in STATES)
    print(counts)
    in_progress = sorted((t for t in tasks if t.state == "in-progress"), key=Task.sort_key)
    print("\nIn progress:")
    print("\n".join(f"  {t.row()}" for t in in_progress) or "  (none)")
    ready_tasks, waiting = next_tasks(tasks)
    print("\nNext up:")
    print(f"  {ready_tasks[0].row()}" if ready_tasks else "  (nothing ready in todo)")
    if len(ready_tasks) > 1:
        print("\nAlso ready:")
        print("\n".join(f"  {t.row()}" for t in ready_tasks[1:]))
    if waiting:
        print("\nWaiting on dependencies:")
        print("\n".join(f"  {t.row()}  (needs {', '.join(t.depends_on)})" for t in waiting))
    decisions = load_decisions()
    counts = " · ".join(f"{s} {sum(d.status == s for d in decisions)}" for s in DECISION_STATUSES)
    print(f"\nDecisions: {counts} (only accepted ones are binding; backlog.py decisions)")
    proposed = [d for d in decisions if d.status == "proposed"]
    if proposed:
        print("\nProposed decisions waiting for the user:")
        print("\n".join(f"  {d.row()}" for d in proposed))


def cmd_next(tasks, args):
    ready_tasks, _ = next_tasks(tasks)
    if not ready_tasks:
        print("Nothing ready in todo.")
        return
    task = ready_tasks[0]
    print(task.row())
    print(shown(task.path))


def cmd_list(tasks, args):
    # Won't-do tasks only show up when asked for by name.
    states = args.states or [state for state in STATES if state != "wont-do"]
    for state in states:
        if state not in STATES:
            raise BacklogError(f"unknown state {state}; use one of {', '.join(STATES)}")
    rows = [t for t in tasks if t.state in states
            and (not args.label or args.label in t.labels)
            and (not args.priority or t.priority == args.priority)]
    rows.sort(key=lambda t: (STATES.index(t.state), t.sort_key()))
    print("\n".join(t.row(with_state=True) for t in rows) or "(no tasks)")


def cmd_show(tasks, args):
    if DECISION_ID.match(args.id.upper()):
        decision = next((d for d in load_decisions() if d.id == args.id.upper()), None)
        if not decision:
            raise BacklogError(f"no decision {args.id}")
        print(f"{shown(decision.path)}\n")
        print(decision.path.read_text(encoding="utf-8"), end="")
        return
    task = find(tasks, args.id)
    print(f"{shown(task.path)}  ({task.state})\n")
    print(task.path.read_text(encoding="utf-8"), end="")
    related = [d for d in load_decisions() if task.id in d.tasks]
    if related:
        print("\nDecisions:")
        print("\n".join(f"  {d.row()}" for d in related))


def cmd_decisions(tasks, args):
    rows = [d for d in load_decisions()
            if (not args.status or d.status == args.status)
            and (not args.task or args.task.upper() in d.tasks)]
    print("\n".join(d.row() for d in rows) or "(no decisions)")


def find_decision(decision_id):
    for decision in load_decisions():
        if decision.id == decision_id.upper():
            return decision
    raise BacklogError(f"no decision {decision_id}")


def move_decision(decision, status, replaced_by=None):
    """Moves a decision to its status folder; only deprecated ones keep replaced_by."""
    text = set_field(decision.path.read_text(encoding="utf-8"), "replaced_by", replaced_by)
    target = DECISIONS / status / decision.path.name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    if target != decision.path:
        decision.path.unlink()
    print(f"{decision.id}: {decision.status} -> {status}  ({shown(target)})")


def cmd_accept(tasks, args):
    decision = find_decision(args.id)
    if decision.status != "proposed":
        raise BacklogError(f"{decision.id} is {decision.status}, not proposed")
    move_decision(decision, "accepted")


def cmd_deprecate(tasks, args):
    decision = find_decision(args.id)
    replaced_by = find_decision(args.replaced_by).id if args.replaced_by else None
    move_decision(decision, "deprecated", replaced_by)


def cmd_decide(tasks, args):
    if args.status not in DECISION_STATUSES:
        raise BacklogError(f"unknown status {args.status}; use one of {', '.join(DECISION_STATUSES)}")
    number = max((d.number for d in load_decisions()), default=0) + 1
    related = [t.upper() for t in split_list(args.tasks)]
    path = DECISIONS / args.status / f"DECISION-{number}-{slugify(args.title)}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n"
        f"id: DECISION-{number}\n"
        f"title: {args.title}\n"
        f"date: {datetime.date.today().isoformat()}\n"
        f"tasks: [{', '.join(related)}]\n"
        "---\n\n"
        "## Context\n\n\n"
        "## Decision\n\n\n"
        "## Consequences\n",
        encoding="utf-8",
    )
    print(shown(path))


def slugify(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60].rstrip("-")


def split_list(value):
    return [item.strip() for item in value.split(",") if item.strip()] if value else []


def cmd_new(tasks, args):
    if args.state not in STATES:
        raise BacklogError(f"unknown state {args.state}")
    if args.priority not in PRIORITIES:
        raise BacklogError(f"unknown priority {args.priority}; use one of {', '.join(PRIORITIES)}")
    number = max((t.number for t in tasks), default=0) + 1
    labels, depends = split_list(args.labels), [d.upper() for d in split_list(args.depends)]
    path = TASKS / args.state / f"TASK-{number}-{slugify(args.title)}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n"
        f"id: TASK-{number}\n"
        f"title: {args.title}\n"
        f"priority: {args.priority}\n"
        f"labels: [{', '.join(labels)}]\n"
        f"depends_on: [{', '.join(depends)}]\n"
        f"created: {datetime.date.today().isoformat()}\n"
        "---\n\n"
        "## Goal\n\n\n"
        "## Acceptance criteria\n\n- [ ] \n\n"
        "## Notes\n",
        encoding="utf-8",
    )
    print(shown(path))


def cmd_move(tasks, args):
    if args.state not in STATES:
        raise BacklogError(f"unknown state {args.state}; use one of {', '.join(STATES)}")
    task = find(tasks, args.id)
    if task.state == args.state:
        print(f"{task.id} is already {args.state}")
        return
    text = task.path.read_text(encoding="utf-8")
    for state, stamp in CLOSING_STAMPS.items():
        today = datetime.date.today().isoformat()
        text = set_field(text, stamp, today if state == args.state else None)
    target = TASKS / args.state / task.path.name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    task.path.unlink()
    print(f"{task.id}: {task.state} -> {args.state}  ({shown(target)})")


def cmd_check(tasks, args):
    problems = []
    seen = {}
    for task in tasks:
        name = task.path.relative_to(ROOT)
        for field in REQUIRED:
            if not task.fields.get(field):
                problems.append(f"{name}: missing {field}")
        if task.id and not ID.match(task.id):
            problems.append(f"{name}: id must look like TASK-N, got {task.id}")
        if task.id and not task.path.name.startswith(f"{task.id}-"):
            problems.append(f"{name}: file name must start with {task.id}-")
        if task.id in seen:
            problems.append(f"{name}: duplicate id {task.id} (also {seen[task.id]})")
        seen[task.id] = name
        if task.priority and task.priority not in PRIORITIES:
            problems.append(f"{name}: priority must be one of {', '.join(PRIORITIES)}")
        for key in ("labels", "depends_on"):
            if not isinstance(task.fields.get(key, []), list):
                problems.append(f"{name}: {key} must be a list like [a, b]")
        for label in task.labels:
            if not LABEL.match(label):
                problems.append(f"{name}: label '{label}' must be lowercase-kebab-case")
        stamp = CLOSING_STAMPS.get(task.state)
        if stamp and not task.fields.get(stamp):
            problems.append(f"{name}: {task.state} tasks need a {stamp} date")
    by_id = {task.id: task for task in tasks}
    ids = set(by_id)
    for task in tasks:
        for dep in task.depends_on:
            if dep not in ids:
                problems.append(f"{task.path.relative_to(ROOT)}: depends on unknown {dep}")
            elif task.state in ACTIVE_STATES and by_id[dep].state == "wont-do":
                problems.append(f"{task.path.relative_to(ROOT)}: depends on {dep}, which won't be done")
    for path in TASKS.iterdir() if TASKS.is_dir() else []:
        if path.name.startswith("."):
            continue
        if not path.is_dir() or path.name not in STATES:
            problems.append(f"tasks/{path.name}: only the state folders {', '.join(STATES)} belong in tasks/")
    for state in STATES:
        if not (TASKS / state).is_dir():
            problems.append(f"tasks/{state}/ is missing (keep a .gitkeep in empty state folders)")
            continue
        for path in (TASKS / state).iterdir():
            if not path.name.startswith(".") and path.suffix != ".md":
                problems.append(f"{path.relative_to(ROOT)}: only .md task files belong here")
    decisions = load_decisions()
    problems += check_decisions(decisions, ids)
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print(f"OK: {len(tasks)} tasks, {len(decisions)} decisions")


def check_decisions(decisions, task_ids):
    problems = []
    seen = {}
    decision_ids = {d.id for d in decisions}
    for decision in decisions:
        name = decision.path.relative_to(ROOT)
        for field in DECISION_REQUIRED:
            if not decision.fields.get(field):
                problems.append(f"{name}: missing {field}")
        if decision.id and not DECISION_ID.match(decision.id):
            problems.append(f"{name}: id must look like DECISION-N, got {decision.id}")
        if decision.id and not decision.path.name.startswith(f"{decision.id}-"):
            problems.append(f"{name}: file name must start with {decision.id}-")
        if decision.id in seen:
            problems.append(f"{name}: duplicate id {decision.id} (also {seen[decision.id]})")
        seen[decision.id] = name
        if "status" in decision.fields:
            problems.append(f"{name}: remove the status field; the folder is the status")
        if not isinstance(decision.fields.get("tasks", []), list):
            problems.append(f"{name}: tasks must be a list like [TASK-1]")
        for task_id in decision.tasks:
            if task_id not in task_ids:
                problems.append(f"{name}: refers to unknown {task_id}")
        replaced_by = decision.fields.get("replaced_by")
        if replaced_by and replaced_by not in decision_ids:
            problems.append(f"{name}: replaced_by refers to unknown {replaced_by}")
        if replaced_by and decision.status != "deprecated":
            problems.append(f"{name}: only deprecated decisions have replaced_by")
    for path in DECISIONS.iterdir() if DECISIONS.is_dir() else []:
        if not path.name.startswith(".") and (not path.is_dir() or path.name not in DECISION_STATUSES):
            problems.append(f"decisions/{path.name}: only the status folders "
                            f"{', '.join(DECISION_STATUSES)} belong in decisions/")
    for status in DECISION_STATUSES:
        folder = DECISIONS / status
        if not folder.is_dir():
            problems.append(f"decisions/{status}/ is missing (keep a .gitkeep in empty status folders)")
            continue
        for path in folder.iterdir():
            if not path.name.startswith(".") and path.suffix != ".md":
                problems.append(f"{path.relative_to(ROOT)}: only .md decision files belong here")
    return problems


def main():
    parser = argparse.ArgumentParser(description="Development backlog.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="counts, in progress and next up")
    commands.add_parser("next", help="the todo task to pick up next")
    list_parser = commands.add_parser("list", help="list tasks")
    list_parser.add_argument("states", nargs="*", metavar="STATE")
    list_parser.add_argument("--label")
    list_parser.add_argument("--priority", choices=PRIORITIES)
    show_parser = commands.add_parser("show", help="print a task or a decision")
    show_parser.add_argument("id")
    decisions_parser = commands.add_parser("decisions", help="list decisions")
    decisions_parser.add_argument("--status", choices=DECISION_STATUSES)
    decisions_parser.add_argument("--task")
    decide_parser = commands.add_parser("decide", help="record a decision (proposed by default)")
    decide_parser.add_argument("title")
    decide_parser.add_argument("--tasks", default="")
    decide_parser.add_argument("--status", default="proposed")
    accept_parser = commands.add_parser("accept", help="mark a proposed decision accepted")
    accept_parser.add_argument("id")
    deprecate_parser = commands.add_parser("deprecate", help="mark a decision deprecated")
    deprecate_parser.add_argument("id")
    deprecate_parser.add_argument("--replaced-by")
    new_parser = commands.add_parser("new", help="create a task")
    new_parser.add_argument("title")
    new_parser.add_argument("--priority", default="medium")
    new_parser.add_argument("--labels", default="")
    new_parser.add_argument("--depends", default="")
    new_parser.add_argument("--state", default="todo")
    move_parser = commands.add_parser("move", help="move a task to another state")
    move_parser.add_argument("id")
    move_parser.add_argument("state")
    commands.add_parser("check", help="validate every task and decision file")

    args = parser.parse_args()
    handler = globals()[f"cmd_{args.command}"]
    try:
        handler(load(), args)
    except BacklogError as error:
        sys.exit(f"backlog: {error}")


if __name__ == "__main__":
    main()
