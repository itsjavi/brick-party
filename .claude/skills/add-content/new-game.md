# A new game's first pack

For a game that exists in `packages/game/src/games/` but has no pack in `packages/content/packs/` yet. Do this before
settling the brief, then carry on with step 2 of the skill.

1. **Read the game.** Its definition in `packages/game/src/games/<game>.ts` has the `contentSchema` (the keys, fields
   and length limits a pack must fit) and the `contentRequest` (how many items one game asks for). A game with no
   content schema needs no pack.
2. **Wire the pack**, where the game's author hasn't already:
   - `packages/content/src/packs.ts`: import the JSON, and add the game to `Packs`, `PACKS`, `ContentByGame` and
     `packContent`.
   - `packages/content/src/ai.ts`: add the game to `generationSchemas`, `promptFor` (the game's mechanics, the item
     rules and few-shot examples from the pack) and `toContent`.
   - TypeScript's exhaustive switches over `GameId` flag every place still missing, so the typecheck is the
     checklist.
3. **Write the rules down:**
   - the game's mechanics and what makes a good item, in the "Per game" section of the content guide
     (`packages/content/packs/README.md`) and of [humor.md](humor.md);
   - its field lengths and shapes in `RULES` in [scripts/check.py](scripts/check.py), matching the limits in its
     `ai.ts` prompt.
4. **Pick an id prefix**: two letters from the game's name and a dash, unused by any other pack (`ls` the packs and
   look at their ids). `scripts/pack.py append` creates the file on its first append.
5. **Check the categories fit.** The topic and style sets in `packages/content/src/categories.ts` are shared by every
   game (DECISION-14). When the game's theme needs a topic none of them covers, ask the user before adding one, and
   retag the items across all packs that the new topic fits better.

Size the first pack for at least five games without repeats (five times what `contentRequest` asks for), within the
cap. The content tests cover the new pack once it's in `PACKS`: its items must pass the game's schema, carry known
tags and fit the cap.
