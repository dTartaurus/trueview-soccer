import { format, parseISO } from 'date-fns';
import type { Game, Player, GameShift, PlayerSeasonStats, ShiftPlayer, Position } from '@/types';

export const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatDate = (iso: string): string => {
  try { return format(parseISO(iso), 'EEE MMM d, yyyy'); }
  catch { return iso; }
};

export const formatShortDate = (iso: string): string => {
  try { return format(parseISO(iso), 'MMM d'); }
  catch { return iso; }
};

export const getGameMinute = (game: Game): number => {
  if (!game.timerStartedAt || !['first-half', 'second-half'].includes(game.status)) {
    return Math.floor(game.timerElapsed / 60);
  }
  const elapsed = game.timerElapsed + (Date.now() - game.timerStartedAt) / 1000;
  return Math.floor(elapsed / 60);
};

export const getShiftForMinute = (minute: number): number => {
  if (minute < 15) return 1;
  if (minute < 30) return 2;
  if (minute < 45) return 3;
  if (minute < 60) return 4;
  if (minute < 75) return 5;
  return 6;
};

export const getActiveShift = (shifts: GameShift[]): GameShift | null =>
  shifts.find(s => s.status === 'active') ?? null;

export const getOnFieldPlayers = (game: Game): string[] => {
  const active = getActiveShift(game.shifts);
  return active ? active.players.map(p => p.playerId) : [];
};

export const computeSeasonStats = (
  players: Player[],
  games: Game[],
  practiceCount: (playerId: string) => number
): PlayerSeasonStats[] => {
  return players.map(player => {
    const pid = player.id;
    let minutesPlayed = 0;
    let goals = 0;
    let assists = 0;
    let plusMinus = 0;
    let yellowCards = 0;
    let redCards = 0;
    let gamesAttended = 0;

    for (const game of games) {
      if (game.status !== 'completed') continue;
      if (!game.attendance.includes(pid)) continue;
      gamesAttended++;

      // Minutes from shifts
      for (const shift of game.shifts) {
        if (shift.status === 'completed' && shift.players.some(sp => sp.playerId === pid)) {
          minutesPlayed += shift.endMinute - shift.startMinute;
        }
      }

      // Events
      for (const ev of game.events) {
        if (ev.isOpponentGoal) {
          // Check if player was on field during opponent goal
          const shift = game.shifts.find(
            s => s.status === 'completed' &&
              ev.minute >= s.startMinute && ev.minute < s.endMinute &&
              s.players.some(sp => sp.playerId === pid)
          );
          if (shift) plusMinus--;
        } else {
          if (ev.playerId === pid && ev.type === 'goal') {
            goals++;
            plusMinus++;
          }
          if (ev.assistPlayerIds?.includes(pid)) assists++;
          if (ev.type === 'goal') {
            // Positive plus-minus for all players on field when team scores
            const shift = game.shifts.find(
              s => s.status === 'completed' &&
                ev.minute >= s.startMinute && ev.minute < s.endMinute &&
                s.players.some(sp => sp.playerId === pid)
            );
            if (shift && ev.playerId !== pid) plusMinus++;
          }
          if (ev.type === 'yellow_card' && ev.playerId === pid) yellowCards++;
          if (ev.type === 'red_card' && ev.playerId === pid) redCards++;
        }
      }
    }

    return {
      playerId: pid,
      gamesAttended,
      practicesAttended: practiceCount(pid),
      minutesPlayed,
      goals,
      assists,
      plusMinus,
      yellowCards,
      redCards
    };
  });
};

