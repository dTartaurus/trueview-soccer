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

export const GameActive = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { games, players, isCoach, updateGame, settings } = useStore();

  const game = games.find(g => g.id === id);
  const timer = useGameTimer(game ?? null);

  // Goal modal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ scorerId: '', assistId: '', isOpponent: false });

  // Swap map: benchPlayerId → onFieldPlayerId they replace (empty string = no change)
  const [swapMap, setSwapMap] = useState<Record<string, string>>({});
  // AI recommendations (read-only column, separate from user selections)
  const [aiSwapMap, setAiSwapMap] = useState<Record<string, string>>({});
  const [swapsConfirmed, setSwapsConfirmed] = useState(false);
  const [aiLoadingShift, setAiLoadingShift] = useState(false);
  const [aiShiftReasoning, setAiShiftReasoning] = useState('');
  const [showAiReasoning, setShowAiReasoning] = useState(false);
  // Coach-set time of next expected substitution. null = auto-default (gameMinute + 15)
  const [nextSubMinuteOverride, setNextSubMinuteOverride] = useState<number | null>(null);

  // Sub execute modal
  const [showSubModal, setShowSubModal] = useState(false);

  // Stats + adjust players
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showLateArrivalModal, setShowLateArrivalModal] = useState(false);
  const [lateArrivalTimes, setLateArrivalTimes] = useState<Record<string, number>>({});

  if (!game) return <div className="p-8 text-center text-gray-400">Game not found</div>;

  const activeShift = game.shifts.find(s => s.status === 'active') ?? null;
  const onFieldIds = new Set(activeShift?.players.map(p => p.playerId) ?? []);
  const activeGkId = game.currentHalf === 1 ? game.h1GoalkeeperId : game.h2GoalkeeperId;

  const attendingPlayers = players.filter(p => game.attendance.includes(p.id)).sort((a, b) => a.number - b.number);
  const benchPlayers = attendingPlayers.filter(p => !onFieldIds.has(p.id));
  const notAttending = players.filter(p => !game.attendance.includes(p.id)).sort((a, b) => a.number - b.number);

  // Players who were benched last shift (must play next)
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

  // Plus/minus per player per position in THIS game so far
  const currentGamePosPlusMinus = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const shift of game.shifts) {
      if (shift.status !== 'completed' && shift.status !== 'active') continue;
      const shiftEnd = shift.status === 'active' ? timer.gameMinute + 1 : shift.endMinute;
      for (const sp of shift.players) {
        if (!result.has(sp.playerId)) result.set(sp.playerId, new Map());
        const posMap = result.get(sp.playerId)!;
        if (!posMap.has(sp.position)) posMap.set(sp.position, 0);
        for (const ev of game.events) {
          if (ev.minute < shift.startMinute || ev.minute >= shiftEnd) continue;
          const cur = posMap.get(sp.position)!;
          if (ev.isOpponentGoal) posMap.set(sp.position, cur - 1);
          else if (ev.type === 'goal') posMap.set(sp.position, cur + 1);
        }
      }
    }
    return result;
  }, [game.shifts, game.events, timer.gameMinute]);

  // Reference shift: the active shift during play, or last completed shift during half-time
  const referenceShift = activeShift ??
    [...game.shifts]
      .filter(s => s.status === 'completed' && s.players.length > 0)
      .sort((a, b) => b.shiftNumber - a.shiftNumber)[0] ??
    null;
  const refOnFieldIds = new Set((referenceShift?.players ?? []).map(sp => sp.playerId));
  const swapOnField = attendingPlayers.filter(p => refOnFieldIds.has(p.id));
  const swapBench = attendingPlayers.filter(p => !refOnFieldIds.has(p.id));

  // Derive the next shift lineup from swapMap + reference shift
  const nextShiftLineup = useMemo((): ShiftPlayer[] | null => {
    if (!referenceShift) return null;
    const outgoing = new Set(Object.values(swapMap).filter(Boolean));
    const swapEntries = Object.entries(swapMap).filter(([, outId]) => !!outId);
    const result: ShiftPlayer[] = referenceShift.players
      .filter(sp => !outgoing.has(sp.playerId))
      .map(sp => ({ ...sp }));
    for (const [inId, outId] of swapEntries) {
      const outSlot = referenceShift.players.find(sp => sp.playerId === outId);
      if (outSlot) result.push({ playerId: inId, position: outSlot.position as Position });
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapMap, referenceShift?.id]);

  // Diff for display / sub modal
  const nextOnFieldIds = new Set((nextShiftLineup ?? []).map(p => p.playerId));
  const comingOff = (referenceShift?.players ?? []).filter(p => !nextOnFieldIds.has(p.playerId));
  const comingOn = (nextShiftLineup ?? []).filter(p => !refOnFieldIds.has(p.playerId));

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
    const endMin = timer.gameMinute;
    await pauseTimer();
    const shifts = game.shifts.map(s =>
      s.id === activeShift?.id ? { ...s, status: 'completed' as const, endMinute: endMin } : s
    );
    await updateGame(game.id, { status: 'half-time', timerStartedAt: null, timerElapsed: 45 * 60, shifts });
    setSwapMap({});
    setAiSwapMap({});
    setSwapsConfirmed(false);
    setNextSubMinuteOverride(null);
  };
  const startSecondHalf = async () => {
    if (!nextShiftLineup) return;
    const startMin = 45;
    const shifts = game.shifts.map(s =>
      s.shiftNumber === 4 ? { ...s, status: 'active' as const, players: nextShiftLineup, startMinute: startMin } : s
    );
    await updateGame(game.id, { status: 'second-half', currentHalf: 2, timerStartedAt: Date.now(), timerElapsed: 45 * 60, shifts });
    setSwapMap({});
    setAiSwapMap({});
    setSwapsConfirmed(false);
    setAiShiftReasoning('');
    setNextSubMinuteOverride(null);
  };
  const endGame = async () => {
    if (!confirm('End game and mark as completed?')) return;
    const endMin = timer.gameMinute;
    await pauseTimer();
    const shifts = game.shifts.map(s =>
      s.id === activeShift?.id ? { ...s, status: 'completed' as const, endMinute: endMin } : s
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

  // ── AI Shift Recommendation ───────────────────────────────────────────────────
  const getAiRecommendation = async () => {
    if (!referenceShift) return;
    setAiLoadingShift(true);
    setAiShiftReasoning('');
    try {
      const nextSubMin = projectedNextSub;
      const minutesUntilSub = Math.max(0, nextSubMin - timer.gameMinute);

      const currentShiftPlayers = referenceShift.players.map(sp => {
        const p = players.find(pl => pl.id === sp.playerId);
        const rawMins = minutesMap.get(sp.playerId) ?? 0;
        return {
          playerId: sp.playerId, name: p?.name ?? '', number: p?.number ?? 0,
          position: sp.position,
          minutesThisGame: rawMins + minutesUntilSub,
        };
      });

      const benchList = swapBench.map(p => ({
        playerId: p.id, name: p.name, number: p.number,
        minutesThisGame: minutesMap.get(p.id) ?? 0,
        mustPlayNext: prevBenchedIds.has(p.id),
        joinedAtMinute: lateArrivalTimes[p.id] ?? 0,
      }));

      const allPlayersData = attendingPlayers.map(p => {
        const isOnField = refOnFieldIds.has(p.id);
        const rawMins = minutesMap.get(p.id) ?? 0;
        const adjustedMins = isOnField ? rawMins + minutesUntilSub : rawMins;
        const posStats = positionStatsMap.get(p.id);
        const currentPosPm = currentGamePosPlusMinus.get(p.id);
        return {
          id: p.id, name: p.name, number: p.number,
          preferredPositions: p.positions,
          minutesThisGame: adjustedMins,
          joinedAtMinute: lateArrivalTimes[p.id] ?? 0,
          currentGamePositionStats: currentPosPm
            ? Array.from(currentPosPm.entries()).map(([pos, pm]) => ({ position: pos, plusMinus: pm }))
            : [],
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
            nextSubMinute: nextSubMin,
            currentShiftPlayers,
            benchPlayers: benchList,
            allPlayers: allPlayersData,
            activeGkId,
            isSecondHalf: game.currentHalf === 2,
          },
        }),
      });

      const json = await res.json();
      console.log('[AI shift rec] response:', json);
      if (json.error) {
        alert(`AI error: ${json.error}`);
      } else if (Array.isArray(json.substitutions)) {
        // API returns direct substitution pairs — no diffing needed
        const validOutIds = new Set(swapOnField.filter(p => p.id !== activeGkId).map(p => p.id));
        const validInIds = new Set(swapBench.map(p => p.id));
        console.log('[AI shift rec] validInIds:', [...validInIds], 'validOutIds:', [...validOutIds]);

        const newSwapMap: Record<string, string> = {};
        const rejected: { sub: { benchPlayerId: string; onFieldPlayerId: string }; reason: string }[] = [];
        for (const sub of json.substitutions as { benchPlayerId: string; onFieldPlayerId: string }[]) {
          const inOk = validInIds.has(sub.benchPlayerId);
          const outOk = validOutIds.has(sub.onFieldPlayerId);
          if (inOk && outOk) {
            newSwapMap[sub.benchPlayerId] = sub.onFieldPlayerId;
          } else {
            rejected.push({ sub, reason: !inOk ? 'bench id invalid' : 'on-field id invalid' });
          }
        }
        if (rejected.length > 0) console.warn('[AI shift rec] rejected subs:', rejected);
        console.log('[AI shift rec] newSwapMap:', newSwapMap);

        setAiSwapMap(newSwapMap);
        setSwapsConfirmed(false);
        setAiShiftReasoning(
          Object.keys(newSwapMap).length === 0
            ? `${json.reasoning ?? ''}\n\nAI recommends no substitutions this shift — current lineup is already optimally balanced.`
            : (json.reasoning ?? '')
        );
        setShowAiReasoning(true);
      } else {
        alert('Could not generate recommendation. Try again.');
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
    const subMin = timer.gameMinute;
    const shifts = game.shifts.map(s => {
      if (s.id === activeShift.id) return { ...s, status: 'completed' as const, endMinute: subMin };
      if (s.id === nextShift.id) return { ...s, status: 'active' as const, players: nextShiftLineup, startMinute: subMin };
      return s;
    });
    await updateGame(game.id, { shifts });
    setShowSubModal(false);
    setSwapMap({});
    setAiSwapMap({});
    setSwapsConfirmed(false);
    setAiShiftReasoning('');
    setNextSubMinuteOverride(null);
  };

  // ── Late arrival / remove player ─────────────────────────────────────────────
  const addLateArrival = async (playerId: string) => {
    setLateArrivalTimes(prev => ({ ...prev, [playerId]: timer.gameMinute }));
    await updateGame(game.id, { attendance: [...game.attendance, playerId] });
  };
  const removePlayerFromGame = async (playerId: string) => {
    setLateArrivalTimes(prev => { const next = { ...prev }; delete next[playerId]; return next; });
    await updateGame(game.id, { attendance: game.attendance.filter(id => id !== playerId) });
  };

  const isLiveGame = ['first-half', 'second-half'].includes(game.status);
  const maxMin = attendingPlayers.length > 0 ? Math.max(1, ...attendingPlayers.map(p => minutesMap.get(p.id) ?? 0)) : 1;
  const hasAnySwap = Object.values(swapMap).some(Boolean);
  // Auto-default: 15 minutes from the last sub (start of current active shift)
  // During half-time the "last sub" is end of H1 (45), so default = 60.
  const lastSubMinute = activeShift?.startMinute ?? (game.status === 'half-time' ? 45 : 0);
  const autoNextSub = lastSubMinute + 15;
  const projectedNextSub = nextSubMinuteOverride ?? autoNextSub;
  // Minutes from now until next sub — added to on-field players' actual minutes
  // when shown in the substitution UI (AI Rec column, Replace dropdown).
  // Never affects stats or the Playing Time bar.
  const minutesUntilNextSub = Math.max(0, projectedNextSub - timer.gameMinute);
  const projectedMinutes = (playerId: string): number => {
    const actual = minutesMap.get(playerId) ?? 0;
    return refOnFieldIds.has(playerId) ? actual + minutesUntilNextSub : actual;
  };

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
          {isCoach && swapsConfirmed && (
            <button onClick={startSecondHalf} className="bg-white text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg">
              Start 2nd Half →
            </button>
          )}
          {isCoach && !swapsConfirmed && (
            <span className="text-xs text-blue-200">Confirm Shift 4 lineup below first</span>
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
                On Field · Shift {activeShift.shiftNumber}
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
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl p-4 text-center text-gray-500 text-sm">
            {game.status === 'half-time' ? 'Half time' : 'No active shift'}
          </div>
        )}

        {/* ── NEXT SHIFT — bench swap panel ── */}
        {isCoach && (isLiveGame || game.status === 'half-time') && (hasNextShift || game.status === 'half-time') && (
          <div className="bg-gray-800 rounded-xl overflow-hidden">

            {/* Header */}
            <div className="px-3 py-2.5 border-b border-gray-700 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                {game.status === 'half-time'
                  ? 'Shift 4 (2nd Half)'
                  : `Next · Shift ${nextShiftNum}`}
              </p>
              {swapsConfirmed && (
                <span className="text-xs text-pitch-400 flex items-center gap-1"><Check size={11} /> Confirmed</span>
              )}
            </div>

            <div className="px-3 py-3 space-y-3">

              {/* Bench list with swap dropdowns */}
              {swapBench.length > 0 ? (
                <div className="space-y-2">
                  {/* Column headers */}
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-2 shrink-0" />
                    <div className="flex-1 text-xs text-gray-500 uppercase tracking-wide font-medium">Bench</div>
                    <div className="w-[90px] shrink-0 text-xs text-amber-400 uppercase tracking-wide font-medium text-center">AI Rec</div>
                    <div className="w-[130px] shrink-0 text-xs text-gray-500 uppercase tracking-wide font-medium text-center">Replace</div>
                  </div>
                  {swapBench.map(benchP => {
                    const mins = minutesMap.get(benchP.id) ?? 0;
                    const mustPlay = prevBenchedIds.has(benchP.id);

                    // On-field players claimed by OTHER bench players (not this one)
                    const claimedByOthers = new Set(
                      Object.entries(swapMap)
                        .filter(([inId, outId]) => inId !== benchP.id && !!outId)
                        .map(([, outId]) => outId)
                    );

                    // Available on-field players: exclude GK and those claimed by others
                    const availableOnField = swapOnField
                      .filter(onP => onP.id !== activeGkId && !claimedByOthers.has(onP.id))
                      .sort((a, b) => (minutesMap.get(b.id) ?? 0) - (minutesMap.get(a.id) ?? 0));

                    // Validate stored selection — if it's been claimed by another, clear it
                    const storedOut = swapMap[benchP.id] ?? '';
                    const isStoredValid = !!storedOut && swapOnField.some(p => p.id === storedOut && p.id !== activeGkId);
                    const selectedOutId = isStoredValid ? storedOut : '';

                    // If stored selection differs from validated (someone else claimed it), clear it
                    if (storedOut && !isStoredValid && storedOut !== '') {
                      setSwapMap(prev => ({ ...prev, [benchP.id]: '' }));
                    }

                    // AI recommendation for this bench player
                    const aiRecId = aiSwapMap[benchP.id] ?? '';
                    const aiRecPlayer = aiRecId ? swapOnField.find(p => p.id === aiRecId) : null;
                    const aiRecSlot = aiRecId ? referenceShift?.players.find(sp => sp.playerId === aiRecId) : null;

                    return (
                      <div key={benchP.id}
                        className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${mustPlay ? 'bg-amber-900/25 border border-amber-700/30' : 'bg-gray-700/40'}`}>
                        {/* Must-play dot */}
                        <div className={`w-2 h-2 rounded-full shrink-0 ${mustPlay ? 'bg-amber-400' : 'bg-gray-600'}`} />
                        {/* Player info */}
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-gray-400">#{benchP.number} </span>
                          <span className="text-sm font-medium">{benchP.name.split(' ')[0]}</span>
                          <span className="text-xs text-gray-500 ml-1.5">{mins}m</span>
                          {mustPlay && <span className="text-xs text-amber-400 ml-1.5">↑ must play</span>}
                        </div>
                        {/* AI recommendation column */}
                        <div className="w-[90px] shrink-0 text-center">
                          {aiRecPlayer ? (
                            <span className="inline-flex flex-col items-center leading-tight">
                              <span className="text-xs font-medium text-amber-300">{aiRecPlayer.name.split(' ')[0]}</span>
                              <span className="text-[10px] text-amber-500">({aiRecSlot?.position ?? '?'}) {projectedMinutes(aiRecPlayer.id)}m</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-600">—</span>
                          )}
                        </div>
                        {/* Replaces dropdown */}
                        <select
                          value={selectedOutId}
                          onChange={e => {
                            setSwapMap(prev => ({ ...prev, [benchP.id]: e.target.value }));
                            setSwapsConfirmed(false);
                          }}
                          className="bg-gray-800 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-600 shrink-0 w-[130px]"
                        >
                          <option value="">— stays bench —</option>
                          {availableOnField.map(onP => {
                            const onSlot = referenceShift?.players.find(sp => sp.playerId === onP.id);
                            return (
                              <option key={onP.id} value={onP.id}>
                                #{onP.number} {onP.name.split(' ')[0]} ({onSlot?.position ?? '?'}) {projectedMinutes(onP.id)}m
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500 text-center py-1">All players are on the field</p>
              )}

              {/* Next sub time stepper */}
              <div className="flex items-center gap-2 bg-gray-700/40 rounded-xl px-3 py-2">
                <label className="text-xs text-gray-300 font-medium flex-1">
                  Next sub at minute
                </label>
                <button
                  onClick={() => setNextSubMinuteOverride(Math.max(timer.gameMinute, projectedNextSub - 1))}
                  disabled={projectedNextSub <= timer.gameMinute}
                  className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-600 text-white text-base font-bold flex items-center justify-center active:bg-gray-700 disabled:opacity-40"
                  aria-label="Decrease next sub minute"
                >
                  <Minus size={14} />
                </button>
                <span className="w-10 text-center text-sm font-bold text-white tabular-nums">
                  {projectedNextSub}
                </span>
                <button
                  onClick={() => setNextSubMinuteOverride(Math.min(90, projectedNextSub + 1))}
                  disabled={projectedNextSub >= 90}
                  className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-600 text-white text-base font-bold flex items-center justify-center active:bg-gray-700 disabled:opacity-40"
                  aria-label="Increase next sub minute"
                >
                  <Plus size={14} />
                </button>
                {nextSubMinuteOverride !== null && (
                  <button
                    onClick={() => setNextSubMinuteOverride(null)}
                    className="text-[10px] text-gray-500 underline"
                  >
                    auto
                  </button>
                )}
              </div>

              {/* AI Recommended Changes button */}
              <button
                onClick={getAiRecommendation}
                disabled={aiLoadingShift}
                className="w-full bg-amber-600 rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-transform"
              >
                {aiLoadingShift ? (
                  <>
                    <span className="w-4 h-4 border-2 border-amber-300/40 border-t-amber-100 rounded-full animate-spin" />
                    Analysing time & +/−…
                  </>
                ) : (
                  <><Zap size={15} /> AI Recommended Changes</>
                )}
              </button>

              {/* AI reasoning (collapsible) */}
              {aiShiftReasoning && (
                <div>
                  <button
                    onClick={() => setShowAiReasoning(v => !v)}
                    className="flex items-center gap-1 text-xs text-amber-400"
                  >
                    <Zap size={11} />
                    {showAiReasoning ? 'Hide' : 'Show'} AI reasoning
                    {showAiReasoning ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                  {showAiReasoning && (
                    <div className="mt-1.5 bg-amber-900/20 border border-amber-800/30 rounded-lg p-2.5 text-xs text-gray-300 leading-relaxed">
                      {aiShiftReasoning}
                    </div>
                  )}
                </div>
              )}

              {/* Clear all swaps */}
              {hasAnySwap && (
                <button
                  onClick={() => { setSwapMap({}); setAiSwapMap({}); setAiShiftReasoning(''); setSwapsConfirmed(false); }}
                  className="w-full border border-gray-600 rounded-xl py-2 text-xs text-gray-400 active:scale-95 transition-transform"
                >
                  Clear All Changes
                </button>
              )}

              {/* Confirm / confirmed state */}
              {!swapsConfirmed ? (
                <button
                  onClick={() => setSwapsConfirmed(true)}
                  className="w-full bg-pitch-700 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Check size={15} /> Confirm Changes
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-pitch-900/30 border border-pitch-700/40 rounded-xl px-3 py-2.5">
                  <Check size={14} className="text-pitch-400 shrink-0" />
                  <span className="text-sm text-pitch-300 flex-1 font-medium">
                    {hasAnySwap ? `${Object.values(swapMap).filter(Boolean).length} change(s) confirmed` : 'Same lineup confirmed'}
                  </span>
                  <button onClick={() => setSwapsConfirmed(false)} className="text-xs text-gray-500 underline shrink-0">
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Playing Time ── */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center px-3 py-2.5">
            <p className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Playing Time</p>
            {isCoach && (notAttending.length > 0 || benchPlayers.length > 0) && (
              <button onClick={() => setShowLateArrivalModal(true)}
                className="flex items-center gap-1 text-xs text-pitch-400 border border-pitch-700 px-2 py-1 rounded-lg">
                <UserPlus size={12} /> Adjust
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
              disabled={!swapsConfirmed}
              className={`flex-1 rounded-xl py-3 flex flex-col items-center gap-0.5 active:scale-95 transition-colors ${swapsConfirmed ? 'bg-blue-700' : 'bg-gray-700 opacity-50'}`}>
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
              <p className="text-xs text-gray-400 mt-0.5">at minute {timer.gameMinute}</p>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {comingOff.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Changes</p>
                  {comingOff.map(off => {
                    const inPlayer = comingOn.find(sp => {
                      const outId = swapMap[sp.playerId];
                      return outId === off.playerId;
                    }) ?? comingOn[0];
                    const offPlayer = players.find(p => p.id === off.playerId);
                    const inPlayerFull = players.find(p => p.id === inPlayer?.playerId);
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
                            <span className="text-white">#{inPlayerFull?.number} {inPlayerFull?.name}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-2">Same lineup — no player changes</p>
              )}
              {nextShiftLineup.filter(sp => refOnFieldIds.has(sp.playerId)).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Staying On</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nextShiftLineup.filter(sp => refOnFieldIds.has(sp.playerId)).map(sp => {
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

      {/* ── Adjust Players Modal ── */}
      {showLateArrivalModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowLateArrivalModal(false)}>
          <div className="w-full bg-gray-800 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2"><UserPlus size={20} /> Adjust Players</h3>
              <button onClick={() => setShowLateArrivalModal(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            {notAttending.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Add Player</p>
                <p className="text-xs text-gray-500 mb-3">Player joins now — their available time starts from minute {timer.gameMinute}.</p>
                <div className="grid grid-cols-2 gap-2">
                  {notAttending.map(p => (
                    <button key={p.id}
                      onClick={async () => { await addLateArrival(p.id); }}
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
            )}

            {benchPlayers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Remove Player</p>
                <p className="text-xs text-gray-500 mb-3">Only bench players can be removed.</p>
                <div className="grid grid-cols-2 gap-2">
                  {benchPlayers.map(p => {
                    const mins = minutesMap.get(p.id) ?? 0;
                    return (
                      <button key={p.id}
                        onClick={async () => { if (confirm(`Remove ${p.name} from this game?`)) { await removePlayerFromGame(p.id); } }}
                        className="flex items-center gap-2 bg-red-900/40 border border-red-800/40 rounded-xl p-3 text-left active:scale-95">
                        <div className="w-8 h-8 bg-red-800 rounded-full flex items-center justify-center text-sm font-bold shrink-0">{p.number}</div>
                        <div>
                          <p className="text-sm font-medium">{p.name.split(' ')[0]}</p>
                          <p className="text-xs text-gray-400">{mins}m played</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {notAttending.length === 0 && benchPlayers.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No adjustments available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
