import {
  COLOR_NAMES,
  DUMMY_ID,
  GAMES,
  HUE_COLORS,
  HUE_COLUMN_LETTERS,
  HUE_COLUMN_NAMES,
  HUE_ROW_NAMES,
  PAINT_CODES,
  PAINT_EMPTY,
  REACTIONS,
  GO_TICK,
  SMASH_LIVES,
  STAGES,
  TRAPS,
  TRAP_IDS,
  cellLabel,
  fightSight,
  describeCell,
  styleLine,
  todoFor,
  withNames,
  type BotOrNotView,
  type BrickBrawlView,
  type DoodleChampionsView,
  type DoodleFighterView,
  type DoodleSmashView,
  type FakeArtistView,
  type GameId,
  type HueClueView,
  type InOrderView,
  type MakeItWorseView,
  type MiwAnswer,
  type MiwSurvey,
  type PlacedTrap,
  type MatchView,
  type PaintGrabView,
  type SkipLogicView,
  type SurveySaysView,
  type WorstFeedbackView,
} from "@brick/game";

// Each game's todos and fallback moves live in @brick/game, so "Test it" rooms' bots play the same moves.
export { situationKey, todoFor, type Todo } from "@brick/game";

const quote = (text: string) => JSON.stringify(text);
const left = (endsAt: number | null, now: number) => (endsAt === null ? "" : ` · ${Math.max(0, Math.round((endsAt - now) / 1000))}s left`);

/** Display names by player id, with "?" for strangers. */
export type Names = (id: string | null | undefined) => string;

export function namesOf(view: MatchView): Names {
  const map = new Map(view.members.map((m) => [m.id, m.name]));
  return (id) => (id ? (map.get(id) ?? "?") : "?");
}

/** The game currently running, and its view for this bot, if a game is on. */
function current(view: MatchView): { gameId: GameId; game: unknown } | null {
  return view.phase === "playing" && view.game ? { gameId: view.game.gameId, game: view.game.view } : null;
}

/** One line that says where the room is, for the event stream. */
export function situationLine(view: MatchView, now: number): string {
  const name = namesOf(view);
  const gameId = view.playlist[view.index];
  const title = gameId ? GAMES[gameId].title : "the next game";
  if (view.paused) return `[paused] ${name(view.hostId)} paused ${title}; moves wait until it resumes (chat still works)`;
  switch (view.phase) {
    case "lobby":
      return `[lobby] waiting for ${name(view.hostId)} to start · in the room: ${view.members.map((m) => m.name).join(", ")}`;
    case "loading":
      return `[loading] ${title}`;
    case "intro":
      return `[intro] ${title} is next (the autopilot presses "Got it")`;
    case "intermission":
      return `[break] standings: ${standings(view)}`;
    case "report": {
      const winners = view.report?.players.filter((p) => p.rank === 1) ?? [];
      const top = winners.length > 1 ? `, ${winners.map((p) => p.name).join(" and ")} tie with ${winners[0]!.total}` : winners[0] ? `, ${winners[0].name} wins with ${winners[0].total}` : "";
      return `[report] match over${top} · react or chat, then stop or wait for "again"`;
    }
    case "playing": {
      const g = current(view);
      if (!g) return `[playing] ${title}`;
      const v = g.game as {
        phase: string;
        round?: number;
        totalRounds?: number;
        step?: number;
        totalSteps?: number;
        /** Turn-based games (Fake Artist): whose turn it is, in order. */
        turn?: number;
        turns?: unknown[];
        maxTurns?: number;
        endsAt?: number;
        /** Only Skip Logic's reveal walks through chains; Bot or Not's has none. */
        reveal?: { chain?: number; totalChains?: number } | null;
      };
      const at = v.reveal?.chain !== undefined
        ? ` chain ${v.reveal.chain + 1}/${v.reveal.totalChains}`
        : v.round !== undefined
          ? ` round ${v.round + 1}/${v.totalRounds}`
          : v.step !== undefined
            ? ` step ${v.step + 1}/${v.totalSteps}`
            : "";
      const turn =
        v.phase === "draw" && v.turns && v.turn !== undefined
          ? ` · turn ${v.turn + 1}/${v.turns.length}`
          : v.maxTurns && v.turn !== undefined
            ? ` · turn ${v.turn + 1}/${v.maxTurns}`
            : "";
      // Doodle Champions' weigh-in and fights are moments to watch and react to, not turns.
      const tag = /results|reveal|weighin|fight|gallery/.test(v.phase) ? "reveal" : /judging|done/.test(v.phase) ? "wait" : "turn";
      return `[${tag}] ${GAMES[g.gameId].title} · ${v.phase}${at}${turn}${left(v.endsAt ?? null, now)}`;
    }
  }
}

function standings(view: MatchView): string {
  return [...view.members]
    .sort((a, b) => b.score - a.score)
    .map((m) => `${m.name} ${m.score}`)
    .join(", ");
}

