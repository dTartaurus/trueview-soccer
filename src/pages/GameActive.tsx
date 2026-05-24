import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, ChevronRight, Plus, Minus, RotateCcw, Flag, Trophy, AlertTriangle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useGameTimer } from '@/hooks/useGameTimer';
import { FormationField } from '@/components/FormationField';
import { generateId, FORMATIONS } from '@/lib/utils';
import type { GameEvent, GameShift, ShiftPlayer, Position } from '@/types';

export const GameActive = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { games, players, isCoach, updateGame } = useStore();

  const game = games.find(g => g.id === id);
  const timer = useGameTimer(game ?? null);

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ scorerId: '', assistId: '', isOpponent: false });
  const [subOut, setSubOut] = useState('');
  const [subIn, setSubIn] = useState('');
  const [subPosition, setSubPosition] = useState<Position>('CM');
  const [shiftPlayers, setShiftPlayers] = useState<ShiftPlayer[]>([]);
  const [shiftAlertDismissed, setShiftAlertDismissed] = useState<number>(-1);

  const activeShift = game?.shifts.find(s => s.status === 'active') ?? null;
  const onFieldIds = new Set(activeShift?.players.map(p => p.playerId) ?? []);
  const benchPlayers = players.filter(p => game?.attendance.includes(p.id) && !onFieldIds.has(p.id));
  const fieldPlayers = players.filter(p => onFieldIds.has(p.id));

  // Shift change alert
  const shiftAlertDue =
    timer.isRunning &&
    timer.secondsUntilNextShift <= 120 &&
    timer.secondsUntilNextShift > 0 &&
    timer.halfMinutes < 45 &&
    timer.currentShiftNum !== shiftAlertDismissed;

  if (!game) return <div className="p-8 text-center text-gray-400">Game not found</div>;

  // ── Timer controls ──────────────────────────────────────────────────────────

  const pauseTimer = async () => {
    if (!timer.isRunning) return;
    const elapsed = game.timerElapsed + (game.timerStartedAt
      ? (Date.now() - game.timerStartedAt) / 1000 : 0);
    await updateGame(game.id, { timerElapsed: elapsed, timerStartedAt: null });
  };

  const resumeTimer = async () => {
    if (timer.isRunning) return;
    await updateGame(game.id, { timerStartedAt: Date.now() });
  };

  const triggerHalfTime = async () => {
    await pauseTimer();
    await updateGame(game.id, {
      status: 'half-time',
      timerStartedAt: null,
      timerElapsed: 45 * 60
    });
  };

  const startSecondHalf = async () => {
    await updateGame(game.id, {
      status: 'second-half',
      currentHalf: 2,
      timerStartedAt: Date.now(),
      timerElapsed: 45 * 60
    });
  };

  const endGame = async () => {
    if (!confirm('End game and mark as completed?')) return;
    await pauseTimer();
    await updateGame(game.id, { status: 'completed' });
    navigate('/games');
  };

  // ── Score ───────────────────────────────────────────────────────────────────

  const adjustScore = async (team: 'home' | 'away', delta: number) => {
    const score = { ...game.score, [team]: Math.max(0, game.score[team] + delta) };
    await updateGame(game.id, { score });
  };

  // ── Goals ───────────────────────────────────────────────────────────────────

  const logGoal = async () => {
    if (!goalForm.scorerId && !goalForm.isOpponent) return;
    const event: GameEvent = {
      id: generateId(),
      type: 'goal',
      minute: timer.gameMinute,
      playerId: goalForm.scorerId,
      assistPlayerId: goalForm.assistId || undefined,
      isOpponentGoal: goalForm.isOpponent
    };
    const events = [...game.events, event];
    const score = goalForm.isOpponent
      ? { ...game.score, away: game.score.away + 1 }
      : { ...game.score, home: game.score.home + 1 };
    await updateGame(game.id, { events, score });
    setGoalForm({ scorerId: '', assistId: '', isOpponent: false });
    setShowGoalModal(false);
  };

  // ── Substitutions ───────────────────────────────────────────────────────────

  const doSubstitution = async () => {
    if (!subOut || !subIn) return;
    if (!activeShift) return;
    const updated = activeShift.players.map(sp =>
      sp.playerId === subOut ? { playerId: subIn, position: subPosition } : sp
    );
    const shifts = game.shifts.map(s =>
      s.id === activeShift.id ? { ...s, players: updated } : s
    );
    await updateGame(game.id, { shifts });
    setSubOut(''); setSubIn('');
    setShowSubModal(false);
  };

  // ── Shift management ────────────────────────────────────────────────────────

  const activateShift = async (shift: GameShift, players: ShiftPlayer[]) => {
    const shifts = game.shifts.map(s => {
      if (s.id === activeShift?.id) return { ...s, status: 'completed' as const };
      if (s.id === shift.id) return { ...s, status: 'active' as const, players };
      return s;
    });
    await updateGame(game.id, { shifts });
    setShowShiftModal(false);
    setShiftAlertDismissed(timer.currentShiftNum);
  };

  const openShiftModal = () => {
    const nextShift = game.shifts.find(s => s.status === 'pending');
    if (nextShift) {
      // Pre-fill with attendance rotation
      const attending = players.filter(p => game.attendance.includes(p.id));
      const onField = activeShift?.players ?? [];
      const bench = attending.filter(p => !onField.some(sp => sp.playerId === p.id));
      // Simple rotation: swap bench players into positions
      const newPlayers: ShiftPlayer[] = onField.map((sp, i) =>
        bench[i] ? { playerId: bench[i].id, position: sp.position } : sp
      );
      setShiftPlayers(newPlayers.length > 0 ? newPlayers : onField);
    }
    setShowShiftModal(true);
  };

  const startFirstShift = async () => {
    const firstShift = game.shifts.find(s => s.shiftNumber === 1);
    if (!firstShift) return;
    // Auto-assign attending players (first 11) to default formation positions
    const positions = FORMATIONS[game.formation] ?? FORMATIONS['4-3-3'];
    const attending = players.filter(p => game.attendance.includes(p.id));
    const defaultPlayers: ShiftPlayer[] = positions.slice(0, attending.length).map(
      (pos, i) => ({ playerId: attending[i].id, position: pos as Position })
    );
    const shifts = game.shifts.map(s =>
      s.id === firstShift.id ? { ...s, status: 'active' as const, players: defaultPlayers } : s
    );
    await updateGame(game.id, { shifts });
  };

  const attendingPlayers = players.filter(p => game.attendance.includes(p.id));

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      {/* Header bar */}
      <div className="bg-gray-900 px-4 pt-10 pb-3 flex items-center justify-between shrink-0">
        <button onClick={() => navigate('/games')} className="text-gray-400 text-sm">← Games</button>
        <div className="text-center">
          <p className="text-xs text-gray-400">vs {game.opponent}</p>
          <p className="text-xs text-gray-500">{game.formation}</p>
        </div>
        <div className="text-xs text-gray-400">
          {game.homeAway === 'home' ? 'H' : 'A'}
        </div>
      </div>

      {/* Score + Timer */}
      <div className="bg-gray-900 px-4 pb-4 shrink-0">
        <div className="flex items-center justify-center gap-6">
          {/* Home score */}
          <div className="flex items-center gap-2">
            {isCoach && (
              <button onClick={() => adjustScore('home', -1)} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center active:bg-gray-600">
                <Minus size={14} />
              </button>
            )}
            <div className="text-5xl font-bold w-14 text-center">{game.score.home}</div>
            {isCoach && (
              <button onClick={() => adjustScore('home', 1)} className="w-8 h-8 bg-pitch-700 rounded-full flex items-center justify-center active:bg-pitch-600">
                <Plus size={14} />
              </button>
            )}
          </div>

          {/* Timer */}
          <div className="text-center">
            <div className="text-3xl font-mono font-bold">{timer.halfDisplay}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              H{game.currentHalf} · Shift {timer.currentShiftNum}/6
            </div>
            {isCoach && (
              <button
                onClick={timer.isRunning ? pauseTimer : resumeTimer}
                className="mt-1 p-1.5 bg-gray-700 rounded-full"
              >
                {timer.isRunning ? <Pause size={14} /> : <Play size={14} />}
              </button>
            )}
          </div>

          {/* Away score */}
          <div className="flex items-center gap-2">
            {isCoach && (
              <button onClick={() => adjustScore('away', 1)} className="w-8 h-8 bg-red-700 rounded-full flex items-center justify-center active:bg-red-600">
                <Plus size={14} />
              </button>
            )}
            <div className="text-5xl font-bold w-14 text-center">{game.score.away}</div>
            {isCoach && (
              <button onClick={() => adjustScore('away', -1)} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center active:bg-gray-600">
                <Minus size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Shift change alert */}
      {shiftAlertDue && (
        <div className="mx-4 mb-2 bg-amber-500 text-black rounded-xl p-3 flex items-center gap-2 shrink-0">
          <AlertTriangle size={18} className="shrink-0" />
          <div className="flex-1 text-sm font-medium">
            Shift change in {timer.secondsUntilNextShift}s!
          </div>
          <button onClick={openShiftModal} className="bg-black/20 text-black text-xs font-bold px-2 py-1 rounded-lg">
            Manage
          </button>
          <button onClick={() => setShiftAlertDismissed(timer.currentShiftNum)} className="text-black/60 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Half time banner */}
      {game.status === 'half-time' && (
        <div className="mx-4 mb-2 bg-blue-600 rounded-xl p-3 flex items-center gap-2 shrink-0">
          <div className="flex-1 text-sm font-bold">HALF TIME</div>
          {isCoach && (
            <button onClick={startSecondHalf} className="bg-white text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg">
              Start 2nd Half
            </button>
          )}
        </div>
      )}

      {/* Field view */}
      <div className="flex-1 overflow-auto px-4 pb-2">
        {activeShift ? (
          <FormationField
            shift={activeShift}
            players={players}
            onPlayerClick={isCoach ? (pid) => {
              setSubOut(pid);
              setShowSubModal(true);
            } : undefined}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-gray-400 text-sm">No active shift</p>
            {isCoach && (
              <button onClick={startFirstShift}
                className="bg-pitch-600 text-white px-6 py-3 rounded-xl font-semibold">
                Set Starting Lineup
              </button>
            )}
          </div>
        )}
      </div>

      {/* Coach action bar */}
      {isCoach && (
        <div className="bg-gray-900 border-t border-gray-700 px-4 py-3 pb-8 shrink-0">
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setShowGoalModal(true)}
              className="bg-amber-600 rounded-xl py-2.5 flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
            >
              <Trophy size={18} />
              <span className="text-xs font-medium">Goal</span>
            </button>
            <button
              onClick={() => { setShowSubModal(true); setSubOut(''); }}
              className="bg-blue-700 rounded-xl py-2.5 flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
            >
              <RotateCcw size={18} />
              <span className="text-xs font-medium">Sub</span>
            </button>
            <button
              onClick={openShiftModal}
              className="bg-purple-700 rounded-xl py-2.5 flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
            >
              <ChevronRight size={18} />
              <span className="text-xs font-medium">Shift</span>
            </button>
            {game.status === 'first-half' && timer.halfMinutes >= 40 && (
              <button onClick={triggerHalfTime} className="bg-gray-600 rounded-xl py-2.5 flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
                <Flag size={18} />
                <span className="text-xs font-medium">HT</span>
              </button>
            )}
            {game.status === 'second-half' && timer.halfMinutes >= 40 && (
              <button onClick={endGame} className="bg-red-700 rounded-xl py-2.5 flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
                <Flag size={18} />
                <span className="text-xs font-medium">End</span>
              </button>
            )}
            {!['first-half','second-half'].includes(game.status) && (
              <button onClick={endGame} className="bg-red-700 rounded-xl py-2.5 flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
                <Flag size={18} />
                <span className="text-xs font-medium">End</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bench strip */}
      {benchPlayers.length > 0 && (
        <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 shrink-0">
          <p className="text-xs text-gray-500 mb-1.5">BENCH</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {benchPlayers.map(p => (
              <div key={p.id}
                className="flex items-center gap-1.5 bg-gray-700 rounded-lg px-2 py-1.5 shrink-0">
                <span className="w-5 text-xs font-bold text-gray-400">#{p.number}</span>
                <span className="text-sm font-medium text-white whitespace-nowrap">{p.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Goal Modal ── */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowGoalModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Log Goal</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setGoalForm(f => ({ ...f, isOpponent: false }))}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm ${!goalForm.isOpponent ? 'bg-pitch-700' : 'bg-gray-700'}`}
                >Our Goal</button>
                <button
                  onClick={() => setGoalForm(f => ({ ...f, isOpponent: true, scorerId: '' }))}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm ${goalForm.isOpponent ? 'bg-red-700' : 'bg-gray-700'}`}
                >Their Goal</button>
              </div>
              {!goalForm.isOpponent && (
                <>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Scorer</label>
                    <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                      {attendingPlayers.map(p => (
                        <button key={p.id}
                          onClick={() => setGoalForm(f => ({ ...f, scorerId: p.id }))}
                          className={`text-sm py-1.5 px-2 rounded-lg ${goalForm.scorerId === p.id ? 'bg-amber-600' : 'bg-gray-700'}`}>
                          #{p.number} {p.name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Assist (optional)</label>
                    <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                      {attendingPlayers.filter(p => p.id !== goalForm.scorerId).map(p => (
                        <button key={p.id}
                          onClick={() => setGoalForm(f => ({ ...f, assistId: f.assistId === p.id ? '' : p.id }))}
                          className={`text-sm py-1.5 px-2 rounded-lg ${goalForm.assistId === p.id ? 'bg-blue-700' : 'bg-gray-700'}`}>
                          #{p.number} {p.name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <button
                onClick={logGoal}
                disabled={!goalForm.isOpponent && !goalForm.scorerId}
                className="w-full bg-amber-600 py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {goalForm.isOpponent ? 'Log Opponent Goal' : 'Log Goal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub Modal ── */}
      {showSubModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowSubModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Substitution</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Sub OUT (on field)</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {fieldPlayers.map(p => (
                    <button key={p.id}
                      onClick={() => setSubOut(p.id)}
                      className={`text-sm py-1.5 px-2 rounded-lg ${subOut === p.id ? 'bg-red-700' : 'bg-gray-700'}`}>
                      #{p.number} {p.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Sub IN (from bench)</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {benchPlayers.map(p => (
                    <button key={p.id}
                      onClick={() => setSubIn(p.id)}
                      className={`text-sm py-1.5 px-2 rounded-lg ${subIn === p.id ? 'bg-pitch-700' : 'bg-gray-700'}`}>
                      #{p.number} {p.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={doSubstitution}
                disabled={!subOut || !subIn}
                className="w-full bg-blue-600 py-3 rounded-xl font-bold disabled:opacity-50"
              >
                Confirm Sub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shift Modal ── */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowShiftModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Next Shift Lineup</h3>
            <p className="text-gray-400 text-sm mb-4">Tap players to assign who comes on next shift</p>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {attendingPlayers.map(p => {
                const isSelected = shiftPlayers.some(sp => sp.playerId === p.id);
                const currentPos = shiftPlayers.find(sp => sp.playerId === p.id)?.position;
                return (
                  <button key={p.id}
                    onClick={() => {
                      if (isSelected) {
                        setShiftPlayers(prev => prev.filter(sp => sp.playerId !== p.id));
                      } else if (shiftPlayers.length < 11) {
                        const pos = activeShift?.players.find((_, i) => !shiftPlayers[i])?.position ?? 'CM';
                        setShiftPlayers(prev => [...prev, { playerId: p.id, position: pos as Position }]);
                      }
                    }}
                    className={`text-sm py-1.5 px-2 rounded-lg flex items-center gap-1 ${isSelected ? 'bg-pitch-700' : 'bg-gray-700'}`}>
                    <span className="text-xs opacity-60">#{p.number}</span>
                    <span>{p.name.split(' ')[0]}</span>
                    {currentPos && <span className="ml-auto text-xs opacity-60">{currentPos}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 text-center mb-3">{shiftPlayers.length}/11 selected</p>
            <button
              onClick={() => {
                const nextShift = game.shifts.find(s => s.status === 'pending');
                if (nextShift) activateShift(nextShift, shiftPlayers);
              }}
              disabled={shiftPlayers.length !== 11}
              className="w-full bg-purple-600 py-3 rounded-xl font-bold disabled:opacity-50"
            >
              Activate Shift
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
