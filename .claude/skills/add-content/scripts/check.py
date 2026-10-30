#!/usr/bin/env python3
"""Check every pack against the writing rules, which are stricter than the game schemas. Run it from anywhere inside
the repository. Prints one line per pack, then WARNING and PROBLEM lines. Exits 1 on any PROBLEM.

Checks: tags from categories.ts, spice, unique ids, duplicate texts within a pack, the size cap (PACK_MAX_BYTES in
packs.ts), regional references, and each game's lengths and shapes from RULES below.
"""
import json
import pathlib
import re
import subprocess
import sys
from collections import Counter

ROOT = pathlib.Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
CONTENT = ROOT / "packages/content"

# Per game, per key: field lengths as (min, max), plus named shape checks (see shape() below).
# A new game gets an entry here, matching the limits its prompt in ai.ts gives Claude.
RULES = {
    "worst-feedback": {
        "prompts": {"text": (10, 160), "checks": ["at_most_one_blank"]},
        "answers": {"text": (2, 80), "checks": ["ends_with_period"]},
    },
    "bot-or-not": {"pairs": {"real": (10, 140), "bot": (10, 140), "checks": ["real_differs_from_bot"]}},
    "survey-says": {"questions": {"text": (10, 120), "minLabel": (1, 24), "maxLabel": (1, 24), "checks": ["survey_kind"]}},
    "skip-logic": {"starters": {"text": (10, 120)}},
    "make-it-worse": {"surveys": {"title": (3, 48), "intro": (5, 120), "checks": ["miw_survey"]}},
}

# Regional in-jokes many players won't get. Extend it when a review finds a new one.
REGIONAL = re.compile(
    r"berlin|bürgeramt|buergeramt|u-bahn|s-bahn|club-mate|döner|doner|currywurst|rot-wei|kreuzberg|spree|pfand|"
    r"feierabend|thanksgiving|super bowl|fourth of july|\bdmv\b|€|°c|°f",
    re.I,
)
TAGS = {"id", "spice", "topic", "style", "kind"}

categories = (CONTENT / "src/categories.ts").read_text()
topics_src, styles_src = categories.split("export const STYLES")
TOPICS = set(re.findall(r"^  (\w+): ", topics_src, re.M))
STYLES = set(re.findall(r"^  (\w+): ", styles_src, re.M))
CAP = int(re.search(r"PACK_MAX_BYTES = ([\d_]+)", (CONTENT / "src/packs.ts").read_text()).group(1).replace("_", ""))

problems, warnings = [], []


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def shape(check, item):
    if check == "at_most_one_blank":
        text = item.get("text", "")
        return text.count("____") <= 1 and "___" not in text.replace("____", ""), 'one blank at most, written "____"'
    if check == "ends_with_period":
        return item.get("text", "").endswith((".", '."')), "an answer ends with a period"
    if check == "real_differs_from_bot":
        return norm(item.get("real", "")) != norm(item.get("bot", "")), "real and bot questions must differ"
    if check == "survey_kind":
        kind, opts = item.get("kind"), item.get("options") or []
        if kind == "who":
            return not {"minLabel", "maxLabel", "options"} & set(item), "who questions have no labels or options"
        if kind == "scale":
            return "minLabel" in item and "maxLabel" in item, "scale questions need minLabel and maxLabel"
        if kind == "choice":
            ok = 2 <= len(opts) <= 4 and all(1 <= len(o) <= 32 for o in opts) and len({norm(o) for o in opts}) == len(opts)
            return ok, "choice questions need 2-4 distinct options of at most 32 characters"
        return False, f"unknown kind {kind!r}"
    if check == "miw_survey":
        qs = item.get("questions") or []
        kinds = Counter(q.get("kind") for q in qs)
        if not 4 <= len(qs) <= 5 or any(kinds[k] != 1 for k in ("rating", "number", "consent")) or not 1 <= kinds["choice"] <= 2:
            return False, "a survey has 4-5 questions: one rating, one number, one consent and one or two choice"
        for q in qs:
            lengths = [(q.get("label", ""), 1, 20), (q.get("text", ""), 5, 100)]
            lengths += [(o, 1, 32) for o in q.get("options") or []]
            lengths += [(q.get(k, "x"), 1, 24) for k in ("low", "high")] + [(q.get("thing", "xxx"), 3, 40), (q.get("unit", ""), 0, 16)]
            if any(not lo <= len(s) <= hi for s, lo, hi in lengths):
                return False, f"question {q.get('label')!r}: a label, text, option, end label, unit or thing is too long or short"
            opts = q.get("options") or []
            if q.get("kind") == "choice" and (not 3 <= len(opts) <= 4 or len({norm(o) for o in opts}) != len(opts)):
                return False, f"question {q.get('label')!r}: a choice has 3-4 distinct options"
            if q.get("kind") == "number" and q.get("max", 0) - q.get("min", 0) < 10:
                return False, f"question {q.get('label')!r}: a number range spans at least 10"
        return True, ""
    return False, f"unknown check {check!r} in RULES"