/** The room as everyone sees it: header, players and scores. */
export function roomLines(view: MatchView, isBot: (id: string) => boolean, now: number): string[] {
  const name = namesOf(view);
  const gameId = view.playlist[view.index];
  const game = view.phase === "playing" || view.phase === "intro" || view.phase === "loading" ? ` · ${gameId ? GAMES[gameId].title : ""} (game ${view.index + 1}${view.settings.preset === "endless" ? "" : `/${view.playlist.length}`})` : "";
  const players = view.members.map((m) => `${m.name}${isBot(m.id) ? "" : " (human)"}${m.id === view.hostId ? " (host)" : ""}${m.status === "online" ? "" : ` (${m.status})`} ${m.score}`);
  return [`Room ${view.code} · ${view.phase}${view.paused ? " (PAUSED)" : ""}${game}${left(view.phaseEndsAt, now)}`, `Players: ${players.join(" · ")}`, ...sharedLines(view, now, name)];
}

/** What every player in the current game can see, from one bot's view. */
function sharedLines(view: MatchView, now: number, name: Names): string[] {
  const g = current(view);
  if (view.phase === "report" && view.report) {
    return [`Final: ${view.report.players.map((p) => `${p.rank}. ${p.name} ${p.total}`).join(" · ")}`, `Awards: ${view.report.awards.map((a) => `${a.title}: ${name(a.playerId)}`).join(" · ")}`];
  }
  if (!g) return [];
  switch (g.gameId) {
    case "worst-feedback": {
      const v = g.game as WorstFeedbackView;
      const lines = [`Worst Feedback · ${v.phase} · round ${v.round + 1}/${v.totalRounds}${left(v.endsAt, now)} · prompt: ${quote(v.prompt)}`];
      if (v.phase === "results" && v.results) {
        for (const r of v.results) {
          const votes = `${r.voters.length} ${r.voters.length === 1 ? "vote" : "votes"}`;
          lines.push(`  ${quote(r.text)} by ${name(r.authorId)}${r.written ? " (written)" : ""} · ${votes} · +${r.points}`);
        }
      }
      return lines;
    }
    case "bot-or-not": {
      const v = g.game as BotOrNotView;
      const lines = [`Bot or Not · ${v.phase} · round ${v.round + 1}/${v.totalRounds}${left(v.endsAt, now)}`];
      if (v.answers) lines.push(`  answers: ${v.answers.map((a) => `${name(a.playerId)}: ${quote(a.text)}`).join(" · ")}`);
      if (v.phase === "discuss") lines.push(`  ready to vote: ${v.readyIds.map(name).join(", ") || "nobody yet"}`);
      if (v.phase === "guess" || v.phase === "judging") lines.push(`  the Bot was ${name(v.botId)}${v.guess ? `, guessing ${quote(v.guess)}` : ""}`);
      if (v.reveal) {
        const r = v.reveal;
        lines.push(`  real: ${quote(r.realQuestion)} · decoy: ${quote(r.botQuestion)} · Bot: ${name(v.botId)} · ${r.caught ? "caught" : "got away"}`);
        if (v.guess) lines.push(`  guess ${quote(v.guess)}: ${r.verdict?.correct ? "right" : "wrong"}${r.verdict?.quip ? ` · ${quote(r.verdict.quip)}` : ""}`);
        lines.push(`  votes: ${r.tally.map((t) => `${name(t.targetId)} ← ${t.voters.map(name).join(", ")}`).join(" · ")}`);
      }
      return lines;
    }
    case "survey-says": {
      const v = g.game as SurveySaysView;
      const lines = [`Survey Says · ${v.phase} · question ${v.round + 1}/${v.totalRounds}${left(v.endsAt, now)} · ${v.question.kind}: ${quote(v.question.text)}`];
      if (v.question.kind === "scale") lines.push(`  scale 0 (${v.question.minLabel}) to 10 (${v.question.maxLabel})`);
      else lines.push(`  options: ${v.question.options.map((o) => (v.question.kind === "who" ? o.label : `${o.key}: ${o.label}`)).join(" · ")}`);
      if (v.results) {
        const r = v.results;
        const counts = r.counts.filter((c) => c.count).map((c) => `${c.label} ×${c.count}`).join(", ");
        lines.push(`  results: ${counts}${r.average !== null ? ` · average ${r.average}` : ""} · predictions: ${r.predictions.map((p) => `${name(p.playerId)} +${p.points}`).join(", ")}`);
      }
      return lines;
    }
    case "skip-logic": {
      const v = g.game as SkipLogicView;
      const lines = [`Skip Logic · ${v.phase} · step ${v.step + 1}/${v.totalSteps}${left(v.endsAt, now)}`];
      if (v.reveal) {
        const r = v.reveal;
        lines.push(`  chain ${r.chain + 1}/${r.totalChains}, started by ${name(r.ownerId)}${r.quip ? ` · verdict: ${quote(r.quip)}` : ""}`);
        r.entries.forEach((e, i) => {
          const verdict = r.verdicts[i] ? ` · ${r.verdicts[i]!.closeness}/10` : "";
          const hearts = r.hearts[i]?.length ? ` · ♥ ${r.hearts[i]!.map(name).join(", ")}` : "";
          lines.push(`  ${i}. ${e.kind === "text" ? quote(e.text) : "[drawing]"} by ${name(e.authorId)}${verdict}${hearts}`);
        });
        lines.push(`  heart a favorite: {"type":"heart","chain":${r.chain},"entry":N} · \`brick look BOT\` shows the chain`);
      }
      return lines;
    }
    case "brick-brawl": {
      const v = g.game as BrickBrawlView;
      const lines = [`Brick Brawl · ${v.phase} · round ${v.round + 1}/${v.totalRounds} · turn ${v.turn + 1}/${v.maxTurns}${left(v.endsAt, now)}`];
      lines.push(...brawlMap(v, name));
      if (v.phase === "plan") lines.push(`  moves in: ${v.readyIds.map(name).join(", ") || "nobody yet"}`);
      if (v.events.length) lines.push(`  last turn: ${brawlEvents(v, name)}`);
      if (v.placing) lines.push(`  round over: ${v.placing.map((id, i) => `${i + 1}. ${name(id)} +${v.roundPoints[id] ?? 0}`).join(" · ")}`);
      return lines;
    }
    case "in-order": {
      const v = g.game as InOrderView;
      const hearts = "♥".repeat(v.lives) + "♡".repeat(Math.max(0, v.maxLives - v.lives));
      const lines = [`In Order · ${v.phase} · level ${v.round + 1}/${v.totalRounds} (${v.cardsEach} card${v.cardsEach === 1 ? "" : "s"} each) · lives ${hearts}${left(v.endsAt, now)}`];
      if (v.phase === "ready") lines.push("  get ready: cards can be played when the countdown ends");
      lines.push(`  pile: ${v.plays.length ? v.plays.map((p) => `${p.card} (${name(p.playerId)}${p.burned.length ? `, too early: threw away ${p.burned.map((b) => `${name(b.playerId)}'s ${b.card}`).join(", ")}` : ""})`).join(" → ") : "empty"}`);
      if (v.phase === "play") lines.push(`  still holding: ${Object.entries(v.holding).map(([id, n]) => `${name(id)} ${n}`).join(" · ")}`);
      if (v.outcome) {
        const how = v.outcome === "cleared" ? `level cleared, +${v.levelPoints} for everyone` : v.outcome === "timeout" ? "time ran out" : "out of lives";
        const rest = v.leftover.length ? ` · never played: ${v.leftover.map((c) => `${name(c.playerId)}'s ${c.card}`).join(", ")}` : "";
        lines.push(`  ${how}${rest}`);
      }
      return lines;
    }
    case "doodle-champions":
      return doodleLines(g.game as DoodleChampionsView, now, name);
    case "paint-grab":
      return paintLines(g.game as PaintGrabView, now, name);
    case "hue-clue":
      return hueLines(g.game as HueClueView, now, name);
    case "doodle-smash":
      return smashLines(g.game as DoodleSmashView, now, name);
    case "make-it-worse":
      return worseLines(g.game as MakeItWorseView, now, name);
    case "fake-artist": {
      const v = g.game as FakeArtistView;
      const lines = [`Fake Artist · ${v.phase} · round ${v.round + 1}/${v.totalRounds}${left(v.endsAt, now)} · category: ${quote(v.category)}`];
      const counts = v.turns
        .filter((id, i) => v.turns.indexOf(id) === i)
        .map((id) => `${name(id)} (${COLOR_NAMES[v.colors[id] ?? 0]}) ${v.lines.filter((l) => l.playerId === id).length}`);
      lines.push(`  lines so far: ${counts.join(" · ")}${v.drawerId ? ` · drawing now: ${name(v.drawerId)}` : ""} · \`brick look BOT\` shows the drawing`);
      if (v.phase === "vote") lines.push(`  votes in: ${v.votedIds.map(name).join(", ") || "nobody yet"}`);
      if (v.phase === "guess") lines.push(`  ${name(v.fakeId)} was caught and is guessing the word`);
      if (v.reveal) {
        const r = v.reveal;
        lines.push(`  the word was ${quote(r.word)} · fake: ${name(v.fakeId)} · ${r.caught ? "caught" : "got away"}${v.guess ? ` · guessed ${quote(v.guess)} (${r.guessCorrect ? "right" : "wrong"})` : ""}`);
        lines.push(`  votes: ${r.tally.map((t) => `${name(t.targetId)} ← ${t.voters.map(name).join(", ")}`).join(" · ")}`);
      }
      return lines;
    }
  }
}

/** What one bot sees and has to do, for `state`. */
export function botLines(view: MatchView, me: string, now: number): string[] {
  const name = namesOf(view);
  const t = todoFor(view, me);
  const lines: string[] = [];
  const g = current(view);
  if (g && view.game?.players.includes(me)) {
    switch (g.gameId) {
      case "worst-feedback": {
        const v = g.game as WorstFeedbackView;
        if (v.myAnswer) lines.push(`answered ${quote(v.myAnswer)}`);
        if (t && v.phase === "answer") lines.push(`hand: ${(v.hand ?? []).map((c) => `${c.id}: ${quote(c.text)}${c.fresh ? " (new)" : ""}`).join(" · ")}`);
        if (v.phase === "vote" && v.ballot) {
          lines.push(`ballot: ${v.ballot.map((b) => `${b.answerId}: ${quote(b.text)}${b.mine ? " (yours)" : ""}`).join(" · ")}`);
        }
        if (v.myVote) lines.push(`voted for ${v.myVote}`);
        break;
      }
      case "bot-or-not": {
        const v = g.game as BotOrNotView;
        lines.push(`${v.youAreBot ? "YOU ARE THE BOT: your question is the decoy, blend in" : "you're not the Bot"} · your question: ${quote(v.question)}`);
        if (v.myAnswer) lines.push(`answered ${quote(v.myAnswer)}`);
        if (v.myVote) lines.push(`voted for ${name(v.myVote)}`);
        break;
      }
      case "survey-says": {
        const v = g.game as SurveySaysView;
        const label = (value: string | number) => v.question.options.find((o) => o.key === value)?.label ?? String(value);
        if (v.mySubmission) lines.push(`answered ${label(v.mySubmission.answer)}, predicted ${label(v.mySubmission.prediction)}`);
        break;
      }
      case "skip-logic": {
        const v = g.game as SkipLogicView;
        const prev = v.task?.previous;
        if (t && prev) lines.push(prev.kind === "text" ? `you got the text ${quote(prev.text)} by ${name(prev.authorId)}` : `you got a drawing by ${name(prev.authorId)}`);
        if (t && v.phase === "write" && v.suggestions.length) lines.push(`suggestions: ${v.suggestions.map(quote).join(" · ")}`);
        if (v.task?.done) lines.push("done with this step");
        if (v.reveal?.myHeart !== null && v.reveal?.myHeart !== undefined) lines.push(`hearted entry ${v.reveal.myHeart}`);
        break;
      }
      case "brick-brawl": {
        const v = g.game as BrickBrawlView;
        const mine = v.bricks.find((b) => b.id === me);
        if (mine?.outAt !== null && mine?.outAt !== undefined) lines.push(`you're knocked out this round${v.myDrop ? `; dropping on ${v.myDrop.x},${v.myDrop.y}` : ""}`);
        else if (mine) lines.push(`you're at ${mine.x},${mine.y}${mine.dazed ? " and DAZED (you skip this turn)" : ""}${v.myMove ? `; your move: ${JSON.stringify(v.myMove)}` : ""}`);
        break;
      }
      case "in-order": {
        const v = g.game as InOrderView;
        if (v.hand) lines.push(`your cards: ${v.hand.join(", ") || "none left"}${v.phase === "play" && v.hand.length ? " (never say them; the autopilot plays your lowest at its moment)" : ""}`);
        break;
      }
      case "doodle-champions": {
        const v = g.game as DoodleChampionsView;
        const mine = v.fighters.find((f) => f.ownerId === me);
        if (v.phase === "draw") lines.push(v.submittedIds.includes(me) ? "your fighter is in; waiting for the others" : "nobody has seen your fighter yet: draw it in parts");
        if (mine) lines.push(`your fighter: #${mine.n} ${quote(mine.name)}, ${recordOf(mine)}${mine.auto ? " (drawn for you: you ran out of time)" : ""}`);
        if (v.myBet) lines.push(`your bet: ${v.myBet.stake} on ${quote(v.fighters.find((f) => f.id === v.myBet!.targetId)?.name ?? v.myBet.targetId)}`);
        break;
      }
      case "paint-grab": {
        const v = g.game as PaintGrabView;
        const i = v.order.indexOf(me);
        if (i >= 0) lines.push(`you paint ${PAINT_CODES[i]} and own ${share(v, v.counts[me] ?? 0)} of the canvas${v.phase === "paint" ? "; the autopilot paints for you, so you only talk" : ""}`);
        break;
      }
      case "hue-clue": {
        const v = g.game as HueClueView;
        if (v.youGive && v.target !== null && v.phase !== "reveal" && v.phase !== "done") {
          lines.push(`${v.phase === "clue" ? "YOU GIVE THE CLUE: your" : "you gave the clue; your"} secret colour is ${cell(v.target)} · \`brick look BOT\` shows the board`);
        }
        if (v.myPin) lines.push(`your pin: ${cell(v.myPin.cell)}${v.myPin.locked ? " (locked in)" : " (not locked: you can still move it)"}`);
        else if (v.phase === "guess" && !v.youGive) lines.push("no pin yet");
        break;
      }
      case "doodle-smash": {
        const v = g.game as DoodleSmashView;
        if (v.phase === "draw") lines.push(v.submittedIds.includes(me) ? "your fighter is in; waiting for the others" : "nobody has seen your fighter yet: draw it in parts, and say what its weapon is");
        const mine = v.fighters.find((f) => f.id === me);
        if (mine) lines.push(`your fighter: ${quote(mine.name)} with ${weaponWords(mine.weapon, mine.spec.weapon)}${mine.auto ? " (drawn for you: you ran out of time)" : ""}`);
        if (v.phase === "fight") lines.push("the fight is live: the autopilot steers your fighter, so you only talk");
        break;
      }
      case "make-it-worse": {
        const v = g.game as MakeItWorseView;
        if (v.phase === "build" && v.myForm) {
          lines.push(`trap palette (budget ${v.budget}, each trap once): ${TRAP_IDS.map((id) => `${id} ${TRAPS[id].cost} (${TRAPS[id].target === "form" ? "whole form" : `on a ${TRAPS[id].target === "any" ? "" : `${TRAPS[id].target} `}question`}: ${TRAPS[id].does})`).join(" · ")}`);
          const spent = v.myForm.traps.reduce((n, t) => n + TRAPS[t.trap].cost, 0);
          lines.push(`your form: ${v.myForm.traps.length ? trapList(v.myForm.traps, v.survey) : "no traps yet"} · ${spent} of ${v.budget} points spent, ${v.budget - spent} left${v.myForm.locked ? " (locked)" : ""}`);
        }
        if (v.run && v.phase !== "build" && v.phase !== "gallery" && v.phase !== "done") {
          if (v.run.form.designerId === me) lines.push("this is YOUR form: watch them struggle, and gloat or groan in the chat");
          else if (v.run.youFill) lines.push(v.run.submitted ? "you submitted this form" : "you're filling in this form; the autopilot clicks through it for you, a step at a time, so you only talk");
        }
        break;
      }
      case "fake-artist": {
        const v = g.game as FakeArtistView;
        lines.push(v.youAreFake ? `YOU ARE THE FAKE: you only know the category ${quote(v.category)}; blend in, then guess the word if caught` : `the secret word is ${quote(v.word ?? "?")}; draw it without making it too obvious for the fake`);
        if (v.myVote) lines.push(`voted for ${name(v.myVote)}`);
        break;
      }
    }
  } else if (view.phase === "playing") {
    lines.push("watching this game (not playing)");
  }
  if (view.phase === "intro" && !view.introReady.includes(me)) lines.push(`on the rules screen (the autopilot presses "Got it")`);
  if (t) lines.push(`TODO ${t.hint}${left(t.endsAt, now)}`);
  return lines;
}

export const REACTION_HELP = `reactions: ${REACTIONS.join(", ")} (optionally aimed at a player: {"react":"lol","target":NAME})`;

/**
 * The arena as text, row by row (y down, x across): a letter per brick, "." for floor, "!" for floor that crumbles
 * after this turn, " " for gone.
 */
function brawlMap(v: BrickBrawlView, name: Names): string[] {
  const letters = new Map(v.bricks.map((b, i) => [b.id, String.fromCharCode(65 + i)]));
  const ringNext = v.crumbles ? v.ring + 1 : v.ring;
  const rows = Array.from({ length: v.size }, (_, y) =>
    Array.from({ length: v.size }, (_, x) => {
      const brick = v.bricks.find((b) => b.outAt === null && b.x === x && b.y === y);
      if (brick) return letters.get(brick.id)!;
      const on = x >= v.ring && y >= v.ring && x < v.size - v.ring && y < v.size - v.ring;
      if (!on) return " ";
      const stays = x >= ringNext && y >= ringNext && x < v.size - ringNext && y < v.size - ringNext;
      return stays ? "." : "!";
    }).join(" "),
  );
  const legend = v.bricks.map((b) => `${letters.get(b.id)} ${name(b.id)}${b.outAt !== null ? " (out)" : b.dazed ? " (dazed)" : ""} at ${b.x},${b.y}`);
  return [`  arena (x 0-${v.size - 1} across, y 0-${v.size - 1} down; up is y-1; "!" crumbles after this turn, blank is gone; the edge crumbles every 3 turns; moves land first, then shoves):`, ...rows.map((r, y) => `  ${String(y).padStart(2)} | ${r}`), `  ${legend.join(" · ")}`];
}

function brawlEvents(v: BrickBrawlView, name: Names): string {
  return v.events
    .flatMap((e) => {
      switch (e.kind) {
        case "fall":
          return [`${name(e.id)} fell${e.by.length ? ` (pushed by ${e.by.map(name).join(", ")})` : ""}`];
        case "shove":
          return [`${name(e.by)} shoved ${name(e.id)}`];
        case "ram":
          return [`${name(e.by)} rammed ${name(e.id)}`];
        case "bump":
          return [`${name(e.id)} bumped`];
        case "block":
          return [`${name(e.id)} blocked`];
        case "drop":
          return [`${name(e.by)} dropped a brick on ${e.x},${e.y}${e.hit ? `, dazing ${name(e.hit)}` : ""}`];
        case "shrink":
          return ["the edge crumbled"];
        default:
          return [];
      }
    })
    .join("; ") || "everyone stood still";
}


const recordOf = (f: DoodleFighterView) => `${f.record.wins}W ${f.record.losses}L${f.record.draws ? ` ${f.record.draws}D` : ""}`;

/** One fighter by its shapes and stats, for deciding a bet. */
function fighterLine(f: DoodleFighterView, name: Names): string {
  const s = f.stats;
  const owner = f.id === DUMMY_ID ? "the house" : name(f.ownerId);
  const gear = [`${s.legs} leg${s.legs === 1 ? "" : "s"}`, `${s.arms} arm${s.arms === 1 ? "" : "s"}`, s.weaponInk ? `weapon (length ${s.weaponLength})` : "no weapon"];
  const traits = [s.topples ? "topples" : "", s.noodle ? "noodle" : ""].filter(Boolean);
  return `  #${f.n} ${quote(f.name)} by ${owner}: ${gear.join(", ")} · ${styleLine(s).toLowerCase()} · HP ${s.hp} · speed ${s.speed} · reach ${s.reach} · damage ${s.damage} every ${(s.cooldown / 10).toFixed(1)}s${traits.length ? ` · ${traits.join(", ")}` : ""} · ${recordOf(f)}`;
}

function doodleLines(v: DoodleChampionsView, now: number, name: Names): string[] {
  const fighter = (id: string) => v.fighters.find((f) => f.id === id);
  const label = (id: string) => quote(fighter(id)?.name ?? id);
  const names = v.fighters.map((f) => f.name);
  const stage =
    v.phase === "draw" ? "drawing" : v.phase === "weighin" ? "weigh-in" : `round ${v.round + 1}/${v.totalRounds} (${v.kind === "ffa" ? "free-for-all" : "duels"})`;
  const lines = [`Doodle Champions · ${v.phase} · ${stage}${left(v.endsAt, now)}`];
  if (v.phase === "draw") lines.push(`  fighters in: ${v.submittedIds.map(name).join(", ") || "nobody yet"}`);
  if (v.phase === "weighin") lines.push("  the weigh-in, every fighter by its shapes:", ...v.fighters.map((f) => fighterLine(f, name)));
  if (v.phase === "bet") {
    const inPlay = new Set(v.matches.flat());
    lines.push(
      `  this round's fights; bet on one fighter, a win pays stake x its odds (\`brick look BOT\` shows them):`,
      ...v.matches.map((m) => `  ${m.map((id) => `${label(id)} (targetId ${quote(id === DUMMY_ID ? DUMMY_ID : name(fighter(id)?.ownerId))}, odds x${v.odds[id]})`).join(" vs ")}`),
      ...v.fighters.filter((f) => inPlay.has(f.id)).map((f) => fighterLine(f, name)),
      `  bets in: ${v.bettedIds.map(name).join(", ") || "nobody yet"}`,
    );
  }
  if (v.phase === "fight") lines.push(`  fighting now: ${v.matches.map((m) => m.map(label).join(" vs ")).join(" · ")}`);
  if ((v.phase === "results" || v.phase === "done") && v.fights) {
    for (const f of v.fights) {
      const how = f.winnerId === null ? "a draw" : `${label(f.winnerId)} wins by ${f.how === "ko" ? "knockout" : "decision"}`;
      const order = f.fighters.length > 2 ? ` · placing: ${f.placing.map(label).join(", ")}` : "";
      const finish = f.captions.at(-1);
      lines.push(`  ${f.fighters.map(label).join(" vs ")}: ${how}${order}${finish ? ` · ${quote(withNames(finish.text, names))}` : ""}`);
    }
    if (v.bets) {
      const bets = Object.entries(v.bets).map(([id, b]) => `${name(id)} ${b.stake} on ${label(b.targetId)} ${b.delta >= 0 ? "+" : ""}${b.delta}`);
      lines.push(`  bets: ${bets.join(" · ") || "none"}`);
    }
    const pts = Object.entries(v.roundPoints).filter(([, p]) => p);
    if (pts.length) lines.push(`  this round: ${pts.map(([id, p]) => `${name(id)} ${p > 0 ? "+" : ""}${p}`).join(" · ")}`);
  }
  return lines;
}

const share = (v: PaintGrabView, cells: number) => `${Math.round((cells * 100) / (v.width * v.height))}%`;

function paintLines(v: PaintGrabView, now: number, name: Names): string[] {
  const lines = [`Paint Grab · ${v.phase} · round ${v.round + 1}/${v.totalRounds}${left(v.endsAt, now)}`];
  if (v.phase === "ready") lines.push("  get ready: painting starts when the countdown ends");
  const owners = [...v.order].sort((a, b) => (v.counts[b] ?? 0) - (v.counts[a] ?? 0));
  lines.push(`  canvas: ${owners.map((id) => `${name(id)} (${PAINT_CODES[v.order.indexOf(id)]}) ${share(v, v.counts[id] ?? 0)}`).join(" · ")}`);
  if (v.phase === "paint" || v.phase === "reveal") lines.push(...paintMap(v));
  const recent = v.events.slice(-3).map((e) => `${name(e.playerId)} ${e.kind === "fill" ? "closed a loop" : "grabbed the paint pot"} (+${e.cells} cells)`);
  if (recent.length) lines.push(`  lately: ${recent.join(" · ")}`);
  const last = v.rounds.at(-1);
  if (last && (v.phase === "reveal" || v.phase === "results")) {
    lines.push(`  round ${v.rounds.length} over: ${last.placing.map((id, i) => `${i + 1}. ${name(id)} ${share(v, last.counts[id] ?? 0)} +${last.points[id] ?? 0}`).join(" · ")}`);
  }
  return lines;
}

/** The canvas as text at half size: each character is the colour most of a 2x2 block has, "*" the paint pot. */
function paintMap(v: PaintGrabView): string[] {
  const rows: string[] = [];
  const potX = v.pot === null ? -1 : Math.floor((v.pot % v.width) / 2);
  const potY = v.pot === null ? -1 : Math.floor(Math.floor(v.pot / v.width) / 2);
  for (let y = 0; y < v.height; y += 2) {
    let row = "";
    for (let x = 0; x < v.width; x += 2) {
      if (x / 2 === potX && y / 2 === potY) {
        row += "*";
        continue;
      }
      const tally = new Map<string, number>();
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const ch = v.grid[(y + dy) * v.width + x + dx] ?? PAINT_EMPTY;
        tally.set(ch, (tally.get(ch) ?? 0) + 1);
      }
      row += [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0] === PAINT_EMPTY ? 1 : b[0] === PAINT_EMPTY ? -1 : 0))[0]![0];
    }
    rows.push(`  | ${row}`);
  }
  return [`  canvas at half size (a letter per player, "." bare, "*" the paint pot):`, ...rows];
}

