import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Plus, Minus, Flag, Trophy, Check, BarChart2, UserPlus, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useGameTimer } from '@/hooks/useGameTimer';
import { generateId, computePlayerMinutes, computePlayerPositionStats } from '@/lib/utils';
import type { GameEvent, ShiftPlayer, Position } from '@/types';

const POSITION_COLORS: Record<string, string> = {
  GK: 'bg-yellow-600', LB: 'bg-blue-700', RB: 'bg-blue-700',
  LCB: 'bg-blue-800', RCB: 'bg-blue-800', CB: 'bg-blue-800',
  LWB: 'bg-blue-600', RWB: 'bg-blue-600',
  CDM: 'bg-teal-700', CM: 'bg-teal-600', LCM: 'bg-teal-600',
  RCM: 'bg-teal-600', CAM: 'bg-teal-500', LM: 'bg-teal-600', RM: 'bg-teal-600',
  LW: 'bg-pitch-600', RW: 'bg-pitch-600', ST: 'bg-red-700', CF: 'bg-red-600', SS: 'bg-red-600',
};

const roundTo15 = (mins: number) => Math.round(mins / 15) * 15;

export const GameActive = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { games, players, isCoach, updateGame, settings } = useStore();

  const game = games.find(g => g.id === id);
  const timer = useGameTimer(game ?? null);

  // Goal modal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ scorerId: '', assistId: '', isOpponent: false });

  // Next shift recommendation
  const [nextShiftLineup, setNextShiftLineup] = useState<ShiftPlayer[] | null>(null);
  const [nextShiftConfirmed, setNextShiftConfirmed] = useState(false);
  const [aiLoadingShift, setAiLoadingShift] = useState(false);
  const [aiShiftReasoning, setAiShiftReasoning] = useState('');
  const [showShiftReasoning, setShowShiftReasoning] = useState(false);
  const [editingNextShift, setEditingNextShift] = useState(false);

  // Sub execute modal (shift change screen)
  const [showSubModal, setShowSubModal] = useState(false);

  // Stats + late arrival
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showLateArrivalModal, setShowLateArrivalModal] = useState(false);

  if (!game) return <div className="p-8 text-center text-gray-400">Game not found</div>;

  const activeShift = game.shifts.find(s => s.status === 'active') ?? null;
  const onFieldIds = new Set(activeShift?.players.map(p => p.playerId) ?? []);
  const activeGkId = game.currentHalf === 1 ? game.h1GoalkeeperId : game.h2GoalkeeperId;

  const attendingPlayers = players.filter(p => game.attendance.includes(p.id)).sort((a, b) => a.number - b.number);
  const benchPlayers = attendingPlayers.filter(p => !onFieldIds.has(p.id));
  const notAttending = players.filter(p => !game.attendance.includes(p.id)).sort((a, b) => a.number - b.number);

  // Players who were benched last shift (must play next shift)
  const prevShift = activeShift
    ? game.shifts.find(s => s.shiftNumber === activeShift.shiftNumber - 1 && s.status === 'completed')
    : null;
  const prevBenchedIds = useMemo(() => {
    if (!prevShift) return new Set<string>();
    return new Set(attendingPlayers.filter(p => !prevShift.players.some(sp => sp.playerId === p.id)).map(p => p.id));
  }, [prevShift?.id, attendingPlayers.length]);

  const nextShiftNum = activeShift
    ? Math.min(activeShift.shiftNumber + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6
    : 2 as 2;
  const hasNextShift = !!activeShift && activeShift.shiftNumber < 6 && game.status !== 'completed';

  const minutesMap = useMemo(
    () => computePlayerMinutes(game, timer.gameMinute),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.shifts, timer.gameMinute]
  );

  const completedGames = games.filter(g => g.status === 'completed' && g.id !== game.id);
  const positionStatsMap = useMemo(
    () => computePlayerPositionStats(completedGames),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completedGames.length]
  );

  // Diff between current and next shift
  const nextOnFieldIds = new Set((nextShiftLineup ?? []).map(p => p.playerId));
  const comingOff = activeShift?.players.filter(p => !nextOnFieldIds.has(p.playerId)) ?? [];
  const comingOn = (nextShiftLineup ?? []).filter(p => !onFieldIds.has(p.playerId));

  // Stats per player for this game
  const gameGoals = useMemo(() => {
    const goals = new Map<string, number>();
    const assists = new Map<string, number>();
    for (const ev of game.events) {
      if (ev.type === 'goal' && !ev.isOpponentGoal) {
        if (ev.playerId) goals.set(ev.playerId, (goals.get(ev.playerId) ?? 0) + 1);
        if (ev.assistPlayerId) assists.set(ev.assistPlayerId, (assists.get(ev.assistPlayerId) ?? 0) + 1);
      }
    }
    return { goals, assists };
  }, [game.events]);

  const positionsPlayedMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const shift of game.shifts) {
      if (shift.status === 'completed' || shift.status === 'active') {
        for (const sp of shift.players) {
          if (!map.has(sp.playerId)) map.set(sp.playerId, new Set());
          map.get(sp.playerId)!.add(sp.position);
        }
      }
    }
    return map;
  }, [game.shifts]);

  // ── Timer ────────────────────────────────────────────────────────────────────
  const pauseTimer = async () => {
    if (!timer.isRunning) return;
    const elapsed = game.timerElapsed + (game.timerStartedAt ? (Date.now() - game.timerStartedAt) / 1000 : 0);
    await updateGame(game.id, { timerElapsed: elapsed, timerStartedAt: null });
  };
  const resumeTimer = async () => {
    if (timer.isRunning) return;
    await updateGame(game.id, { timerStartedAt: Date.now() });
  };
  const triggerHalfTime = async () => {
    await pauseTimer();
    const shifts = game.shifts.map(s =>
      s.id === activeShift?.id ? { ...s, status: 'completed' as const } : s
    );
    await updateGame(game.id, { status: 'half-time', timerStartedAt: null, timerElapsed: 45 * 60, shifts });
    setNextShiftLineup(null);
    setNextShiftConfirmed(false);
  };
  const startSecondHalf = async () => {
    if (!nextShiftLineup) return;
    const shifts = game.shifts.map(s =>
      s.shiftNumber === 4 ? { ...s, status: 'active' as const, players: nextShiftLineup } : s
    );
    await updateGame(game.id, { status: 'second-half', currentHalf: 2, timerStartedAt: Date.now(), timerElapsed: 45 * 60, shifts });
    setNextShiftLineup(null);
    setNextShiftConfirmed(false);
    setAiShiftReasoning('');
  };
  const endGame = async () => {
    if (!confirm('End game and mark as completed?')) return;
    await pauseTimer();
    const shifts = game.shifts.map(s =>
      s.id === activeShift?.id ? { ...s, status: 'completed' as const } : s
    );
    await updateGame(game.id, { status: 'completed', shifts });
    navigate('/games');
  };

  // ── Score ────────────────────────────────────────────────────────────────────
  const adjustScore = async (team: 'home' | 'away', delta: number) => {
    await updateGame(game.id, { score: { ...game.score, [team]: Math.max(0, game.score[team] + delta) } });
  };

  // ── Goal ─────────────────────────────────────────────────────────────────────
  const logGoal = async () => {
    if (!goalForm.scorerId && !goalForm.isOpponent) return;
    const event: GameEvent = {
      id: generateId(), type: 'goal', minute: timer.gameMinute,
      playerId: goalForm.scorerId, assistPlayerId: goalForm.assistId || undefined,
      isOpponentGoal: goalForm.isOpponent,
    };
    const score = goalForm.isOpponent
      ? { ...game.score, away: game.score.away + 1 }
      : { ...game.score, home: game.score.home + 1 };
    await updateGame(game.id, { events: [...game.events, event], score });
    setGoalForm({ scorerId: '', assistId: '', isOpponent: false });
    setShowGoalModal(false);
  };

  // ── AI Shift Recommendation ──────────────────────────────────────────────────
  const getShiftRecommendation = async () => {
    if (!activeShift) return;
    setAiLoadingShift(true);
    setNextShiftLineup(null);
    setNextShiftConfirmed(false);
    setAiShiftReasoning('');
    try {
      const currentShiftPlayers = activeShift.players.map(sp => {
        const p = players.find(pl => pl.id === sp.playerId);
        return { playerId: sp.playerId, name: p?.name ?? '', number: p?.number ?? 0, position: sp.position, minutesThisGame: roundTo15(minutesMap.get(sp.playerId) ?? 0) };
      });
      const benchList = benchPlayers.map(p => ({
        playerId: p.id, name: p.name, number: p.number,
        minutesThisGame: roundTo15(minutesMap.get(p.id) ?? 0),
        mustPlayNext: prevBenchedIds.has(p.id),
      }));
      const allPlayersData = attendingPlayers.map(p => {
        const posStats = positionStatsMap.get(p.id);
        return {
          id: p.id, name: p.name, number: p.number,
          preferredPositions: p.positions,
          minutesThisGame: roundTo15(minutesMap.get(p.id) ?? 0),
          positionStats: posStats ? Array.from(posStats.entries()).map(([pos, stat]) => ({
            position: pos,
            minutesPlayed: stat.minutesPlayed,
            plusMinus: stat.plusMinus,
            plusMinusPer90: stat.minutesPlayed > 0 ? +((stat.plusMinus / stat.minutesPlayed) * 90).toFixed(2) : 0,
            goals: stat.goals,
            assists: stat.assists,
          })) : [],
        };
      });

      const slotsCount = Math.min(attendingPlayers.length, 11);
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'shift_recommendation',
          data: {
            nextShiftNumber: nextShiftNum,
            formation: game.formation,
            teamName: settings?.teamName ?? 'Our Team',
            opponent: game.opponent,
            gameMinute: timer.gameMinute,
            currentShiftPlayers,
            benchPlayers: benchList,
            allPlayers: allPlayersData,
            activeGkId,
            isSecondHalf: game.currentHalf === 2,
            slotsCount,
          },
        }),
      });
      const json = await res.json();
      if (Array.isArray(json.startingLineup) && json.startingLineup.length >= 7) {
        setNextShiftLineup(json.startingLineup.map((a: { playerId: string; position: string }) => ({
          playerId: a.playerId, position: a.position as Position,
        })));
        setAiShiftReasoning(json.reasoning ?? '');
        setShowShiftReasoning(true);
      } else {
        alert(json.error ?? 'Could not generate recommendation. Try again.');
      }
    } catch {
      alert('Could not connect to AI.');
    } finally {
      setAiLoadingShift(false);
    }
  };

  // ── Execute Shift ─────────────────────────────────────────────────────────────
  const executeShift = async () => {
    if (!nextShiftLineup || !activeShift) return;
    const nextShift = game.shifts.find(s => s.shiftNumber === nextShiftNum);
    if (!nextShift) return;
    const shifts = game.shifts.map(s => {
      if (s.id === activeShift.id) return { ...s, status: 'completed' as const };
      if (s.id === nextShift.id) return { ...s, status: 'active' as const, players: nextShiftLineup };
      return s;
    });
    await updateGame(game.id, { shifts });
    setShowSubModal(false);
    setNextShiftLineup(null);
    setNextShiftConfirmed(false);
    setAiShiftReasoning('');
    setEditingNextShift(false);
  };

  // ── Swap player in next shift (edit mode) ─────────────────────────────────────
  const swapNextShiftPlayer = (outId: string, inId: string) => {
    if (!nextShiftLineup) return;
    const updated = nextShiftLineup.map(sp => sp.playerId === outId ? { ...sp, playerId: inId } : sp);
    setNextShiftLineup(updated);
  };

  // ── Late arrival ──────────────────────────────────────────────────────────────
  const addLateArrival = async (playerId: string) => {
    await updateGame(game.id, { attendance: [...game.attendance, playerId] });
    setShowLateArrivalModal(false);
  };

  const isLiveGame = ['first-half', 'second-half'].includes(game.status);
  const maxMin = attendingPlayers.length > 0 ? Math.max(1, ...attendingPlayers.map(p => minutesMap.get(p.id) ?? 0)) : 1;

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-gray-900 px-4 pt-10 pb-1 flex items-center justify-between shrink-0">
        <button onClick={() => navigate('/games')} className="text-gray-400 text-sm">← Games</button>
        <p className="text-xs text-gray-400">vs {game.opponent} · {game.formation}</p>
        <div className="text-xs text-gray-400">{game.homeAway === 'home' ? 'H' : 'A'}</div>
      </div>

      {/* ── Score + Timer ── */}
      <div className="bg-gray-900 px-4 pb-2 shrink-0">
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            {isCoach && <button onClick={() => adjustScore('home', -1)} className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center"><Minus size={12} /></button>}
            <div className="text-5xl font-bold w-12 text-center">{game.score.home}</div>
            {isCoach && <button onClick={() => adjustScore('home', 1)} className="w-7 h-7 bg-pitch-700 rounded-full flex items-center justify-center"><Plus size={12} /></button>}
          </div>
          <div className="text-center">
            <div className="text-3xl font-mono font-bold">{timer.halfDisplay}</div>
            <div className="text-xs text-gray-400">H{game.currentHalf} · Shift {Math.min(timer.currentShiftNum, 6)}/6</div>
            {isCoach && (
              <button onClick={timer.isRunning ? pauseTimer : resumeTimer} className="mt-1 p-1.5 bg-gray-700 rounded-full mx-auto block">
                {timer.isRunning ? <Pause size={12} /> : <Play size={12} />}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isCoach && <button onClick={() => adjustScore('away', 1)} className="w-7 h-7 bg-red-700 rounded-full flex items-center justify-center"><Plus size={12} /></button>}
            <div className="text-5xl font-bold w-12 text-center">{game.score.away}</div>
            {isCoach && <button onClick={() => adjustScore('away', -1)} className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center"><Minus size={12} /></button>}
          </div>
        </div>
      </div>

      {/* ── Half-time banner ── */}
      {game.status === 'half-time' && (
        <div className="mx-3 mb-1 bg-blue-700 rounded-xl p-3 flex items-center gap-2 shrink-0">
          <span className="flex-1 font-bold text-sm">HALF TIME</span>
          {isCoach && nextShiftConfirmed && (
            <button onClick={startSecondHalf} className="bg-white text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg">
              Start 2nd Half →
            </button>
          )}
          {isCoach && !nextShiftConfirmed && (
            <span className="text-xs text-blue-200">Confirm Shift 4 below first</span>
          )}
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto space-y-3 px-3 py-2 pb-4">

        {/* ── ON FIELD ── */}
        {activeShift ? (
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700">
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                On Field · Shift {activeShift.shiftNumber} · {(activeShift.shiftNumber - 1) * 15}–{activeShift.shiftNumber * 15} min
              </p>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {activeShift.players.map(sp => {
                const p = players.find(pl => pl.id === sp.playerId);
                const mins = minutesMap.get(sp.playerId) ?? 0;
                const color = POSITION_COLORS[sp.position] ?? 'bg-gray-600';
                return (
                  <div key={sp.playerId} className="flex items-center gap-2">
                    <span className={`${color} text-white text-xs font-bold px-1.5 py-0.5 rounded w-10 text-center shrink-0`}>{sp.position}</span>
                    <span className="text-xs text-gray-400 w-5 shrink-0">#{p?.number}</span>
                    <span className="text-sm text-white flex-1">{p?.name?.split(' ')[0]}</span>
                    <span className="text-xs text-gray-400">{mins}m</span>
                  </div>
                );
              })}
            </div>
            {benchPlayers.length > 0 && (
              <div className="px-3 py-2 border-t border-gray-700">
                <p className="text-xs text-gray-500 mb-1.5">BENCH</p>
                <div className="flex flex-wrap gap-1.5">
                  {benchPlayers.map(p => {
                    const mustPlay = prevBenchedIds.has(p.id);
                    const mins = minutesMap.get(p.id) ?? 0;
                    return (
                      <span key={p.id}
                        className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${mustPlay ? 'bg-amber-700 text-white' : 'bg-gray-700 text-gray-300'}`}>
                        #{p.number} {p.name.split(' ')[0]} · {mins}m
                        {mustPlay && <span title="Must play next shift">↑</span>}
                      </span>
                    );
                  })}
                </div>
                {Array.from(prevBenchedIds).some(pid => !onFieldIds.has(pid)) && (
                  <p className="text-xs text-amber-400 mt-1">↑ = must play next shift (consecutive bench rule)</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl p-4 text-center text-gray-500 text-sm">
            {game.status === 'half-time' ? 'Half time' : 'No active shift'}
          </div>
        )}

        {/* ── NEXT SHIFT RECOMMENDATION ── */}
        {isCoach && (isLiveGame || game.status === 'half-time') && (hasNextShift || game.status === 'half-time') && (
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-700 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                {game.status === 'half-time'
                  ? `Shift 4 · 45–60 min (2nd Half)`
                  : `Next · Shift ${nextShiftNum} · ${(nextShiftNum - 1) * 15}–${nextShiftNum * 15} min`}
              </p>
              {nextShiftConfirmed && !editingNextShift && (
                <span className="text-xs text-pitch-400 flex items-center gap-1"><Check size={11} /> Confirmed</span>
              )}
            </div>

            {/* Not yet fetched */}
            {!nextShiftLineup && !aiLoadingShift && (
              <div className="px-3 py-3">
                <button onClick={getShiftRecommendation}
                  className="w-full bg-amber-600 rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-2 active:scale-95">
                  <Zap size={15} /> Get AI Recommendation
                </button>
              </div>
            )}

            {/* Loading */}
            {aiLoadingShift && (
              <div className="px-3 py-5 flex flex-col items-center gap-2 text-gray-400">
                <span className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
                <span className="text-xs">Optimising for equal time + best +/−…</span>
              </div>
            )}

            {/* Recommendation ready */}
            {nextShiftLineup && !editingNextShift && (
              <div className="px-3 py-2 space-y-2">
                {/* AI reasoning */}
                {aiShiftReasoning && (
                  <div>
                    <button onClick={() => setShowShiftReasoning(v => !v)}
                      className="flex items-center gap-1 text-xs text-amber-500">
                      <Zap size={11} />
                      {showShiftReasoning ? 'Hide' : 'Show'} reasoning
                      {showShiftReasoning ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    {showShiftReasoning && (
                      <div className="mt-1.5 bg-gray-700/50 rounded-lg p-2.5 text-xs text-gray-300 leading-relaxed">
                        {aiShiftReasoning}
                      </div>
                    )}
                  </div>
                )}

                {/* Changes diff */}
                {comingOff.length > 0 ? (
                  <div className="space-y-1">
                    {comingOff.map(off => {
                      const inSlot = (nextShiftLineup ?? []).find(sp =>
                        sp.position === off.position && !onFieldIds.has(sp.playerId)
                      ) ?? comingOn[0];
                      const offPlayer = players.find(p => p.id === off.playerId);
                      const inPlayer = players.find(p => p.id === inSlot?.playerId);
                      return (
                        <div key={off.playerId} className="flex items-center gap-2 text-xs">
                          <span className={`${POSITION_COLORS[off.position] ?? 'bg-gray-600'} text-white px-1.5 py-0.5 rounded text-xs font-bold w-10 text-center shrink-0`}>{off.position}</span>
                          <span className="text-red-400 font-medium">OUT</span>
                          <span className="text-gray-300">#{offPlayer?.number} {offPlayer?.name?.split(' ')[0]}</span>
                          <span className="text-gray-600">→</span>
                          <span className="text-pitch-400 font-medium">IN</span>
                          <span className="text-gray-300">#{inPlayer?.number} {inPlayer?.name?.split(' ')[0]}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No changes — same lineup continues</p>
                )}

                {/* Confirm / Edit buttons */}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setEditingNextShift(true); setNextShiftConfirmed(false); }}
                    className="flex-1 border border-gray-600 rounded-lg py-2 text-xs font-medium text-gray-300">
                    Edit
                  </button>
                  {!nextShiftConfirmed ? (
                    <button onClick={() => setNextShiftConfirmed(true)}
                      className="flex-1 bg-pitch-700 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1">
                      <Check size={12} /> Confirm
                    </button>
                  ) : (
                    <button onClick={getShiftRecommendation} disabled={aiLoadingShift}
                      className="flex-1 border border-amber-700 rounded-lg py-2 text-xs font-medium text-amber-400">
                      Refresh AI
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Edit mode */}
            {nextShiftLineup && editingNextShift && (
              <div className="px-3 py-2 space-y-2">
                <p className="text-xs text-gray-500">Adjust the lineup for next shift</p>
                <div className="space-y-1.5">
                  {nextShiftLineup.map(sp => {
                    const p = players.find(pl => pl.id === sp.playerId);
                    const isGk = sp.position === 'GK';
                    const color = POSITION_COLORS[sp.position] ?? 'bg-gray-600';
                    return (
                      <div key={sp.playerId} className="flex items-center gap-2">
                        <span className={`${color} text-white text-xs font-bold px-1.5 py-0.5 rounded w-10 text-center shrink-0`}>{sp.position}</span>
                        <span className="text-xs text-gray-300 flex-1">#{p?.number} {p?.name?.split(' ')[0]}</span>
                        {isGk ? (
                          <span className="text-xs text-yellow-500">🔒 GK</span>
                        ) : (
                          <select
                            className="bg-gray-700 text-white text-xs rounded px-1 py-0.5 border border-gray-600 max-w-[120px]"
                            value={sp.playerId}
                            onChange={e => swapNextShiftPlayer(sp.playerId, e.target.value)}
                          >
                            <option value={sp.playerId}>#{p?.number} {p?.name?.split(' ')[0]}</option>
                            {attendingPlayers
                              .filter(bp => !nextOnFieldIds.has(bp.id) || bp.id === sp.playerId)
                              .map(bp => (
                                <option key={bp.id} value={bp.id}>
                                  #{bp.number} {bp.name.split(' ')[0]} ({roundTo15(minutesMap.get(bp.id) ?? 0)}m)
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditingNextShift(false)}
                    className="flex-1 border border-gray-600 rounded-lg py-2 text-xs font-medium text-gray-300">
                    Cancel
                  </button>
                  <button onClick={() => { setEditingNextShift(false); setNextShiftConfirmed(true); }}
                    className="flex-1 bg-pitch-700 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1">
                    <Check size={12} /> Save & Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Playing Time (collapsible) ── */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center px-3 py-2.5">
            <button className="flex-1 flex items-center gap-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide"
              onClick={() => {}}>
              Playing Time
            </button>
            {isCoach && notAttending.length > 0 && (
              <button onClick={() => setShowLateArrivalModal(true)}
                className="flex items-center gap-1 text-xs text-pitch-400 border border-pitch-700 px-2 py-1 rounded-lg">
                <UserPlus size={12} /> Late
              </button>
            )}
          </div>
          <div className="px-3 pb-3 space-y-1.5">
            {[...attendingPlayers]
              .sort((a, b) => (minutesMap.get(b.id) ?? 0) - (minutesMap.get(a.id) ?? 0))
              .map(p => {
                const mins = minutesMap.get(p.id) ?? 0;
                const pct = maxMin > 0 ? (mins / maxMin) * 100 : 0;
                const isOnField = onFieldIds.has(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isOnField ? 'bg-pitch-400' : 'bg-gray-600'}`} />
                    <span className="text-xs text-gray-400 w-5 text-right shrink-0">{p.number}</span>
                    <span className="text-xs text-gray-200 w-20 truncate shrink-0">{p.name.split(' ')[0]}</span>
                    <div className="flex-1 h-1.5 bg-gray-700 rounded-full">
                      <div className="h-full bg-pitch-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right shrink-0">{mins}m</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* ── Coach Action Bar ── */}
      {isCoach && (
        <div className="bg-gray-900 border-t border-gray-700 px-3 py-3 pb-8 shrink-0">
          <div className="flex gap-2">
            <button onClick={() => setShowGoalModal(true)}
              className="flex-1 bg-amber-600 rounded-xl py-3 flex flex-col items-center gap-0.5 active:scale-95">
              <Trophy size={18} />
              <span className="text-xs font-medium">Goal</span>
            </button>
            <button
              onClick={() => setShowSubModal(true)}
              disabled={!nextShiftConfirmed}
              className={`flex-1 rounded-xl py-3 flex flex-col items-center gap-0.5 active:scale-95 transition-colors ${nextShiftConfirmed ? 'bg-blue-700' : 'bg-gray-700 opacity-50'}`}>
              <span className="text-base font-bold">⇄</span>
              <span className="text-xs font-medium">Sub</span>
            </button>
            <button onClick={() => setShowStatsModal(true)}
              className="flex-1 bg-purple-700 rounded-xl py-3 flex flex-col items-center gap-0.5 active:scale-95">
              <BarChart2 size={18} />
              <span className="text-xs font-medium">Stats</span>
            </button>
            {game.status === 'first-half' && (
              <button onClick={triggerHalfTime}
                className="flex-1 bg-gray-600 rounded-xl py-3 flex flex-col items-center gap-0.5 active:scale-95">
                <Flag size={18} />
                <span className="text-xs font-medium">Half</span>
              </button>
            )}
            <button onClick={endGame}
              className="flex-1 bg-red-800 rounded-xl py-3 flex flex-col items-center gap-0.5 active:scale-95">
              <Flag size={18} />
              <span className="text-xs font-medium">End</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Goal Modal ── */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowGoalModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Log Goal</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setGoalForm(f => ({ ...f, isOpponent: false }))}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm ${!goalForm.isOpponent ? 'bg-pitch-700' : 'bg-gray-700'}`}>Our Goal</button>
                <button onClick={() => setGoalForm(f => ({ ...f, isOpponent: true, scorerId: '' }))}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm ${goalForm.isOpponent ? 'bg-red-700' : 'bg-gray-700'}`}>Their Goal</button>
              </div>
              {!goalForm.isOpponent && (
                <>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Scorer</label>
                    <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                      {attendingPlayers.map(p => (
                        <button key={p.id} onClick={() => setGoalForm(f => ({ ...f, scorerId: p.id }))}
                          className={`text-sm py-1.5 px-2 rounded-lg ${goalForm.scorerId === p.id ? 'bg-amber-600' : 'bg-gray-700'}`}>
                          #{p.number} {p.name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Assist (optional)</label>
                    <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                      {attendingPlayers.filter(p => p.id !== goalForm.scorerId).map(p => (
                        <button key={p.id} onClick={() => setGoalForm(f => ({ ...f, assistId: f.assistId === p.id ? '' : p.id }))}
                          className={`text-sm py-1.5 px-2 rounded-lg ${goalForm.assistId === p.id ? 'bg-blue-700' : 'bg-gray-700'}`}>
                          #{p.number} {p.name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <button onClick={logGoal} disabled={!goalForm.isOpponent && !goalForm.scorerId}
                className="w-full bg-amber-600 py-3 rounded-xl font-bold disabled:opacity-50">
                {goalForm.isOpponent ? 'Log Opponent Goal' : 'Log Goal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub Execute Modal ── */}
      {showSubModal && nextShiftLineup && activeShift && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setShowSubModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-700 px-5 py-4">
              <h3 className="text-lg font-bold">Shift {activeShift.shiftNumber} → Shift {nextShiftNum}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {(nextShiftNum - 1) * 15}–{nextShiftNum * 15} min
              </p>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {comingOff.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Changes</p>
                  {comingOff.map(off => {
                    const inSlot = nextShiftLineup.find(sp => sp.position === off.position && !onFieldIds.has(sp.playerId))
                      ?? comingOn[0];
                    const offPlayer = players.find(p => p.id === off.playerId);
                    const inPlayer = players.find(p => p.id === inSlot?.playerId);
                    return (
                      <div key={off.playerId} className="flex items-center gap-3 bg-gray-700/50 rounded-xl p-3">
                        <span className={`${POSITION_COLORS[off.position] ?? 'bg-gray-600'} text-white text-xs font-bold px-2 py-1 rounded w-12 text-center shrink-0`}>{off.position}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-red-400 font-semibold">OUT</span>
                            <span className="text-white">#{offPlayer?.number} {offPlayer?.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm mt-0.5">
                            <span className="text-pitch-400 font-semibold">IN  </span>
                            <span className="text-white">#{inPlayer?.number} {inPlayer?.name}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-2">Same lineup — no player changes</p>
              )}
              {/* Staying players */}
              {nextShiftLineup.filter(sp => onFieldIds.has(sp.playerId)).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Staying On</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nextShiftLineup.filter(sp => onFieldIds.has(sp.playerId)).map(sp => {
                      const p = players.find(pl => pl.id === sp.playerId);
                      return (
                        <span key={sp.playerId} className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded-full">
                          #{p?.number} {p?.name?.split(' ')[0]} ({sp.position})
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 pb-8 pt-3 border-t border-gray-700">
              <button onClick={executeShift}
                className="w-full bg-pitch-700 rounded-2xl py-4 font-bold text-lg flex items-center justify-center gap-3 active:scale-95">
                <Check size={22} /> Shift Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Modal ── */}
      {showStatsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowStatsModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-800 px-5 pt-5 pb-3 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">In-Game Stats</h3>
                <p className="text-xs text-gray-500 mt-0.5">{timer.gameMinute}' played</p>
              </div>
              <button onClick={() => setShowStatsModal(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="px-4 py-3 space-y-2">
              {[...attendingPlayers]
                .sort((a, b) => (minutesMap.get(b.id) ?? 0) - (minutesMap.get(a.id) ?? 0))
                .map(p => {
                  const mins = minutesMap.get(p.id) ?? 0;
                  const goals = gameGoals.goals.get(p.id) ?? 0;
                  const assists = gameGoals.assists.get(p.id) ?? 0;
                  const positions = positionsPlayedMap.get(p.id);
                  const isOnField = onFieldIds.has(p.id);
                  return (
                    <div key={p.id} className="bg-gray-700/50 rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isOnField ? 'bg-pitch-400' : 'bg-gray-500'}`} />
                        <span className="text-xs text-gray-400 shrink-0">#{p.number}</span>
                        <span className="text-sm font-semibold flex-1">{p.name.split(' ')[0]}</span>
                        <span className="text-sm font-mono text-gray-300 w-10 text-right">{mins}m</span>
                        <span className={`text-sm font-bold w-8 text-center ${goals > 0 ? 'text-amber-400' : 'text-gray-600'}`}>{goals > 0 ? goals : '—'}</span>
                        <span className={`text-sm font-bold w-8 text-center ${assists > 0 ? 'text-blue-400' : 'text-gray-600'}`}>{assists > 0 ? assists : '—'}</span>
                      </div>
                      {positions && positions.size > 0 && (
                        <p className="text-xs text-gray-500 mt-1 ml-5">{Array.from(positions).join(', ')}</p>
                      )}
                    </div>
                  );
                })}
              <div className="flex gap-4 pt-2 text-xs text-gray-500 px-1">
                <span className="text-amber-400 font-bold">col 5</span><span>= Goals</span>
                <span className="text-blue-400 font-bold">col 6</span><span>= Assists</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Late Arrival Modal ── */}
      {showLateArrivalModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowLateArrivalModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2"><UserPlus size={20} /> Add Late Arrival</h3>
            <p className="text-xs text-gray-500 mb-4">Player will be added to attendance and included in upcoming shifts.</p>
            <div className="grid grid-cols-2 gap-2">
              {notAttending.map(p => (
                <button key={p.id} onClick={() => addLateArrival(p.id)}
                  className="flex items-center gap-2 bg-gray-700 rounded-xl p-3 text-left active:scale-95">
                  <div className="w-8 h-8 bg-pitch-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0">{p.number}</div>
                  <div>
                    <p className="text-sm font-medium">{p.name.split(' ')[0]}</p>
                    <p className="text-xs text-gray-400">{p.positions[0] ?? 'Any'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
