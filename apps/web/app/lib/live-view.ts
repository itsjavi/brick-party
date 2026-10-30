import type { MatchView } from "@brick/game";

/**
 * During a live game (DECISION-19) the room sends ~15 updates a second, and the live screen draws them itself outside
 * React (`RoomFeed`). React's copy of the view only needs to keep up with the rest of the screen: it gets a live
 * update at most this often, unless something around the live part changed.
 */
export const LIVE_VIEW_INTERVAL_MS = 250;

/**
 * Everything in a view but the live game's own moving parts and the clock: the room's chrome (members, host, pause,
 * settings), the match's phase, and the game's id, players, deadline and phase. When it changes, the update can't wait.
 */
export function chromeKey(view: MatchView): string {
  const game = view.game;
  const gamePhase = (game?.view as { phase?: unknown } | null | undefined)?.phase ?? null;
  return JSON.stringify([
    view.code,
    view.phase,
    view.phaseEndsAt,
    view.you,
    view.hostId,
    view.members,
    view.settings,
    view.playlist,
    view.index,
    game ? [game.gameId, game.players, game.deadline, gamePhase] : null,
    view.introReady,
    view.lastGame,
    view.report,
    view.matchId,
    view.ai,
    view.test,
    view.bots,
    view.paused,
    view.clockEpoch,
    view.live,
  ]);
}

/** What React showed last: the view's chrome key and when it went out (ms, any monotonic clock). */
export interface Shown {
  key: string;
  at: number;
}

/**
 * How long a new view may wait before React gets it: 0 for at once. Views of games that aren't live always go at once,
 * exactly as before; a live game's views go at once when the chrome changed, and otherwise at most every `interval`.
 */
export function viewDelay(
  shown: Shown | null,
  next: MatchView,
  nextKey: string,
  now: number,
  interval = LIVE_VIEW_INTERVAL_MS,
): number {
  if (!next.live || !shown || shown.key !== nextKey) return 0;
  return Math.max(0, shown.at + interval - now);
}