export const hashPin = async (pin: string): Promise<string> => {
  const encoded = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const FORMATIONS: Record<string, string[]> = {
  '4-3-3': ['GK', 'RB', 'RCB', 'LCB', 'LB', 'RCM', 'CM', 'LCM', 'RW', 'ST', 'LW'],
  '4-4-2': ['GK', 'RB', 'RCB', 'LCB', 'LB', 'RM', 'RCM', 'LCM', 'LM', 'ST', 'CF'],
  '4-2-3-1': ['GK', 'RB', 'RCB', 'LCB', 'LB', 'RCM', 'LCM', 'RW', 'CAM', 'LW', 'ST'],
  '3-5-2': ['GK', 'RCB', 'CB', 'LCB', 'RWB', 'RCM', 'CM', 'LCM', 'LWB', 'ST', 'CF'],
  '4-1-4-1': ['GK', 'RB', 'RCB', 'LCB', 'LB', 'CDM', 'RM', 'RCM', 'LCM', 'LM', 'ST'],
};

export const getFormationPositions = (formation: string): string[] =>
  FORMATIONS[formation] ?? FORMATIONS['4-3-3'];

// Returns minutes played per player based on completed + active shifts
// On-field (outfield) minutes per player. GK position time is NOT counted here:
// goalkeeping is tracked separately so half-vs-half outfield balance stays fair.
export const computePlayerMinutes = (game: Game, currentGameMinute: number): Map<string, number> => {
  const minutes = new Map<string, number>();
  for (const shift of game.shifts) {
    if (shift.status === 'completed') {
      for (const sp of shift.players) {
        if (sp.position === 'GK') continue;
        minutes.set(sp.playerId, (minutes.get(sp.playerId) ?? 0) + (shift.endMinute - shift.startMinute));
      }
    } else if (shift.status === 'active') {
      const partial = Math.max(0, currentGameMinute - shift.startMinute);
      for (const sp of shift.players) {
        if (sp.position === 'GK') continue;
        minutes.set(sp.playerId, (minutes.get(sp.playerId) ?? 0) + partial);
      }
    }
  }
  return minutes;
};

// Time spent at the GK position. Mirrors computePlayerMinutes but only counts
// shift entries where position === 'GK'. Used for the per-player "Time in
// Goal" stat shown in the game sheet, in-game stats, and player profiles.
export const computePlayerGoalieMinutes = (game: Game, currentGameMinute: number): Map<string, number> => {
  const minutes = new Map<string, number>();
  for (const shift of game.shifts) {
    if (shift.status === 'completed') {
      for (const sp of shift.players) {
        if (sp.position !== 'GK') continue;
        minutes.set(sp.playerId, (minutes.get(sp.playerId) ?? 0) + (shift.endMinute - shift.startMinute));
      }
    } else if (shift.status === 'active') {
      const partial = Math.max(0, currentGameMinute - shift.startMinute);
      for (const sp of shift.players) {
        if (sp.position !== 'GK') continue;
        minutes.set(sp.playerId, (minutes.get(sp.playerId) ?? 0) + partial);
      }
    }
  }
  return minutes;
};

// Outfield minutes split by half. Used for the rule that the off-half GK must
// play ≥30 outfield minutes in the half they are NOT in goal.
export const computeOutfieldMinutesByHalf = (
  game: Game,
  currentGameMinute: number
): Map<string, { h1: number; h2: number }> => {
  const result = new Map<string, { h1: number; h2: number }>();
  const add = (id: string, half: 1 | 2, mins: number) => {
    const cur = result.get(id) ?? { h1: 0, h2: 0 };
    if (half === 1) cur.h1 += mins;
    else cur.h2 += mins;
    result.set(id, cur);
  };
  for (const shift of game.shifts) {
    const half = shift.half;
    if (shift.status === 'completed') {
      for (const sp of shift.players) {
        if (sp.position === 'GK') continue;
        add(sp.playerId, half, shift.endMinute - shift.startMinute);
      }
    } else if (shift.status === 'active') {
      const partial = Math.max(0, currentGameMinute - shift.startMinute);
      for (const sp of shift.players) {
        if (sp.position === 'GK') continue;
        add(sp.playerId, half, partial);
      }
    }
  }
  return result;
};

// Suggests the 11 players for the next shift, prioritising least time played.
// GK is locked to the correct half. Off-half GK sits out.
export const suggestNextShift = (
  game: Game,
  allPlayers: Player[],
  nextShiftNum: number,
  currentGameMinute: number
): ShiftPlayer[] => {
  const isH2 = nextShiftNum > 3;
  const activeGkId = isH2 ? game.h2GoalkeeperId : game.h1GoalkeeperId;
  const offHalfGkId = isH2 ? game.h1GoalkeeperId : game.h2GoalkeeperId;
  if (!activeGkId) return [];

  const attending = allPlayers.filter(p => game.attendance.includes(p.id));
  const minutesMap = computePlayerMinutes(game, currentGameMinute);

  // Outfield candidates: not the active GK; off-half GK excluded unless same player
  const outfield = attending.filter(p => {
    if (p.id === activeGkId) return false;
    if (p.id === offHalfGkId && offHalfGkId !== activeGkId) return false;
    return true;
  });

  // Sort by minutes ascending (least time = highest priority to come on)
  const sorted = [...outfield].sort((a, b) =>
    (minutesMap.get(a.id) ?? 0) - (minutesMap.get(b.id) ?? 0)
  );
  const selected = sorted.slice(0, 10);

  const formationOutfieldPos = getFormationPositions(game.formation).filter(p => p !== 'GK');
  const prevShiftNum = nextShiftNum - 1;
  const prevPlayers = game.shifts.find(s => s.shiftNumber === prevShiftNum)?.players ?? [];

  const result: ShiftPlayer[] = [{ playerId: activeGkId, position: 'GK' as Position }];
  const usedPositions = new Set<string>();
  const assignedIds = new Set<string>();

  // Keep staying players in their same position first
  for (const prev of prevPlayers) {
    if (prev.position === 'GK') continue;
    if (selected.some(p => p.id === prev.playerId)) {
      result.push(prev);
      usedPositions.add(prev.position);
      assignedIds.add(prev.playerId);
    }
  }

  // Assign new players to remaining positions by preference
  const newPlayers = selected.filter(p => !assignedIds.has(p.id));
  const emptyPos = formationOutfieldPos.filter(p => !usedPositions.has(p));

  for (const player of newPlayers) {
    if (emptyPos.length === 0) break;
    const full = allPlayers.find(p => p.id === player.id);
    const preferred = full?.positions.find(pos => emptyPos.includes(pos)) as Position | undefined;
    const pos = preferred ?? (emptyPos[0] as Position);
    emptyPos.splice(emptyPos.indexOf(pos), 1);
    result.push({ playerId: player.id, position: pos });
  }

  return result;
};

export interface PositionStat {
  minutesPlayed: number;
  goals: number;
  assists: number;
  plusMinus: number;
}

// Per-position performance for every player across completed games.
// Returns: playerId → position → PositionStat
export const computePlayerPositionStats = (
  games: Game[]
): Map<string, Map<string, PositionStat>> => {
  const result = new Map<string, Map<string, PositionStat>>();

  for (const game of games) {
    if (game.status !== 'completed') continue;

    for (const shift of game.shifts) {
      if (shift.status !== 'completed') continue;
      const duration = shift.endMinute - shift.startMinute;

      for (const sp of shift.players) {
        if (!result.has(sp.playerId)) result.set(sp.playerId, new Map());
        const posMap = result.get(sp.playerId)!;
        if (!posMap.has(sp.position)) posMap.set(sp.position, { minutesPlayed: 0, goals: 0, assists: 0, plusMinus: 0 });
        const stat = posMap.get(sp.position)!;
        stat.minutesPlayed += duration;

        for (const ev of game.events) {
          if (ev.minute < shift.startMinute || ev.minute >= shift.endMinute) continue;
          if (ev.isOpponentGoal) {
            stat.plusMinus--;
          } else if (ev.type === 'goal') {
            if (ev.playerId === sp.playerId) { stat.goals++; stat.plusMinus++; }
            else { stat.plusMinus++; }
            if (ev.assistPlayerIds?.includes(sp.playerId)) stat.assists++;
          }
        }
      }
    }
  }
  return result;
};

// Build a shareable plain-text game sheet for any game with shifts/events.
// Per-player rows include total play time (including GK), positions played,
// goals, assists, goals against (opponent goals while on field), and +/-.
export const buildGameSheet = (game: Game, players: Player[]): string => {
  const attending = players
    .filter(p => game.attendance.includes(p.id))
    .sort((a, b) => a.number - b.number);

  const outfieldMinutes = new Map<string, number>();
  const goalieMinutes = new Map<string, number>();
  const positionsPlayed = new Map<string, Set<string>>();
  const liveMinute = Math.floor(game.timerElapsed / 60);

  for (const shift of game.shifts) {
    if (shift.status !== 'completed' && shift.status !== 'active') continue;
    const duration = shift.status === 'completed'
      ? shift.endMinute - shift.startMinute
      : Math.max(0, liveMinute - shift.startMinute);
    for (const sp of shift.players) {
      if (sp.position === 'GK') {
        goalieMinutes.set(sp.playerId, (goalieMinutes.get(sp.playerId) ?? 0) + duration);
      } else {
        outfieldMinutes.set(sp.playerId, (outfieldMinutes.get(sp.playerId) ?? 0) + duration);
      }
      if (!positionsPlayed.has(sp.playerId)) positionsPlayed.set(sp.playerId, new Set());
      positionsPlayed.get(sp.playerId)!.add(sp.position);
    }
  }

  const stats = new Map<string, { goals: number; assists: number; against: number; plusMinus: number }>();
  for (const p of attending) {
    stats.set(p.id, { goals: 0, assists: 0, against: 0, plusMinus: 0 });
  }

  for (const ev of game.events) {
    if (ev.type !== 'goal') continue;
    const shift = game.shifts.find(s =>
      (s.status === 'completed' || s.status === 'active') &&
      ev.minute >= s.startMinute &&
      (s.status === 'active' || ev.minute < s.endMinute)
    );
    const onField = new Set(shift?.players.map(sp => sp.playerId) ?? []);

    if (ev.isOpponentGoal) {
      for (const pid of onField) {
        const s = stats.get(pid);
        if (s) { s.against++; s.plusMinus--; }
      }
    } else {
      const scorer = stats.get(ev.playerId);
      if (scorer) scorer.goals++;
      for (const aId of ev.assistPlayerIds ?? []) {
        const a = stats.get(aId);
        if (a) a.assists++;
      }
      for (const pid of onField) {
        const s = stats.get(pid);
        if (s) s.plusMinus++;
      }
    }
  }

  const dateStr = (() => {
    try { return format(parseISO(game.date + 'T12:00:00'), 'EEE MMM d, yyyy'); }
    catch { return game.date; }
  })();
  const haStr = game.homeAway === 'home' ? 'Home' : 'Away';
  const scoreStr = `${game.score.home}-${game.score.away}`;
  const finalLine = game.status === 'completed'
    ? `Final: ${scoreStr}`
    : game.status === 'scheduled'
      ? 'Not played yet'
      : `${scoreStr} (in progress)`;

  const teamGoals = game.events.filter(e => e.type === 'goal' && !e.isOpponentGoal).length;
  const oppGoals = game.events.filter(e => e.type === 'goal' && e.isOpponentGoal).length;

  const lines: string[] = [];
  lines.push(`vs ${game.opponent} (${haStr})`);
  lines.push(`${dateStr} · ${finalLine}`);
  lines.push(`Formation: ${game.formation}`);
  lines.push('');
  lines.push(`PLAYERS (${attending.length})`);
  lines.push('');

  for (const p of attending) {
    const ofMins = outfieldMinutes.get(p.id) ?? 0;
    const gkMins = goalieMinutes.get(p.id) ?? 0;
    const positions = Array.from(positionsPlayed.get(p.id) ?? []).join(', ') || '—';
    const s = stats.get(p.id) ?? { goals: 0, assists: 0, against: 0, plusMinus: 0 };
    const pm = s.plusMinus >= 0 ? `+${s.plusMinus}` : `${s.plusMinus}`;
    const minutesLine = gkMins > 0
      ? `  ${ofMins} min on field · ${gkMins} min in goal · ${positions}`
      : `  ${ofMins} min · ${positions}`;
    lines.push(`#${p.number} ${p.name}`);
    lines.push(minutesLine);
    lines.push(`  G:${s.goals} · A:${s.assists} · GA:${s.against} · +/-:${pm}`);
    lines.push('');
  }

  lines.push(`Team: ${teamGoals}G scored · ${oppGoals}G allowed`);

  const opponentEvents = game.events
    .filter(e => e.type === 'goal' && e.isOpponentGoal)
    .sort((a, b) => a.minute - b.minute);
  if (opponentEvents.length > 0) {
    lines.push('');
    lines.push(`GOALS AGAINST (${game.opponent})`);
    for (const ev of opponentEvents) {
      const who = ev.opponentScorerNumber ? `#${ev.opponentScorerNumber}` : 'unknown';
      lines.push(`  ${ev.minute}' · ${who}`);
    }
  }

  return lines.join('\n').trimEnd();
};

export const POSITION_LABELS: Partial<Record<string, string>> = {
  GK: 'GK', CB: 'CB', LCB: 'LCB', RCB: 'RCB',
  LB: 'LB', RB: 'RB', LWB: 'LWB', RWB: 'RWB',
  CDM: 'CDM', CM: 'CM', LCM: 'LCM', RCM: 'RCM',
  CAM: 'CAM', LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW', SS: 'SS',
  ST: 'ST', CF: 'CF'
};
