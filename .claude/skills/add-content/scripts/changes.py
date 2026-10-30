#!/usr/bin/env python3
"""List what changed in the packs since a git ref, for review. Run it from anywhere inside the repository.

  changes.py [<ref>] [--pack <game>] [--summary] [--before <dir>]

<ref> defaults to HEAD. Prints NEW, REWRITTEN and REMOVED items with their tags, and a count of retagged items.
--summary prints only the counts. --before <dir> also writes every pack as it was at <ref> into <dir>, to compare
balances: pnpm --filter @brick/content balance <dir>
"""
import json
import pathlib
import subprocess
import sys

TAGS = ("spice", "topic", "style")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def show(item):
    if "real" in item:
        body = f"{item['real']} / {item['bot']}"
    else:
        body = item.get("text", "")
        if "minLabel" in item:
            body += f" [{item['minLabel']} .. {item['maxLabel']}]"
        if item.get("options"):
            body += " | " + " | ".join(item["options"])
    extra = {k: v for k, v in item.items() if k not in ("id", "real", "bot", "text", "minLabel", "maxLabel", "options", "kind", *TAGS)}
    if extra:
        body += f" {json.dumps(extra, ensure_ascii=False)}"
    kind = f" {item['kind']}" if "kind" in item else ""
    return f"{item['id']} {item.get('spice', '?')}{kind} {item.get('topic', '?')}/{item.get('style', '?')}: {body}"


def main(argv):
    ref, pack, summary, before_dir = "HEAD", None, False, None
    args = iter(argv)
    for a in args:
        if a == "--pack":
            pack = next(args)
        elif a == "--summary":
            summary = True
        elif a == "--before":
            before_dir = pathlib.Path(next(args))
        elif a.startswith("-"):
            sys.exit(__doc__)
        else:
            ref = a
    root = pathlib.Path(git("rev-parse", "--show-toplevel").strip())
    for path in sorted((root / "packages/content/packs").glob("*.json")):
        game = path.stem
        if pack and game != pack:
            continue
        rel = path.relative_to(root).as_posix()
        try:
            old_text = git("show", f"{ref}:{rel}")
        except subprocess.CalledProcessError:
            old_text = "{}"
        if before_dir:
            before_dir.mkdir(parents=True, exist_ok=True)
            (before_dir / path.name).write_text(old_text)
        old = {i["id"]: i for items in json.loads(old_text).values() for i in items}
        new = [i for items in json.loads(path.read_text()).values() for i in items]
        new_ids = {i["id"] for i in new}
        content = lambda i: {k: v for k, v in i.items() if k not in TAGS}
        added = [i for i in new if i["id"] not in old]
        rewritten = [i for i in new if i["id"] in old and content(i) != content(old[i["id"]])]
        retagged = [i for i in new if i["id"] in old and content(i) == content(old[i["id"]]) and i != old[i["id"]]]
        removed = [item for iid, item in old.items() if iid not in new_ids]
        print(f"== {game}: {len(added)} new, {len(rewritten)} rewritten, {len(retagged)} retagged, {len(removed)} removed")
        if not summary:
            for label, items in (("NEW", added), ("REWRITTEN", rewritten), ("REMOVED", removed)):
                for i in items:
                    print(f"{label} {show(i)}")


if __name__ == "__main__":
    main(sys.argv[1:])