ids = Counter()
for path in sorted((CONTENT / "packs").glob("*.json")):
    game, data = path.stem, json.loads(path.read_text())
    seen = {}
    for key, items in data.items():
        rules = RULES.get(game, {}).get(key)
        if rules is None:
            warnings.append(f"{game}/{key}: no length rules yet; add them to RULES in check.py")
        for item in items:
            iid = item.get("id", "?")
            ids[iid] += 1
            if item.get("spice") not in ("mild", "spicy"):
                problems.append(f"{iid}: spice must be mild or spicy")
            if item.get("topic") not in TOPICS:
                problems.append(f"{iid}: topic {item.get('topic')!r} isn't in categories.ts")
            if item.get("style") not in STYLES:
                problems.append(f"{iid}: style {item.get('style')!r} isn't in categories.ts")
            content = {k: v for k, v in item.items() if k not in TAGS}
            blob = " ".join(str(v) for v in content.values())
            if REGIONAL.search(blob):
                warnings.append(f"{iid}: regional reference: {blob[:90]!r}")
            for field in ("text", "real", "bot"):
                if isinstance(item.get(field), str):
                    n = norm(item[field])
                    if seen.get(n, iid) != iid:
                        problems.append(f"{iid}: same {field} as {seen[n]}: {item[field]!r}")
                    seen.setdefault(n, iid)
            for field, bounds in (rules or {}).items():
                if field != "checks" and field in item:
                    if not bounds[0] <= len(item[field]) <= bounds[1]:
                        problems.append(f"{iid}: {field} is {len(item[field])} characters, want {bounds[0]}-{bounds[1]}")
            for check in (rules or {}).get("checks", []):
                ok, why = shape(check, item)
                if not ok:
                    problems.append(f"{iid}: {why}")
    size = path.stat().st_size
    spice = Counter(i.get("spice") for items in data.values() for i in items)
    counts = ", ".join(f"{k} {len(v)}" for k, v in data.items())
    total = sum(len(v) for v in data.values())
    average = size // total if total else 0
    room = f"{max(CAP - size, 0)} bytes free, about {max(CAP - size, 0) // average} items of {average}" if average else f"{CAP - size} bytes free"
    print(f"{path.name:24} {size:6} / {CAP} bytes ({room})  {counts}  (mild {spice['mild']}, spicy {spice['spicy']})")
    if size > CAP:
        problems.append(f"{path.name} is {size} bytes, over the {CAP}-byte cap: cut the weakest items")

problems += [f"{i}: id used {n} times" for i, n in ids.items() if n > 1]
for w in warnings:
    print("WARNING", w)
for p in problems:
    print("PROBLEM", p)
sys.exit(1 if problems else 0)
