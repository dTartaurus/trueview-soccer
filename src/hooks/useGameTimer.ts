import { useState, useEffect } from 'react';
import type { Game } from '@/types';

export interface TimerState {
  totalSeconds: number;
  gameMinute: number;
  halfSeconds: number;
  halfMinutes: number;
  halfDisplay: string;
  currentShiftNum: number;
  secondsUntilNextShift: number;
  isRunning: boolean;
}

export const useGameTimer = (game: Game | null): TimerState => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const isRunning =
      game?.status === 'first-half' || game?.status === 'second-half';
    if (!isRunning) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [game?.status, game?.timerStartedAt]);

  if (!game) {
    return {
      totalSeconds: 0,
      gameMinute: 0,
      halfSeconds: 0,
      halfMinutes: 0,
      halfDisplay: '0:00',
      currentShiftNum: 1,
      secondsUntilNextShift: 15 * 60,
      isRunning: false
    };
  }

  const isRunning = game.status === 'first-half' || game.status === 'second-half';

  let totalSeconds = game.timerElapsed;
  if (isRunning && game.timerStartedAt) {
    totalSeconds += (Date.now() - game.timerStartedAt) / 1000;
  }
  totalSeconds = Math.floor(totalSeconds);

  // Half-relative seconds
  const halfOffset = game.currentHalf === 2 ? 45 * 60 : 0;
  const halfSeconds = Math.max(0, totalSeconds - halfOffset);
  const halfMinutes = Math.floor(halfSeconds / 60);
  const halfSecRem = halfSeconds % 60;
  const halfDisplay = `${halfMinutes}:${halfSecRem.toString().padStart(2, '0')}`;

  // Game minute for display (1-90)
  const gameMinute = Math.floor(totalSeconds / 60) + 1;

  // Shift: 3 per half, 15 min each
  const shiftInHalf = Math.floor(halfSeconds / (15 * 60)) + 1;
  const currentShiftNum = game.currentHalf === 1
    ? Math.min(shiftInHalf, 3)
    : Math.min(shiftInHalf + 3, 6);

  // Seconds until next shift boundary
  const nextBoundary = Math.ceil((halfSeconds + 1) / (15 * 60)) * (15 * 60);
  const secondsUntilNextShift = Math.max(0, nextBoundary - halfSeconds);

  return {
    totalSeconds,
    gameMinute,
    halfSeconds,
    halfMinutes,
    halfDisplay,
    currentShiftNum,
    secondsUntilNextShift,
    isRunning
  };
};