/** A Hue Clue cell for the driver: its label, its colour as hex, and a rough plain description. */
const cell = (n: number) => `${cellLabel(n)} (${HUE_COLORS[n]}, ${describeCell(n)})`;

function hueLines(v: HueClueView, now: number, name: Names): string[] {
  const lines = [`Hue Clue · ${v.phase} · round ${v.round + 1}/${v.totalRounds}${left(v.endsAt, now)} · clue-giver: ${name(v.giverId)}`];
  if (v.phase === "clue") lines.push(`  ${name(v.giverId)} is choosing a clue (a word or two, no colour names or numbers)`);
  if (v.clue !== null) lines.push(`  clue: ${quote(v.clue)}${v.autoClue ? ` (a house clue: ${name(v.giverId)} ran out of time)` : ""}`);
  if (v.phase === "guess") {
    lines.push(`  board: columns ${[...HUE_COLUMN_LETTERS].map((l, i) => `${l} ${HUE_COLUMN_NAMES[i]}`).join(", ")}; rows 1 ${HUE_ROW_NAMES[0]} to 10 ${HUE_ROW_NAMES.at(-1)}`);
    const locked = v.lockedIds.map(name);
    lines.push(`  pins down: ${v.placedIds.map(name).join(", ") || "nobody yet"}${locked.length ? ` (locked: ${locked.join(", ")})` : ""} of ${v.guessers.length}; pins stay hidden until the reveal`);
  }
  if (v.reveal) {
    const r = v.reveal;
    lines.push(`  the colour was ${cell(r.target)}`);
    const pins = r.pins.map((p) => `${name(p.playerId)} ${cellLabel(p.cell)} ${p.rings === 0 ? "bullseye" : `${p.rings} ring${p.rings === 1 ? "" : "s"} off`} +${p.points}`);
    lines.push(`  pins: ${pins.join(" · ") || "none"} · ${name(v.giverId)} +${r.giverPoints} for the clue`);
  }
  const past = v.past.filter((p) => !(v.reveal && p.target === v.reveal.target && p.giverId === v.giverId));
  if (past.length) lines.push(`  earlier clues: ${past.map((p) => `${quote(p.clue)} (${name(p.giverId)}) was ${cellLabel(p.target)}`).join(" · ")}`);
  return lines;
}

