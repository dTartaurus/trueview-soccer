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
          if (ev.assistPlayerId === pid) assists++;
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
export const computePlayerMinutes = (game: Game, currentGameMinute: number): Map<string, number> => {
  const minutes = new Map<string, number>();
  for (const shift of game.shifts) {
    if (shift.status === 'completed') {
      for (const sp of shift.players) {
        minutes.set(sp.playerId, (minutes.get(sp.playerId) ?? 0) + (shift.endMinute - shift.startMinute));
      }
    } else if (shift.status === 'active') {
      const partial = Math.max(0, currentGameMinute - shift.startMinute);
      for (const sp of shift.players) {
        minutes.set(sp.playerId, (minutes.get(sp.playerId) ?? 0) + partial);
      }
    }
  }
  return minutes;
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
  const prevShiftNum = (nextShiftNum - 1) as 1 | 2 | 3 | 4 | 5 | 6;
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

export const POSITION_LABELS: Partial<Record<string, string>> = {
  GK: 'GK', CB: 'CB', LCB: 'LCB', RCB: 'RCB',
  LB: 'LB', RB: 'RB', LWB: 'LWB', RWB: 'RWB',
  CDM: 'CDM', CM: 'CM', LCM: 'LCM', RCM: 'RCM',
  CAM: 'CAM', LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW', SS: 'SS',
  ST: 'ST', CF: 'CF'
};
