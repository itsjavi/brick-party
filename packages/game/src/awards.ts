import type { GameId, GameStats, PlayerId } from "./types";

export interface Award {
  id: string;
  title: string;
  description: string;
  playerId: PlayerId;
}

export interface GameRecord {
  gameId: GameId;
  players: PlayerId[];
  points: Record<PlayerId, number>;
  stats: GameStats;
}

interface StatAward {
  id: string;
  title: string;
  description: string;
  stat: string;
}

const STAT_AWARDS: StatAward[] = [
  { id: "voice-of-customer", title: "Voice of the Customer", description: "Most votes for the worst feedback.", stat: "promoterVotes" },
  { id: "turing-test", title: "Passed the Turing Test", description: "Escaped as the Bot.", stat: "botEscapes" },
  { id: "bot-hunter", title: "Bot Hunter", description: "Spotted the most Bots.", stat: "botsSpotted" },
  { id: "suspiciously-human", title: "Suspiciously Human", description: "Accused of being the Bot while 100% human.", stat: "framed" },
  { id: "mind-reader", title: "Mind Reader", description: "Predicted the team's answers best.", stat: "mindReader" },
  { id: "statistical-outlier", title: "Statistical Outlier", description: "Disagreed with the team the most.", stat: "outlier" },
  { id: "most-likely-to", title: "Most Likely To...", description: "The team's favorite answer to \"who's most likely\".", stat: "mostLikely" },
  { id: "pixel-picasso", title: "Pixel Picasso", description: "Most hearts for a drawing.", stat: "drawingHearts" },
  { id: "nailed-it", title: "Nailed It", description: "Guessed what the drawings meant, again and again.", stat: "nailedIt" },
  { id: "lost-in-translation", title: "Lost in Translation", description: "Their survey question changed the most on its way around.", stat: "driftWin" },
  { id: "master-forger", title: "Master Forger", description: "Got away as the Fake Artist.", stat: "fakeEscapes" },
  { id: "art-critic", title: "Art Critic", description: "Spotted the most Fake Artists.", stat: "fakesSpotted" },
  { id: "last-brick-standing", title: "Last Brick Standing", description: "Outlasted everyone in Brick Brawl.", stat: "lastStanding" },
  { id: "knockout-artist", title: "Knockout Artist", description: "Their doodle knocked out the most fighters.", stat: "fighterKos" },
  { id: "bulldozer", title: "Bulldozer", description: "Knocked the most bricks off the arena.", stat: "knockouts" },
  { id: "gravity-tester", title: "Gravity Tester", description: "First off the arena. Someone had to check.", stat: "firstOut" },
  { id: "sky-is-falling", title: "The Sky Is Falling", description: "Landed the most dropped bricks after being knocked out.", stat: "hazardHits" },
  { id: "jumped-the-gun", title: "Jumped the Gun", description: "Played the most cards too early in In Order.", stat: "tooEarly" },
  { id: "patience-of-a-saint", title: "Patience of a Saint", description: "Kept calm while others jumped ahead of their cards.", stat: "heldTooLong" },
  { id: "doodle-champion", title: "Doodle Champion", description: "Their drawing won the free-for-all.", stat: "ffaWins" },
  { id: "leg-day", title: "Never Skips Leg Day", description: "Drew the fighter with the most legs.", stat: "legs" },
  { id: "look-no-hands", title: "Look, No Hands", description: "Won fights with a fighter that has no arms.", stat: "armlessWins" },
  { id: "noodled", title: "Noodled", description: "Knocked out by a noodle.", stat: "noodled" },
  { id: "high-roller", title: "High Roller", description: "Won the most on bets in Doodle Champions.", stat: "betWinnings" },
  { id: "lasso-legend", title: "Lasso Legend", description: "Grabbed the most canvas by closing loops in Paint Grab.", stat: "loopCells" },
  { id: "wet-paint", title: "Wet Paint", description: "Painted over everyone else's colour the most.", stat: "paintedOver" },
  { id: "pot-luck", title: "Pot Luck", description: "Grabbed the most paint pots.", stat: "paintPots" },
  { id: "bullseye", title: "Bullseye", description: "Tapped the exact colour in Hue Clue, again and again.", stat: "bullseyes" },
  { id: "colour-whisperer", title: "Colour Whisperer", description: "Gave the Hue Clue clues that landed the most pins close by.", stat: "clueHits" },
  { id: "scenic-route", title: "Scenic Route", description: "Put the most Hue Clue pins far, far from the colour.", stat: "wayOff" },
  { id: "smash-hit", title: "Smash Hit", description: "Sent the most fighters flying off the Doodle Smash stage.", stat: "smashKos" },
  { id: "comeback-kid", title: "Comeback Kid", description: "Got launched and scrambled back onto the stage the most.", stat: "smashComebacks" },
  { id: "power-hungry", title: "Power Hungry", description: "Grabbed the most power-ups in Doodle Smash.", stat: "smashPowerUps" },
  { id: "no-help-needed", title: "No Help Needed", description: "Fell off the Doodle Smash stage without anyone touching them.", stat: "smashSelfKos" },
  { id: "misunderstood-artist", title: "Misunderstood Artist", description: "Knew the word, drew it, got accused anyway.", stat: "framedArtist" },
  { id: "dark-lord-of-ux", title: "Dark Lord of UX", description: "Their Make It Worse form cost everyone the most.", stat: "darkLord" },
  { id: "escape-artist", title: "Escape Artist", description: "First through the most Make It Worse forms.", stat: "escapes" },
  { id: "read-the-fine-print", title: "Read the Fine Print", description: "Saw through the most ghost text, backwards scales and double negatives.", stat: "finePrint" },
  { id: "most-sued", title: "Most Sued", description: "Built a form so bad that most people gave up.", stat: "sued" },
  { id: "premium-member", title: "Premium Member", description: "Said yes to the upsell. Thank you for your purchase.", stat: "upsold" },
];

