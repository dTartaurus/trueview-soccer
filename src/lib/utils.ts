import { format, parseISO } from 'date-fns';
import type { Game, Player, GameShift, PlayerSeasonStats, GameEvent } from '@/types';

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

export const POSITION_LABELS: Partial<Record<string, string>> = {
  GK: 'GK', CB: 'CB', LCB: 'LCB', RCB: 'RCB',
  LB: 'LB', RB: 'RB', LWB: 'LWB', RWB: 'RWB',
  CDM: 'CDM', CM: 'CM', LCM: 'LCM', RCM: 'RCM',
  CAM: 'CAM', LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW', SS: 'SS',
  ST: 'ST', CF: 'CF'
};