/** A Doodle Smash fighter's weapon in words. */
function weaponWords(chosen: string, actual: string): string {
  if (actual === "fists") return "fists (no weapon drawn)";
  return chosen === "blaster" ? "a blaster (shoots)" : "a blade (hits up close)";
}

function smashLines(v: DoodleSmashView, now: number, name: Names): string[] {
  const stage = v.stage ? STAGES[v.stage] : null;
  const lines = [`Doodle Smash · ${v.phase}${stage ? ` · stage: ${stage.name}` : ""}${left(v.endsAt, now)}`];
  if (v.phase === "draw") lines.push(`  fighters in: ${v.submittedIds.map(name).join(", ") || "nobody yet"}`);
  if (v.phase === "weighin") {
    if (stage) lines.push(`  ${stage.blurb}`);
    lines.push("  the weigh-in, every fighter by its shapes:");
    for (const f of v.fighters) {
      const s = f.spec;
      lines.push(`  ${quote(f.name)} by ${name(f.id)}: ${weaponWords(f.weapon, s.weapon)} · weight ${s.weight.toFixed(2)} · speed ${s.run} · jump ${s.jump} · reach ${s.reach} · hit ${s.damage}%${f.auto ? " · drawn for them" : ""}`);
    }
  }
  const fight = v.fight;
  if (fight && (v.phase === "fight" || v.phase === "results")) {
    const sight = fightSight(fight);
    const rows = sight.bodies.map((b, i) => {
      const hearts = "♥".repeat(Math.max(0, b.lives)) + "♡".repeat(Math.max(0, SMASH_LIVES - b.lives));
      return `${name(v.order[i])} ${b.lives > 0 ? `${hearts} ${Math.round(b.dmg)}%` : "out"}`;
    });
    if (v.phase === "fight") lines.push(`  ${fight.tick < GO_TICK ? "3, 2, 1... " : ""}fighters (lives, damage %): ${rows.join(" · ")}`);
  }
  if (v.placing && (v.phase === "results" || v.phase === "done")) {
    const kos = (id: string) => v.fight?.tally?.[v.order.indexOf(id)]?.kos ?? 0;
    lines.push(`  final: ${v.placing.map((id, i) => `${i + 1}. ${name(id)} (${kos(id)} KO${kos(id) === 1 ? "" : "s"}) +${v.points[id] ?? 0}`).join(" · ")}`);
  }
  return lines;
}