function sumStat(history: GameRecord[], stat: string): Map<PlayerId, number> {
  const totals = new Map<PlayerId, number>();
  for (const record of history) {
    for (const [playerId, stats] of Object.entries(record.stats)) {
      const value = stats[stat];
      if (value) totals.set(playerId, (totals.get(playerId) ?? 0) + value);
    }
  }
  return totals;
}

const SPECIAL_AWARDS = {
  "nps-100": { title: "NPS 100", description: "Top of the leaderboard." },
  "churn-risk": { title: "Churn Risk", description: "Last place. We'd love to hear your feedback." },
} as const;

/** Display info for every award id, for screens that only have stored ids. */
export const AWARD_INFO: Record<string, { title: string; description: string }> = {
  ...SPECIAL_AWARDS,
  ...Object.fromEntries(STAT_AWARDS.map((a) => [a.id, { title: a.title, description: a.description }])),
};

/**
 * Silly awards for the end-of-match Retro Report. `standings` is sorted best first and breaks
 * ties between players with the same stat.
 */
export function computeAwards(history: GameRecord[], standings: PlayerId[], totals: Record<PlayerId, number> = {}): Award[] {
  const awards: Award[] = [];
  const rank = (id: PlayerId) => standings.indexOf(id);
  const first = standings[0];
  const last = standings.at(-1);
  // Top and bottom awards need an actual lead, not a tie at zero.
  const decided = first !== undefined && last !== undefined && (totals[first] ?? 0) > (totals[last] ?? 0);
  if (first && decided) {
    awards.push({ id: "nps-100", ...SPECIAL_AWARDS["nps-100"], playerId: first });
  }
  for (const a of STAT_AWARDS) {
    const totals = [...sumStat(history, a.stat).entries()].filter(([id]) => rank(id) !== -1);
    if (totals.length === 0) continue;
    totals.sort((x, y) => y[1] - x[1] || rank(x[0]) - rank(y[0]));
    awards.push({ id: a.id, title: a.title, description: a.description, playerId: totals[0]![0] });
  }
  if (standings.length >= 3 && decided) {
    awards.push({ id: "churn-risk", ...SPECIAL_AWARDS["churn-risk"], playerId: last! });
  }
  return awards;
}
