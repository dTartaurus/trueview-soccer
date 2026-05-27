export type Position =
  | 'GK' | 'CB' | 'LCB' | 'RCB'
  | 'LB' | 'RB' | 'LWB' | 'RWB'
  | 'CDM' | 'CM' | 'LCM' | 'RCM'
  | 'CAM' | 'LM' | 'RM'
  | 'LW' | 'RW' | 'SS'
  | 'ST' | 'CF';

export type GameStatus = 'scheduled' | 'first-half' | 'half-time' | 'second-half' | 'completed';

export interface Player {
  id: string;
  name: string;
  number: number;
  positions: Position[];
  createdAt: string;
}

export interface ShiftPlayer {
  playerId: string;
  position: Position;
}

export interface GameShift {
  id: string;
  shiftNumber: 1 | 2 | 3 | 4 | 5 | 6;
  half: 1 | 2;
  startMinute: number;
  endMinute: number;
  status: 'pending' | 'active' | 'completed';
  players: ShiftPlayer[];
}

export interface GameEvent {
  id: string;
  type: 'goal' | 'yellow_card' | 'red_card';
  minute: number;
  playerId: string;
  assistPlayerIds?: string[];
  isOpponentGoal: boolean;
  opponentScorerNumber?: number;
  position?: Position;
}

export interface Game {
  id: string;
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  status: GameStatus;
  attendance: string[];
  score: { home: number; away: number };
  events: GameEvent[];
  shifts: GameShift[];
  timerElapsed: number;
  timerStartedAt: number | null;
  currentHalf: 1 | 2;
  formation: string;
  notes: string;
  createdAt: string;
  // Lineup planning
  presetLineup: ShiftPlayer[];
  h1GoalkeeperId: string;
  h2GoalkeeperId: string;
}

export interface Practice {
  id: string;
  date: string;
  attendance: string[];
  drills: string[];
  duration: number;
  notes: string;
  aiDrills?: string;
  createdAt: string;
}

export interface PlayerSurvey {
  id: string;
  playerId: string;
  gameId: string;
  submittedAt: string;
  overallRating: number;
  effortRating: number;
  teamworkRating: number;
  funRating: number;
  highlight: string;
  improvement: string;
}

export interface AppSettings {
  teamName: string;
  coachPin: string;
  seasonYear: number;
  setupComplete: boolean;
}

export interface PlayerSeasonStats {
  playerId: string;
  gamesAttended: number;
  practicesAttended: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  plusMinus: number;
  yellowCards: number;
  redCards: number;
}
