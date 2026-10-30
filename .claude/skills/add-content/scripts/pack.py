#!/usr/bin/env python3
"""Edit a pack while keeping its one-item-per-line format. Run it from anywhere inside the repository.

  pack.py append <pack> <key> <items.json>   add items (a JSON array) at the end of <key>
  pack.py update <pack> <changes.json>        merge fields into items: {"<id>": {"text": "..."}}
  pack.py remove <pack> <id> [<id> ...]       delete items by id

<pack> is a game id (the pack's file name) or a path to the pack file. Ids must be unique across all packs.
"""
import json
import pathlib
import subprocess
import sys

FIRST = ["id", "kind", "real", "bot", "text", "minLabel", "maxLabel", "options"]
LAST = ["spice", "topic", "style"]


def packs_dir():
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip()
    return pathlib.Path(root) / "packages/content/packs"


def pack_path(arg):
    p = pathlib.Path(arg)
    return p if p.suffix == ".json" else packs_dir() / f"{arg}.json"


def line(item):
    keys = [k for k in FIRST if k in item] + [k for k in item if k not in FIRST + LAST] + [k for k in LAST if k in item]
    body = json.dumps({k: item[k] for k in keys}, ensure_ascii=False)
    return "    { " + body[1:-1] + " }"


def dump(data):
    parts = [f'  "{key}": [\n' + ",\n".join(line(i) for i in items) + "\n  ]" for key, items in data.items()]
    return "{\n" + ",\n".join(parts) + "\n}\n"


def all_ids():
    ids = set()
    for p in packs_dir().glob("*.json"):
        for items in json.loads(p.read_text()).values():
            ids.update(i["id"] for i in items)
    return ids


def main(cmd, pack, *args):
    path = pack_path(pack)
    data = json.loads(path.read_text()) if path.exists() else {}
    if cmd == "append" and len(args) == 2:
        key, src = args
        new = json.loads(pathlib.Path(src).read_text())
        new_ids = [i["id"] for i in new]
        clash = (all_ids() & set(new_ids)) | {i for i in new_ids if new_ids.count(i) > 1}
        if clash:
            sys.exit(f"id clash: {sorted(clash)}")
        data.setdefault(key, []).extend(new)
        msg = f"appended {len(new)} to {key}"
    elif cmd == "update" and len(args) == 1:
        changes = json.loads(pathlib.Path(args[0]).read_text())
        found = {i["id"] for items in data.values() for i in items if i["id"] in changes}
        if set(changes) - found:
            sys.exit(f"unknown ids: {sorted(set(changes) - found)}")
        for items in data.values():
            for item in items:
                item.update(changes.get(item["id"], {}))
        msg = f"updated {len(found)} items"
    elif cmd == "remove" and args:
        before = sum(len(v) for v in data.values())
        data = {k: [i for i in v if i["id"] not in set(args)] for k, v in data.items()}
        msg = f"removed {before - sum(len(v) for v in data.values())} of {len(set(args))} ids"
    else:
        sys.exit(__doc__)
    path.write_text(dump(data))
    print(f"{path.name}: {msg} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
