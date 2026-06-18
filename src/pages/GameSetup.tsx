import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Users, Zap, ArrowRight, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { computeSeasonStats, computePlayerPositionStats, getFormationPositions } from '@/lib/utils';
import type { ShiftPlayer, Position } from '@/types';

type LineupSlot = { position: string; playerId: string };

const POSITION_COLORS: Record<string, string> = {
  GK: 'bg-yellow-600', LB: 'bg-blue-700', RB: 'bg-blue-700',
  LCB: 'bg-blue-800', RCB: 'bg-blue-800', CB: 'bg-blue-800',
  LWB: 'bg-blue-600', RWB: 'bg-blue-600',
  CDM: 'bg-teal-700', CM: 'bg-teal-600', LCM: 'bg-teal-600',
  RCM: 'bg-teal-600', CAM: 'bg-teal-500', LM: 'bg-teal-600', RM: 'bg-teal-600',
  LW: 'bg-pitch-600', RW: 'bg-pitch-600', ST: 'bg-red-700', CF: 'bg-red-600', SS: 'bg-red-600',
};

export const GameSetup = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { games, players, practices, isCoach, updateGame, settings } = useStore();

  const game = games.find(g => g.id === id);

  const [step, setStep] = useState<1 | 2>(1);
  const [attendance, setAttendance] = useState<Set<string>>(new Set(game?.attendance ?? []));
  const [notAttending, setNotAttending] = useState<Set<string>>(new Set(game?.notAttending ?? []));
  // Autosave flag — true after the first user-initiated change so we don't
  // overwrite the saved game with stale defaults on first render.
  const hasMutatedAttendance = useRef(false);
  const [lineupSlots, setLineupSlots] = useState<LineupSlot[]>([]);
  const [h2Gk, setH2Gk] = useState(game?.h2GoalkeeperId ?? '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReasoning, setAiReasoning] = useState('');
  const [showReasoning, setShowReasoning] = useState(false);
  const [pickingSlotIdx, setPickingSlotIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!game) return;
    const positions = getFormationPositions(game.formation);
    if (game.presetLineup?.length >= 7) {
      const slotMap = new Map(game.presetLineup.map(sp => [sp.position as string, sp.playerId]));
      setLineupSlots(positions.map(pos => ({ position: pos, playerId: slotMap.get(pos) ?? '' })));
      setStep(2);
    } else {
      setLineupSlots(positions.map(pos => ({ position: pos, playerId: '' })));
    }
  }, [game?.id]);

  if (!game) return <div className="p-8 text-center text-gray-400">Game not found</div>;

  const sortedAll = [...players].sort((a, b) => a.number - b.number);
  const attending = players.filter(p => attendance.has(p.id)).sort((a, b) => a.number - b.number);

  const completedGames = games.filter(g => g.status === 'completed');
  const positionStatsMap = computePlayerPositionStats(completedGames);
  const practiceCount = (pid: string) => practices.filter(p => p.attendance.includes(pid)).length;
  const seasonStats = computeSeasonStats(players, completedGames, practiceCount);

  const assignedIds = new Set(lineupSlots.filter(s => s.playerId).map(s => s.playerId));
  const filledCount = lineupSlots.filter(s => s.playerId).length;
  const h1GkId = lineupSlots.find(s => s.position === 'GK')?.playerId ?? '';
  const benchPlayers = attending.filter(p => !assignedIds.has(p.id));

  // Cycle the player through three states: undecided → attending → not
  // attending → undecided. The attending and notAttending sets are kept
  // mutually exclusive.
  const cycleAttendance = (pid: string) => {
    hasMutatedAttendance.current = true;
    if (attendance.has(pid)) {
      setAttendance(prev => { const n = new Set(prev); n.delete(pid); return n; });
      setNotAttending(prev => { const n = new Set(prev); n.add(pid); return n; });
    } else if (notAttending.has(pid)) {
      setNotAttending(prev => { const n = new Set(prev); n.delete(pid); return n; });
    } else {
      setAttendance(prev => { const n = new Set(prev); n.add(pid); return n; });
    }
  };
  // Used by All / Clear bulk actions.
  const setAttendanceBulk = (set: Set<string>, notSet: Set<string>) => {
    hasMutatedAttendance.current = true;
    setAttendance(set);
    setNotAttending(notSet);
  };

  // Autosave attendance + notAttending after every change so the coach can
  // leave the setup page and come back without losing their work. The
  // "Recommend Starting Lineup" button is the canonical commit, but
  // intermediate state is persisted too.
  useEffect(() => {
    if (!hasMutatedAttendance.current || !game) return;
    const attendingArr = Array.from(attendance);
    const notArr = Array.from(notAttending);
    const sameAtt = attendingArr.length === (game.attendance ?? []).length
      && attendingArr.every(id => game.attendance.includes(id));
    const sameNot = notArr.length === (game.notAttending ?? []).length
      && notArr.every(id => (game.notAttending ?? []).includes(id));
    if (sameAtt && sameNot) return;
    const handle = setTimeout(() => {
      updateGame(game.id, { attendance: attendingArr, notAttending: notArr }).catch(err => {
        console.warn('[GameSetup] autosave failed:', err);
      });
    }, 400);
    return () => clearTimeout(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, notAttending, game?.id]);

  const assignPlayer = (slotIdx: number, playerId: string) => {
    setLineupSlots(prev => prev.map((s, i) => i === slotIdx ? { ...s, playerId } : s));
    setPickingSlotIdx(null);
  };

  const clearSlot = (slotIdx: number) => {
    setLineupSlots(prev => prev.map((s, i) => i === slotIdx ? { ...s, playerId: '' } : s));
  };

  const availableForPicker = (slotIdx: number) =>
    attending.filter(p =>
      p.id === lineupSlots[slotIdx]?.playerId || !assignedIds.has(p.id)
    );

  // ── AI Lineup ───────────────────────────────────────────────────────────────
  const getAiLineup = async () => {
    setAiLoading(true);
    setAiReasoning('');
    try {
      const enriched = attending.map(p => {
        const posStats = positionStatsMap.get(p.id);
        const positionStats = posStats
          ? Array.from(posStats.entries()).map(([pos, stat]) => ({
              position: pos,
              minutesPlayed: stat.minutesPlayed,
              goals: stat.goals,
              assists: stat.assists,
              plusMinus: stat.plusMinus,
              goalsPerMinute: stat.minutesPlayed > 0 ? +(stat.goals / stat.minutesPlayed).toFixed(4) : 0,
              assistsPerMinute: stat.minutesPlayed > 0 ? +(stat.assists / stat.minutesPlayed).toFixed(4) : 0,
            }))
          : [];
        const totals = seasonStats.find(s => s.playerId === p.id);
        const gamesAtt = totals?.gamesAttended ?? 0;
        const mins = totals?.minutesPlayed ?? 0;
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          preferredPositions: p.positions,
          positionStats,
          totalGamesAttended: gamesAtt,
          totalMinutesPlayed: mins,
          seasonAvgMinutesPerGame: gamesAtt > 0 ? +((mins / gamesAtt).toFixed(1)) : 0,
          seasonGoals: totals?.goals ?? 0,
          seasonPlusMinus: totals?.plusMinus ?? 0,
        };
      });

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lineup_structured',
          data: {
            players: enriched,
            formation: game.formation,
            teamName: settings?.teamName ?? 'Our Team',
            opponent: game.opponent,
            attendingCount: attending.length,
          }
        })
      });

      const json = await res.json();

      if (Array.isArray(json.startingLineup) && json.startingLineup.length >= 7) {
        const positions = getFormationPositions(game.formation);
        const newSlots: LineupSlot[] = positions.map(pos => {
          const hit = (json.startingLineup as { playerId: string; position: string }[])
            .find(a => a.position === pos);
          return { position: pos, playerId: hit?.playerId ?? '' };
        });
        setLineupSlots(newSlots);
        setAiReasoning(json.reasoning ?? '');
        setShowReasoning(true);
        setStep(2);
      } else if (json.error) {
        alert(json.error);
      } else {
        alert('Could not generate a lineup. Please try again.');
      }
    } catch {
      alert('Could not connect to AI. Check your internet connection.');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Start Game ──────────────────────────────────────────────────────────────
  const canStart = filledCount >= 7 && !!h1GkId;

  const startGame = async () => {
    const preset: ShiftPlayer[] = lineupSlots
      .filter(s => s.playerId)
      .map(s => ({ playerId: s.playerId, position: s.position as Position }));

    const shifts = game.shifts.map(s =>
      s.shiftNumber === 1 ? { ...s, status: 'active' as const, players: preset } : s
    );

    await updateGame(game.id, {
      attendance: Array.from(attendance),
      h1GoalkeeperId: h1GkId,
      h2GoalkeeperId: h2Gk || h1GkId,
      presetLineup: preset,
      shifts,
      status: 'first-half',
      timerStartedAt: Date.now(),
      timerElapsed: 0,
      currentHalf: 1,
    });
    navigate(`/game/${game.id}`);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 1 — Attendance
  // ────────────────────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gray-50 pb-10">
        {/* Header */}
        <div className="bg-pitch-700 px-4 pt-12 pb-5 text-white">
          <button onClick={() => navigate('/games')} className="text-pitch-200 text-sm mb-3">← Back</button>
          <h1 className="text-2xl font-bold">vs {game.opponent}</h1>
          <p className="text-pitch-200 text-sm mt-1">
            {game.date} · {game.homeAway === 'home' ? 'Home' : 'Away'} · {game.formation}
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Attendance card */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-pitch-700" />
                <h2 className="font-bold text-gray-800">Roster status</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setAttendanceBulk(new Set(players.map(p => p.id)), new Set())}
                  className="text-xs text-pitch-700 font-medium bg-pitch-50 px-2 py-1 rounded-lg">All ✓</button>
                <button onClick={() => setAttendanceBulk(new Set(), new Set(players.map(p => p.id)))}
                  className="text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded-lg">All ✗</button>
                <button onClick={() => setAttendanceBulk(new Set(), new Set())}
                  className="text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-lg">Clear</button>
              </div>
            </div>
            <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-pitch-700"><span className="w-2 h-2 bg-pitch-700 rounded-full" /> {attendance.size} attending</span>
              <span className="flex items-center gap-1 text-red-600"><span className="w-2 h-2 bg-red-500 rounded-full" /> {notAttending.size} not attending</span>
              <span className="flex items-center gap-1 text-gray-400 ml-auto">
                {players.length - attendance.size - notAttending.size} undecided
              </span>
            </div>
            <p className="px-4 pt-2 text-[11px] text-gray-400">
              Tap a player to cycle: undecided → attending → not attending → undecided. Auto-saved.
            </p>
            <div className="p-3 grid grid-cols-2 gap-2">
              {sortedAll.map(player => {
                const isIn = attendance.has(player.id);
                const isOut = notAttending.has(player.id);
                const wrapperCls = isIn
                  ? 'bg-pitch-50 border-pitch-400 text-pitch-900'
                  : isOut
                    ? 'bg-red-50 border-red-300 text-red-900'
                    : 'bg-gray-50 border-transparent text-gray-500';
                const badgeCls = isIn
                  ? 'bg-pitch-700 text-white'
                  : isOut
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-500';
                return (
                  <button
                    key={player.id}
                    onClick={() => cycleAttendance(player.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${wrapperCls}`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${badgeCls}`}>
                      {isIn ? <Check size={14} /> : isOut ? <X size={14} /> : player.number}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{player.name.split(' ')[0]}</p>
                      <p className="text-xs opacity-70">
                        #{player.number}
                        {isIn && ' · attending'}
                        {isOut && ' · not attending'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recommend button */}
          <div className="space-y-2">
            {attendance.size < 7 && (
              <p className="text-center text-sm text-gray-400">
                Select at least 7 players to continue
              </p>
            )}
            <button
              onClick={getAiLineup}
              disabled={attendance.size < 7 || aiLoading}
              className="w-full bg-amber-500 text-white rounded-2xl py-4 font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-40 active:scale-95 transition-transform shadow-md"
            >
              {aiLoading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Building Lineup…
                </>
              ) : (
                <>
                  <Zap size={22} />
                  Recommend Starting Lineup
                </>
              )}
            </button>
            {aiLoading && (
              <p className="text-center text-xs text-gray-400">
                Analysing preferred positions and match performance…
              </p>
            )}
          </div>

          {game.status !== 'scheduled' && (
            <button onClick={() => navigate(`/game/${game.id}`)}
              className="w-full border border-pitch-300 text-pitch-700 rounded-xl py-3 font-semibold text-sm">
              Resume Live Game →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 2 — Lineup Review & Confirm
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-pitch-700 px-4 pt-12 pb-5 text-white">
        <button onClick={() => setStep(1)} className="text-pitch-200 text-sm mb-3 flex items-center gap-1">
          <ArrowLeft size={14} /> Adjust Attendance
        </button>
        <h1 className="text-2xl font-bold">Starting Lineup</h1>
        <p className="text-pitch-200 text-sm mt-1">
          vs {game.opponent} · {game.formation} · {attendance.size} attending
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* AI Reasoning */}
        {aiReasoning && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowReasoning(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left"
            >
              <Zap size={15} className="text-amber-600 shrink-0" />
              <span className="text-sm font-semibold text-amber-800 flex-1">AI Reasoning</span>
              {showReasoning
                ? <ChevronUp size={15} className="text-amber-500" />
                : <ChevronDown size={15} className="text-amber-500" />}
            </button>
            {showReasoning && (
              <div className="px-4 pb-4 text-sm text-amber-900 whitespace-pre-wrap leading-relaxed border-t border-amber-100 pt-3">
                {aiReasoning}
              </div>
            )}
          </div>
        )}

        {/* Lineup slots */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-800">
              Lineup
              <span className="ml-2 text-sm font-normal text-gray-400">{filledCount}/11</span>
            </h2>
            <p className="text-xs text-gray-400">Tap a player to swap</p>
          </div>
          <div className="p-3 space-y-2">
            {lineupSlots.map((slot, idx) => {
              const player = players.find(p => p.id === slot.playerId);
              const posColor = POSITION_COLORS[slot.position] ?? 'bg-gray-500';
              const posStats = slot.playerId ? positionStatsMap.get(slot.playerId)?.get(slot.position) : null;

              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className={`${posColor} text-white text-xs font-bold px-2 py-1.5 rounded-lg w-12 text-center shrink-0`}>
                    {slot.position}
                  </div>
                  <button
                    onClick={() => setPickingSlotIdx(idx)}
                    className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors active:scale-95 ${
                      player
                        ? 'bg-pitch-50 border-pitch-200 text-pitch-900'
                        : 'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                    }`}
                  >
                    {player ? (
                      <>
                        <span className="font-bold text-gray-500 text-xs w-6 shrink-0">#{player.number}</span>
                        <span className="font-semibold flex-1">{player.name}</span>
                        {player.positions.includes(slot.position as Position) && (
                          <span className="text-xs text-pitch-600 shrink-0">✓ pref</span>
                        )}
                        {posStats && posStats.minutesPlayed > 0 && (
                          <span className="text-xs text-gray-400 shrink-0">
                            {posStats.plusMinus > 0 ? '+' : ''}{posStats.plusMinus}
                          </span>
                        )}
                      </>
                    ) : (
                      <span>Tap to assign</span>
                    )}
                  </button>
                  {player && (
                    <button onClick={() => clearSlot(idx)} className="text-gray-300 active:text-red-400 p-1 shrink-0">✕</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 2nd Half GK */}
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0">GK</div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-medium block mb-1">2nd Half Goalkeeper</label>
              <select
                value={h2Gk}
                onChange={e => setH2Gk(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
              >
                <option value="">— Same as 1st Half —</option>
                {attending.map(p => (
                  <option key={p.id} value={p.id}>#{p.number} {p.name}</option>
                ))}
              </select>
            </div>
          </div>
          {h1GkId && (
            <p className="text-xs text-gray-400 mt-2 ml-11">
              {h2Gk && h2Gk !== h1GkId
                ? `${players.find(p => p.id === h1GkId)?.name} plays H1 · ${players.find(p => p.id === h2Gk)?.name} plays H2`
                : `${players.find(p => p.id === h1GkId)?.name} plays both halves`}
            </p>
          )}
        </div>

        {/* Bench */}
        {benchPlayers.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
            <h3 className="text-sm font-bold text-gray-500 mb-2">BENCH ({benchPlayers.length})</h3>
            <div className="flex flex-wrap gap-2">
              {benchPlayers.map(p => (
                <span key={p.id} className="bg-gray-100 text-gray-600 text-sm px-3 py-1.5 rounded-full font-medium">
                  #{p.number} {p.name.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Start Game */}
        <div className="space-y-2">
          {!canStart && (
            <p className="text-center text-xs text-gray-400">
              {!h1GkId ? 'Assign a goalkeeper to the GK slot' : `Need at least 7 players in the lineup (${filledCount} filled)`}
            </p>
          )}
          <button
            onClick={startGame}
            disabled={!canStart}
            className="w-full bg-pitch-700 text-white rounded-2xl py-4 font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-40 active:scale-95 transition-transform shadow-lg"
          >
            <ArrowRight size={22} />
            Start Game
          </button>
        </div>
      </div>

      {/* ── Player Picker Modal ── */}
      {pickingSlotIdx !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50" onClick={() => setPickingSlotIdx(null)}>
          <div className="w-full bg-white rounded-t-2xl p-5 max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1">
              Assign {lineupSlots[pickingSlotIdx]?.position}
            </h3>
            <p className="text-xs text-gray-400 mb-3">Tap a player to assign · ✓ = preferred position</p>
            <div className="grid grid-cols-2 gap-2">
              {availableForPicker(pickingSlotIdx).map(p => {
                const pos = lineupSlots[pickingSlotIdx]?.position;
                const prefersThis = p.positions.includes(pos as Position);
                const posStats = positionStatsMap.get(p.id)?.get(pos);
                const totalStats = seasonStats.find(s => s.playerId === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => assignPlayer(pickingSlotIdx, p.id)}
                    className={`flex flex-col p-3 rounded-xl border text-left active:scale-95 transition-transform ${
                      prefersThis ? 'bg-pitch-50 border-pitch-300' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-gray-700">#{p.number}</span>
                      <span className="font-semibold text-sm flex-1">{p.name.split(' ')[0]}</span>
                      {prefersThis && <span className="text-xs text-pitch-600 font-bold">✓</span>}
                    </div>
                    {posStats && posStats.minutesPlayed > 0 ? (
                      <p className="text-xs text-gray-500 mt-1">
                        {pos}: {posStats.goals}G · {posStats.assists}A · {posStats.plusMinus > 0 ? '+' : ''}{posStats.plusMinus} · {posStats.minutesPlayed}m
                      </p>
                    ) : totalStats ? (
                      <p className="text-xs text-gray-400 mt-1">
                        Overall: {totalStats.goals}G · {totalStats.assists}A · {totalStats.plusMinus > 0 ? '+' : ''}{totalStats.plusMinus}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">No stats yet</p>
                    )}
                  </button>
                );
              })}
              {availableForPicker(pickingSlotIdx).length === 0 && (
                <p className="col-span-2 text-center text-gray-400 text-sm py-4">
                  All attending players are already in the lineup.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
