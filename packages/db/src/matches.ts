import { avatarSchema, type Avatar, type MatchReport } from "@brick/game";
import type { Db } from "./index";

export interface StoredMatch {
  id: string;
  roomCode: string;
  startedAt: number;
  endedAt: number;
  report: MatchReport;
}

export interface HallOfFame {
  players: {
    id: string;
    nickname: string;
    avatar: Avatar;
    matches: number;
    wins: number;
    points: number;
    /** award id -> times won */
    awards: Record<string, number>;
  }[];
  recent: {
    id: string;
    roomCode: string;
    endedAt: number;
    players: number;
    winner: { nickname: string; avatar: Avatar } | null;
  }[];
}

/**
 * Stores a finished match. Only players that exist in `players` get a row.
 * D1 has no transactions, so the match row goes first and the rest follow it.
 */
export async function saveMatch(db: Db, report: MatchReport): Promise<string> {
  const known = new Set(
    (await db.player.findMany({ where: { id: { in: report.players.map((p) => p.id) } }, select: { id: true } })).map(
      (p) => p.id,
    ),
  );
  const match = await db.match.create({
    data: {
      roomCode: report.code,
      playlist: report.games.map((g) => g.gameId),
      startedAt: new Date(report.startedAt),
      endedAt: new Date(report.endedAt),
      report: report as object,
    },
    select: { id: true },
  });
  const players = report.players
    .filter((p) => known.has(p.id))
    .map((p) => ({
      matchId: match.id,
      playerId: p.id,
      total: p.total,
      rank: p.rank,
      awards: report.awards.filter((a) => a.playerId === p.id).map((a) => a.id),
    }));
  if (players.length) await db.matchPlayer.createMany({ data: players });
  if (report.games.length) {
    await db.gameResult.createMany({
      data: report.games.map((g, idx) => ({
        matchId: match.id,
        idx,
        gameId: g.gameId,
        points: g.points,
        stats: g.stats as object,
      })),
    });
  }
  return match.id;
}

export async function getMatch(db: Db, id: string): Promise<StoredMatch | null> {
  const row = await db.match.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    roomCode: row.roomCode,
    startedAt: row.startedAt.getTime(),
    endedAt: row.endedAt.getTime(),
    report: row.report as unknown as MatchReport,
  };
}

export async function hallOfFame(db: Db, limit = 50): Promise<HallOfFame> {
  const [rows, recentMatches] = await Promise.all([
    db.matchPlayer.findMany({
      select: { playerId: true, total: true, rank: true, awards: true, player: { select: { nickname: true, avatar: true } } },
    }),
    db.match.findMany({
      orderBy: { endedAt: "desc" },
      take: 12,
      select: { id: true, roomCode: true, endedAt: true, report: true },
    }),
  ]);

  const byPlayer = new Map<string, HallOfFame["players"][number]>();
  for (const row of rows) {
    const entry = byPlayer.get(row.playerId) ?? {
      id: row.playerId,
      nickname: row.player.nickname,
      avatar: avatarSchema.parse(row.player.avatar),
      matches: 0,
      wins: 0,
      points: 0,
      awards: {},
    };
    entry.matches += 1;
    entry.points += row.total;
    if (row.rank === 1) entry.wins += 1;
    for (const award of row.awards as string[]) entry.awards[award] = (entry.awards[award] ?? 0) + 1;
    byPlayer.set(row.playerId, entry);
  }

  return {
    players: [...byPlayer.values()].sort((a, b) => b.wins - a.wins || b.points - a.points).slice(0, limit),
    recent: recentMatches.map((m) => {
      const report = m.report as unknown as MatchReport;
      const winner = report.players[0];
      return {
        id: m.id,
        roomCode: m.roomCode,
        endedAt: m.endedAt.getTime(),
        players: report.players.length,
        winner: winner ? { nickname: winner.name, avatar: winner.avatar } : null,
      };
    }),
  };
}
