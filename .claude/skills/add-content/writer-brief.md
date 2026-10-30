# Writer brief

Fill in every `{{placeholder}}` and send the text below as the writer's prompt, one writer per pack. Single braces in
it are literal JSON. When you write a small batch yourself, follow it as your own brief.

```
You're writing content for one pack of Brick Party, a Jackbox-style party game the Formbricks team (an open-source
survey and feedback company) plays together on video calls. Repository: {{absolute repo root}}. Your pack:
packages/content/packs/{{game}}.json, for {{game name}}: {{the game's mechanics in one or two sentences}}. Its items
live under the keys {{keys}}.

What the user asked for, in their words: {{their request, with any show, film or book they name replaced by the
mechanism in square brackets}}

Read these in full before writing:
- packages/content/packs/README.md: the rules: format, audience, safety, mix, and your game's section with its
  limits.
- packages/content/src/categories.ts: the topic and style sets.
- .claude/skills/add-content/humor.md: the craft, register by register.
- .claude/skills/add-content/material.md: what to write about, topic by topic. The Formbricks docs are at
  {{the local docs folder, or formbricks.com/docs}}.
- Your whole pack, so every premise you write is new to it.

The job:
- Amount: {{a number of items, or as many as fit}}.
- Mix: {{target counts or shares by topic, style and spice, plus the split between kinds or parts where the game has
  them, like Survey Says' who, scale and choice, or Worst Feedback's prompts and answers}}.
- Room: {{add only | replace the weakest items to make room}}. The file stays within {{cap}} bytes, tags included.
  When you replace, cut from topics and styles above their target first, never from ones below it, and list every
  cut in your report.
- {{Anything else: a theme, the ids to punch up, items the user wants gone}}

Every new item gets the next id after the highest in your pack (same prefix, three digits), plus a spice, a topic and
a style. Funny comes first: a weak item is worse than none, so stop early when ideas run thin and say so.

Tools, run from the repository root:
- python3 .claude/skills/add-content/scripts/pack.py append {{game}} {{key}} <items.json> adds items (a JSON array).
- python3 .claude/skills/add-content/scripts/pack.py update {{game}} <changes.json> merges fields into items by id;
  the file maps ids to changed fields, like {"{{an id}}": {"style": "satire"}}.
- python3 .claude/skills/add-content/scripts/pack.py remove {{game}} <id> [<id> ...] deletes items.
- python3 .claude/skills/add-content/scripts/check.py checks every pack and prints the free room. Finish with no
  PROBLEM or WARNING lines for yours.
- pnpm --filter @brick/content balance prints the topic, style and spice balance.

Work in batches of 30 to 50: draft into a JSON file under .local/, reread it as a player hearing it cold, cut what
doesn't land, then append and check. Only touch your pack file and your own files under .local/, since other writers
may be editing the other packs; if a script fails to parse another pack, rerun it a moment later. Don't run tests,
commit or edit the backlog.

Report back: items added, rewritten and cut (with every cut's id and text), your pack's balance column before and
after, your ten favorite new items, and anything you were unsure about.
```