/** Traps by name, with the question each one sits on. */
function trapList(traps: readonly PlacedTrap[], survey: MiwSurvey): string {
  return traps.map((t) => `${TRAPS[t.trap].name}${t.question === undefined ? "" : ` on Q${t.question} (${survey.questions[t.question]?.label})`}`).join(", ");
}

/** A sticky-note answer in words. */
function noteAnswer(survey: MiwSurvey, i: number, a: MiwAnswer): string {
  const q = survey.questions[i];
  if (!q || a === null) return "?";
  switch (q.kind) {
    case "choice":
      return quote(q.options[a as number] ?? "?");
    case "rating":
      return `${a} of 5`;
    case "number":
      return `${a} ${q.unit}`;
    case "consent":
      return a ? "yes" : "no";
  }
}

function worseLines(v: MakeItWorseView, now: number, name: Names): string[] {
  const s = v.survey;
  const lines = [`Make It Worse · ${v.phase} · form ${v.round + 1}/${v.totalRounds}${left(v.endsAt, now)} · survey ${quote(s.title)}`];
  if (v.phase === "build") {
    lines.push(`  questions: ${s.questions.map((q, i) => `Q${i} ${q.kind} ${quote(q.text)}${q.kind === "choice" ? ` (${q.options.join(" / ")})` : ""}`).join(" · ")}`);
    lines.push(`  locked in: ${v.lockedIds.map(name).join(", ") || "nobody yet"}`);
    return lines;
  }
  const run = v.run;
  if (run && v.phase !== "gallery" && v.phase !== "done") {
    lines.push(`  form by ${name(run.form.designerId)}${run.form.auto ? " (random traps: they ran out of time)" : ""}: ${run.form.traps.length ? trapList(run.form.traps, s) : "no traps at all"}`);
    lines.push(`  sticky note: ${run.answers.map((a, i) => `${s.questions[i]?.label} ${noteAnswer(s, i, a)}`).join(" · ")}`);
    if (v.phase === "play") {
      lines.push(`  progress: ${run.fillers.map((id) => { const p = run.progress[id]; return `${name(id)} ${p?.finished ? "done" : `${p?.done ?? 0}/${run.checkpoints}${p?.stuck ? ` (stuck on ${TRAPS[p.stuck].name})` : ""}`}`; }).join(" · ")}`);
    }
    const r = run.result;
    if (r) {
      lines.push(`  ${r.sued ? `SUED: fewer than half finished, so ${name(run.form.designerId)} scores nothing` : `${name(run.form.designerId)} scores +${r.designerPoints} for the trouble`}`);
      lines.push(`  fillers: ${r.players.map((p) => `${name(p.playerId)} ${p.finished ? `${p.seconds}s, ${p.correct} right${p.upsold ? ", bought Premium" : ""}` : "didn't finish"} +${p.points}`).join(" · ")}`);
      for (const t of r.traps) lines.push(`  ${TRAPS[t.trap].name}: ${t.fellIds.length ? `caught ${t.fellIds.map(name).join(", ")}` : "caught nobody"} · trick: ${TRAPS[t.trap].trick}`);
    }
  }
  if (v.gallery.length) lines.push(`  gallery (not played): ${v.gallery.map((f) => `${name(f.designerId)}: ${trapList(f.traps, s)}`).join(" · ")}`);
  return lines;
}
