import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Plus, Minus, Flag, Trophy, Clock, ChevronDown, ChevronUp, Check, BarChart2, UserPlus } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useGameTimer } from '@/hooks/useGameTimer';
import { FormationField } from '@/components/FormationField';
import { generateId, computePlayerMinutes, suggestNextShift, getFormationPositions } from '@/lib/utils';
import type { GameEvent, ShiftPlayer, Position } from '@/types';

export const GameActive = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { games, players, isCoach, updateGame } = useStore();

  const game = games.find(g => g.id === id);
  const timer = useGameTimer(game ?? null);

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ scorerId: '', assistId: '', isOpponent: false });

  const [showSubModal, setShowSubModal] = useState(false);
  const [subOutId, setSubOutId] = useState('');
  const [subInId, setSubInId] = useState('');

  const [showTimePanel, setShowTimePanel] = useState(false);
  const [editingNextShift, setEditingNextShift] = useState(false);
  const [nextShiftOverride, setNextShiftOverride] = useState<ShiftPlayer[] | null>(null);

  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showLateArrivalModal, setShowLateArrivalModal] = useState(false);

  if (!game) return <div className="p-8 text-center text-gray-400">Game not found</div>;

  const activeShift = game.shifts.find(s => s.status === 'active') ?? null;
  const onFieldIds = new Set(activeShift?.players.map(p => p.playerId) ?? []);
  const activeGkId = game.currentHalf === 1 ? game.h1GoalkeeperId : game.h2GoalkeeperId;

  const attendingPlayers = players.filter(p => game.attendance.includes(p.id)).sort((a, b) => a.number - b.number);
  const fieldPlayers = players.filter(p => onFieldIds.has(p.id));
  const benchPlayers = attendingPlayers.filter(p => !onFieldIds.has(p.id));

  // Players not yet marked attending (for late arrivals)
  const notAttending = players.filter(p => !game.attendance.includes(p.id)).sort((a, b) => a.number - b.number);

  // Next shift suggestion
  const nextShiftNum = (timer.currentShiftNum + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const hasNextShift = nextShiftNum <= 6 && game.status !== 'completed' && game.status !== 'half-time';

  const suggestedNext = useMemo(() =>
    hasNextShift && game.h1GoalkeeperId
      ? suggestNextShift(game, players, nextShiftNum, timer.gameMinute)
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.shifts, game.attendance, timer.gameMinute, nextShiftNum, hasNextShift]
  );
  const nextShiftPlayers = nextShiftOverride ?? suggestedNext;

  // Playing time map
  const minutesMap = useMemo(
    () => computePlayerMinutes(game, timer.gameMinute),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.shifts, timer.gameMinute]
  );

  // Positions played per player (for stats)
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

  // Goals and assists per player (for stats)
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

  // Diff: who comes on/off between current and next shift
  const nextOnFieldIds = new Set(nextShiftPlayers.map(p => p.playerId));
  const comingOff = (activeShift?.players ?? []).filter(p => !nextOnFieldIds.has(p.playerId));
  const comingOn = nextShiftPlayers.filter(p => !onFieldIds.has(p.playerId));

  // ── Timer ───────────────────────────────────────────────────────────────────
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
  };
  const startSecondHalf = async () => {
    const h2Suggestion = suggestNextShift({ ...game, currentHalf: 2 }, players, 4, 45);
    const shifts = game.shifts.map(s =>
      s.shiftNumber === 4 ? { ...s, status: 'active' as const, players: h2Suggestion } : s
    );
    await updateGame(game.id, { status: 'second-half', currentHalf: 2, timerStartedAt: Date.now(), timerElapsed: 45 * 60, shifts });
    setNextShiftOverride(null);
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

  // ── Score ───────────────────────────────────────────────────────────────────
  const adjustScore = async (team: 'home' | 'away', delta: number) => {
    await updateGame(game.id, { score: { ...game.score, [team]: Math.max(0, game.score[team] + delta) } });
  };

  // ── Goal ────────────────────────────────────────────────────────────────────
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

  // ── Substitution (within current shift) ─────────────────────────────────────
  const doSubstitution = async () => {
    if (!subOutId || !subInId || !activeShift) return;
    const subOutPos = activeShift.players.find(sp => sp.playerId === subOutId)?.position ?? 'CM';
    const updated = activeShift.players.map(sp =>
      sp.playerId === subOutId ? { playerId: subInId, position: subOutPos } : sp
    );
    await updateGame(game.id, { shifts: game.shifts.map(s => s.id === activeShift.id ? { ...s, players: updated } : s) });
    setSubOutId(''); setSubInId('');
    setShowSubModal(false);
    setNextShiftOverride(null);
  };

  // ── Late arrival ─────────────────────────────────────────────────────────────
  const addLateArrival = async (playerId: string) => {
    await updateGame(game.id, { attendance: [...game.attendance, playerId] });
    setShowLateArrivalModal(false);
  };

  // ── Confirm next shift ───────────────────────────────────────────────────────
  const confirmNextShift = async () => {
    const nextShift = game.shifts.find(s => s.shiftNumber === nextShiftNum);
    if (!nextShift) return;
    const shifts = game.shifts.map(s => {
      if (s.id === activeShift?.id) return { ...s, status: 'completed' as const };
      if (s.id === nextShift.id) return { ...s, status: 'active' as const, players: nextShiftPlayers };
      return s;
    });
    await updateGame(game.id, { shifts });
    setNextShiftOverride(null);
    setEditingNextShift(false);
  };

  // ── Edit next shift player ───────────────────────────────────────────────────
  const swapNextShiftPlayer = (outId: string, inId: string) => {
    const current = nextShiftPlayers;
    const outSlot = current.find(sp => sp.playerId === outId);
    if (!outSlot) return;
    const updated = current.map(sp => sp.playerId === outId ? { ...sp, playerId: inId } : sp);
    setNextShiftOverride(updated);
  };

  const isLiveGame = ['first-half', 'second-half'].includes(game.status);
  const maxMin = attendingPlayers.length > 0
    ? Math.max(1, ...attendingPlayers.map(p => minutesMap.get(p.id) ?? 0))
    : 1;

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-gray-900 px-4 pt-10 pb-2 flex items-center justify-between shrink-0">
        <button onClick={() => navigate('/games')} className="text-gray-400 text-sm">← Games</button>
        <div className="text-center">
          <p className="text-xs text-gray-400">vs {game.opponent} · {game.formation}</p>
        </div>
        <div className="text-xs text-gray-400">{game.homeAway === 'home' ? 'H' : 'A'}</div>
      </div>

      {/* ── Score + Timer ── */}
      <div className="bg-gray-900 px-4 pb-3 shrink-0">
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            {isCoach && <button onClick={() => adjustScore('home', -1)} className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center active:bg-gray-600"><Minus size={12} /></button>}
            <div className="text-5xl font-bold w-12 text-center">{game.score.home}</div>
            {isCoach && <button onClick={() => adjustScore('home', 1)} className="w-7 h-7 bg-pitch-700 rounded-full flex items-center justify-center active:bg-pitch-600"><Plus size={12} /></button>}
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
            {isCoach && <button onClick={() => adjustScore('away', 1)} className="w-7 h-7 bg-red-700 rounded-full flex items-center justify-center active:bg-red-600"><Plus size={12} /></button>}
            <div className="text-5xl font-bold w-12 text-center">{game.score.away}</div>
            {isCoach && <button onClick={() => adjustScore('away', -1)} className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center active:bg-gray-600"><Minus size={12} /></button>}
          </div>
        </div>
      </div>

      {/* ── Banners ── */}
      {game.status === 'half-time' && (
        <div className="mx-3 mb-2 bg-blue-600 rounded-xl p-3 flex items-center gap-2 shrink-0">
          <div className="flex-1 font-bold text-sm">HALF TIME</div>
          {isCoach && (
            <button onClick={startSecondHalf} className="bg-white text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg">
              Start 2nd Half →
            </button>
          )}
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Formation field */}
        <div className="px-3 pt-1">
          {activeShift ? (
            <FormationField shift={activeShift} players={players}
              onPlayerClick={isCoach ? pid => { setSubOutId(pid); setShowSubModal(true); } : undefined} />
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
              {game.status === 'half-time' ? 'Half time — start 2nd half above' : 'No active shift'}
            </div>
          )}
        </div>

        {/* ── Next Shift Panel ── */}
        {isCoach && hasNextShift && game.h1GoalkeeperId && (
          <div className="mx-3 mt-3 bg-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center px-3 py-2.5 border-b border-gray-700">
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-300">
                  NEXT SHIFT · Shift {nextShiftNum} · {(nextShiftNum - 1) * 15}–{nextShiftNum * 15} min
                </p>
                {comingOff.length === 0 ? (
                  <p className="text-xs text-gray-500 mt-0.5">No changes from current</p>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {comingOff.length} off · {comingOn.length} on
                  </p>
                )}
              </div>
              {!editingNextShift ? (
                <button onClick={() => setEditingNextShift(true)}
                  className="text-xs text-gray-400 border border-gray-600 px-2 py-1 rounded-lg mr-2">
                  Edit
                </button>
              ) : (
                <button onClick={() => { setEditingNextShift(false); setNextShiftOverride(null); }}
                  className="text-xs text-gray-400 border border-gray-600 px-2 py-1 rounded-lg mr-2">
                  Reset
                </button>
              )}
              <button onClick={confirmNextShift}
                className="bg-pitch-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Check size={12} /> Confirm
              </button>
            </div>

            {/* Changes summary */}
            {comingOff.length > 0 && !editingNextShift && (
              <div className="px-3 py-2 space-y-1">
                {comingOff.map(off => {
                  const inPlayer = comingOn.find(on =>
                    nextShiftPlayers.find(sp => sp.playerId === on.playerId)?.position === off.position
                  );
                  const offPlayer = players.find(p => p.id === off.playerId);
                  const inPlayerFull = players.find(p => p.id === inPlayer?.playerId);
                  return (
                    <div key={off.playerId} className="flex items-center gap-2 text-xs">
                      <span className="text-red-400 font-medium">OUT</span>
                      <span className="text-gray-300">#{offPlayer?.number} {offPlayer?.name?.split(' ')[0]}</span>
                      <span className="text-gray-500">({off.position})</span>
                      {inPlayerFull && (
                        <>
                          <span className="text-gray-600">→</span>
                          <span className="text-pitch-400 font-medium">IN</span>
                          <span className="text-gray-300">#{inPlayerFull.number} {inPlayerFull.name?.split(' ')[0]}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Edit mode */}
            {editingNextShift && (
              <div className="px-3 py-2">
                <p className="text-xs text-gray-500 mb-2">Tap a bench player to swap into a position</p>
                <div className="space-y-1">
                  {nextShiftPlayers.map(sp => {
                    const p = players.find(pl => pl.id === sp.playerId);
                    const isGkSlot = sp.position === 'GK';
                    return (
                      <div key={sp.playerId} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-10 text-right">{sp.position}</span>
                        <span className="text-sm text-gray-200 flex-1">
                          #{p?.number} {p?.name?.split(' ')[0]}
                          {isGkSlot && <span className="ml-1 text-xs text-yellow-500">🔒 GK</span>}
                        </span>
                        {!isGkSlot && (
                          <select
                            className="bg-gray-700 text-white text-xs rounded px-1 py-0.5 border border-gray-600"
                            value={sp.playerId}
                            onChange={e => swapNextShiftPlayer(sp.playerId, e.target.value)}
                          >
                            <option value={sp.playerId}>#{p?.number} {p?.name?.split(' ')[0]}</option>
                            {attendingPlayers
                              .filter(bp => !nextOnFieldIds.has(bp.id) || bp.id === sp.playerId)
                              .map(bp => (
                                <option key={bp.id} value={bp.id}>
                                  #{bp.number} {bp.name.split(' ')[0]} ({minutesMap.get(bp.id) ?? 0}m)
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Playing Time Panel ── */}
        <div className="mx-3 mt-3 mb-3 bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center px-3 py-2.5">
            <button className="flex-1 flex items-center text-left" onClick={() => setShowTimePanel(v => !v)}>
              <Clock size={14} className="text-gray-400 mr-2" />
              <span className="text-xs font-semibold text-gray-300 flex-1">PLAYING TIME</span>
              {showTimePanel ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
            </button>
            {isCoach && notAttending.length > 0 && (
              <button
                onClick={() => setShowLateArrivalModal(true)}
                className="ml-2 flex items-center gap-1 text-xs text-pitch-400 border border-pitch-700 px-2 py-1 rounded-lg"
              >
                <UserPlus size={12} /> Late
              </button>
            )}
          </div>
          {showTimePanel && (
            <div className="px-3 pb-3 space-y-1.5">
              {[...attendingPlayers]
                .sort((a, b) => (minutesMap.get(b.id) ?? 0) - (minutesMap.get(a.id) ?? 0))
                .map(p => {
                  const mins = minutesMap.get(p.id) ?? 0;
                  const pct = maxMin > 0 ? (mins / maxMin) * 100 : 0;
                  const isOnField = onFieldIds.has(p.id);
                  const isGk = p.id === activeGkId;
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isOnField ? 'bg-pitch-400' : 'bg-gray-600'}`} />
                      <span className="text-xs text-gray-400 w-5 text-right shrink-0">{p.number}</span>
                      <span className="text-xs text-gray-200 w-20 truncate shrink-0">{p.name.split(' ')[0]}</span>
                      {isGk && <span className="text-xs text-yellow-500 shrink-0">GK</span>}
                      <div className="flex-1 h-1.5 bg-gray-700 rounded-full">
                        <div className="h-full bg-pitch-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-8 text-right shrink-0">{mins}m</span>
                    </div>
                  );
                })}
            </div>
          )}
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
            <button onClick={() => { setSubOutId(''); setSubInId(''); setShowSubModal(true); }}
              className="flex-1 bg-blue-700 rounded-xl py-3 flex flex-col items-center gap-0.5 active:scale-95">
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
                  className={`flex-1 py-2 rounded-lg font-medium text-sm ${!goalForm.isOpponent ? 'bg-pitch-700' : 'bg-gray-700'}`}>
                  Our Goal
                </button>
                <button onClick={() => setGoalForm(f => ({ ...f, isOpponent: true, scorerId: '' }))}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm ${goalForm.isOpponent ? 'bg-red-700' : 'bg-gray-700'}`}>
                  Their Goal
                </button>
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

      {/* ── Sub Modal (GK locked) ── */}
      {showSubModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowSubModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Substitution</h3>
            <p className="text-xs text-gray-500 mb-4">GK is locked for this half</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Sub OUT (on field)</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {fieldPlayers
                    .filter(p => p.id !== activeGkId)
                    .map(p => (
                      <button key={p.id} onClick={() => setSubOutId(p.id)}
                        className={`text-sm py-2 px-2 rounded-lg ${subOutId === p.id ? 'bg-red-700' : 'bg-gray-700'}`}>
                        #{p.number} {p.name.split(' ')[0]}
                        <span className="block text-xs text-gray-400">
                          {activeShift?.players.find(sp => sp.playerId === p.id)?.position}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Sub IN (from bench)</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {benchPlayers.map(p => (
                    <button key={p.id} onClick={() => setSubInId(p.id)}
                      className={`text-sm py-2 px-2 rounded-lg ${subInId === p.id ? 'bg-pitch-700' : 'bg-gray-700'}`}>
                      #{p.number} {p.name.split(' ')[0]}
                      <span className="block text-xs text-gray-400">{minutesMap.get(p.id) ?? 0}m played</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={doSubstitution} disabled={!subOutId || !subInId}
                className="w-full bg-blue-600 py-3 rounded-xl font-bold disabled:opacity-50">
                Confirm Sub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── In-Game Stats Modal ── */}
      {showStatsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowStatsModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-800 px-5 pt-5 pb-3 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">In-Game Stats</h3>
                <button onClick={() => setShowStatsModal(false)} className="text-gray-400 text-sm">✕</button>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {game.status === 'first-half' || game.status === 'second-half'
                  ? `${timer.gameMinute}' played`
                  : game.status === 'half-time' ? 'Half time' : 'Full time'}
              </p>
            </div>
            <div className="px-4 py-3">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 text-xs text-gray-500 font-semibold mb-2 px-1">
                <span>Player</span>
                <span className="w-10 text-right">Min</span>
                <span className="w-8 text-center">G</span>
                <span className="w-8 text-center">A</span>
                <span className="w-6 text-center">{''}</span>
              </div>
              <div className="space-y-1">
                {[...attendingPlayers]
                  .sort((a, b) => (minutesMap.get(b.id) ?? 0) - (minutesMap.get(a.id) ?? 0))
                  .map(p => {
                    const mins = minutesMap.get(p.id) ?? 0;
                    const goals = gameGoals.goals.get(p.id) ?? 0;
                    const assists = gameGoals.assists.get(p.id) ?? 0;
                    const positions = positionsPlayedMap.get(p.id);
                    const posStr = positions ? Array.from(positions).join(', ') : '—';
                    const isOnField = onFieldIds.has(p.id);
                    const isGk = p.id === activeGkId;
                    return (
                      <div key={p.id} className="bg-gray-700/50 rounded-xl p-3">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${isOnField ? 'bg-pitch-400' : 'bg-gray-500'}`} />
                            <span className="text-xs text-gray-400 shrink-0">#{p.number}</span>
                            <span className="text-sm font-medium text-white truncate">{p.name.split(' ')[0]}</span>
                            {isGk && <span className="text-xs text-yellow-500 shrink-0">GK</span>}
                          </div>
                          <span className="text-sm font-mono text-gray-200 w-10 text-right">{mins}m</span>
                          <span className={`text-sm font-bold w-8 text-center ${goals > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                            {goals > 0 ? goals : '—'}
                          </span>
                          <span className={`text-sm font-bold w-8 text-center ${assists > 0 ? 'text-blue-400' : 'text-gray-600'}`}>
                            {assists > 0 ? assists : '—'}
                          </span>
                        </div>
                        {positions && positions.size > 0 && (
                          <p className="text-xs text-gray-500 mt-1 ml-4">
                            {posStr}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
              {/* Legend */}
              <div className="flex gap-4 mt-4 text-xs text-gray-500 px-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pitch-400 inline-block" /> On field</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500 inline-block" /> Bench</span>
                <span className="text-amber-400 font-bold">G</span><span>= Goals</span>
                <span className="text-blue-400 font-bold">A</span><span>= Assists</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Late Arrival Modal ── */}
      {showLateArrivalModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowLateArrivalModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              <UserPlus size={20} /> Add Late Arrival
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Player will be added to attendance and included in upcoming shifts.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {notAttending.map(p => (
                <button key={p.id} onClick={() => addLateArrival(p.id)}
                  className="flex items-center gap-2 bg-gray-700 rounded-xl p-3 text-left active:scale-95 transition-transform">
                  <div className="w-8 h-8 bg-pitch-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                    {p.number}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{p.name.split(' ')[0]}</p>
                    <p className="text-xs text-gray-400">{p.positions[0] ?? 'Any'}</p>
                  </div>
                </button>
              ))}
            </div>
            {notAttending.length === 0 && (
              <p className="text-center text-gray-500 py-4 text-sm">All players are already attending.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
