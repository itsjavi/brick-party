# Writing pack content

The packs are the hand-written content for the four games. They're used when Claude is off or fails, and Claude's
prompts pick few-shot examples from them, so their tone and mix shape the generated content too. Funny comes first:
it's why people play.

## Format

One item per line. Every item has a unique `id`, a `spice` (`mild` or `spicy`), a `topic` and a `style`. The topics
and styles are fixed sets, each defined in one line in [categories.ts](../src/categories.ts). Pick the topic the joke
targets, not where it happens to be set. See the current balance with `pnpm --filter @brick/content balance`.

Each pack file stays within `PACK_MAX_BYTES` in [packs.ts](../src/packs.ts), tags included (a test enforces it).
When new content doesn't fit, the weakest items go.

## Audience

Players come from many countries. Use references everyone gets: no city, country or language in-jokes (no local
nightlife, bureaucracy or food), nothing that only works in one culture.

Content stays workplace-safe at both spice levels: no sexual content, slurs, politics, religion or body shaming,
nothing gross-out, and nothing that punches down. Accessibility jokes roast inaccessible products and design, never
people with disabilities. Don't name real people or reference other shows, films or brands by name, except
globally known products. Content is about the game's world, and keeps the real team anonymous: never where its
people come from or live, or how many there are.

To add or rework content, use the `add-content` skill in `.claude/skills/add-content/`.

## Mix

- **Spicy means punchy.** A spicy item is a sharp roast (`satire`), doom played for laughs (`dark`) or extreme
  absurdity (`unhinged`). A mild joke with an edge isn't spicy.
- **Unhinged** is surreal logic told deadpan: sentient concepts with opinions, cosmic or interdimensional stakes
  applied to petty office life, a trivial machine discovering its purpose, a tense moment that derails into an
  unrelated skit, grave melodrama about nothing, one gag that ends before it gets old.
- **Topics beyond office life.** Office, startup and survey jokes are the base, not the whole pack. Roast Formbricks
  itself (its features, open source, self-hosting), AI from brilliant to catastrophic (agents, job takeover, humans
  kept as batteries), product management, UX, accessibility and software engineering as they'll look in 2026, 2027
  and beyond.
- **Some anti-humor:** items so obvious or boring that they're funny.

## Per game

The character limits match what Claude's prompts in `ai.ts` ask for, and the add-content skill's `check.py` enforces
them.

- **Worst Feedback Ever:** prompts (10-160 characters) are fake survey questions, fill-in-the-blank with exactly one
  `____` or open. Answers (2-80 characters) are short noun phrases ending with a period that work in most prompts.
- **Bot or Not:** the real and Bot questions (10-140 characters each) invite the same kind of short answer, since
  players answer in 80 characters at most: a word, a number, a name or a phrase. They overlap enough for the Bot to
  blend in but are off enough to be caught, and they're funny when revealed side by side. Neither the same topic
  reworded nor unrelated topics. Mix numeric pairs, name-a-thing pairs and opinion pairs.
- **Survey Says:** questions are 10-120 characters. `who` questions name a coworker in the room (affectionate roasts
  only), `scale` questions have labels of at most 24 characters, and `choice` questions have 2-4 options of at most
  32 characters.
- **Skip Logic:** starters (10-120 characters) must be easy to draw: one creature or object doing one visible thing,
  somewhere you can picture. Office flavor goes in the setting, never the action.
- **Make It Worse:** each item is a whole base survey that players sabotage with traps, so it must read as an ordinary
  form first: a title (3-48 characters), an intro line (5-120) and 4-5 questions, exactly one `rating` (with `low`
  and `high` end labels of at most 24 characters), one `number` (a `min`-`max` range of at least 10, and a `unit`),
  one `consent` checkbox (a plain "Send me..." label, and the `thing` it's about for the double-negative trap) and one
  or two `choice` questions (3-4 distinct options of at most 32 characters). Every question has a short `label` (at
  most 20 characters) for the sticky note. Options must all be plausible answers, since the game picks one at random.
