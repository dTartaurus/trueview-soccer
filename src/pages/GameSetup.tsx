import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Users, Zap, ArrowRight, Lock, ChevronDown } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { computeSeasonStats, getFormationPositions } from '@/lib/utils';
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

  const [attendance, setAttendance] = useState<Set<string>>(new Set(game?.attendance ?? []));
  const [h1Gk, setH1Gk] = useState(game?.h1GoalkeeperId ?? '');
  const [h2Gk, setH2Gk] = useState(game?.h2GoalkeeperId ?? '');
  const [lineupSlots, setLineupSlots] = useState<LineupSlot[]>([]);
  const [pickingSlotIdx, setPickingSlotIdx] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [showAiText, setShowAiText] = useState(false);

  // Initialise lineup slots from formation (or existing preset)
  useEffect(() => {
    if (!game) return;
    if (game.presetLineup?.length === 11) {
      setLineupSlots(game.presetLineup.map(sp => ({ position: sp.position, playerId: sp.playerId })));
    } else {
      const positions = getFormationPositions(game.formation);
      setLineupSlots(positions.map(pos => ({ position: pos, playerId: '' })));
    }
  }, [game?.id]);

  // Auto-fill GK slot when H1 GK changes
  useEffect(() => {
    if (!h1Gk) return;
    setLineupSlots(prev => prev.map(slot =>
      slot.position === 'GK' ? { ...slot, playerId: h1Gk } : slot
    ));
  }, [h1Gk]);

  if (!game) return <div className="p-8 text-center text-gray-400">Game not found</div>;

  const toggleAttendance = (pid: string) => {
    setAttendance(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  // Season stats for ranking in AI call
  const completedGames = games.filter(g => g.status === 'completed');
  const practiceCount = (pid: string) => practices.filter(p => p.attendance.includes(pid)).length;
  const seasonStats = computeSeasonStats(players, completedGames, practiceCount);

  const attending = players.filter(p => attendance.has(p.id)).sort((a, b) => a.number - b.number);

  // Players not yet assigned to any slot (for the picker)
  const assignedIds = new Set(lineupSlots.filter(s => s.playerId).map(s => s.playerId));
  const availableForPicker = (slotIdx: number) => {
    const slotPos = lineupSlots[slotIdx]?.position;
    // GK slot handled by h1Gk dropdown, shouldn't be manually picked
    return attending.filter(p => {
      if (p.id === lineupSlots[slotIdx]?.playerId) return true; // current selection always shown
      if (assignedIds.has(p.id)) return false; // already in another slot
      return true;
    });
  };

  const assignPlayer = (slotIdx: number, playerId: string) => {
    setLineupSlots(prev => prev.map((s, i) => i === slotIdx ? { ...s, playerId } : s));
    setPickingSlotIdx(null);
  };

  const clearSlot = (slotIdx: number) => {
    const slot = lineupSlots[slotIdx];
    if (slot.position === 'GK') return; // GK controlled by picker
    setLineupSlots(prev => prev.map((s, i) => i === slotIdx ? { ...s, playerId: '' } : s));
  };

  // ── AI Lineup ───────────────────────────────────────────────────────────────
  const getAiLineup = async () => {
    if (!h1Gk) { alert('Please select a 1st Half Goalkeeper first.'); return; }
    setAiLoading(true);
    setAiText('');
    try {
      const enriched = attending.map(p => {
        const s = seasonStats.find(st => st.playerId === p.id);
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          preferredPositions: p.positions,
          gamesAttended: s?.gamesAttended ?? 0,
          totalGames: completedGames.length,
          plusMinus: s?.plusMinus ?? 0,
          goals: s?.goals ?? 0,
          assists: s?.assists ?? 0,
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
            h1GoalkeeperId: h1Gk,
            h2GoalkeeperId: h2Gk || h1Gk,
            teamName: settings?.teamName ?? 'Our Team',
            opponent: game.opponent,
          }
        })
      });

      const json = await res.json();

      if (json.startingLineup?.length === 11) {
        // Fill lineup slots from AI response
        const positions = getFormationPositions(game.formation);
        const newSlots: LineupSlot[] = positions.map(pos => {
          const assigned = (json.startingLineup as {playerId:string; position:string}[])
            .find(a => a.position === pos);
          return { position: pos, playerId: assigned?.playerId ?? '' };
        });
        setLineupSlots(newSlots);
        setAiText(json.reasoning ?? '');
        setShowAiText(true);
      } else {
        setAiText(json.error ?? 'AI could not generate a lineup. Try again.');
        setShowAiText(true);
      }
    } catch {
      setAiText('Could not connect to AI. Check your internet connection.');
      setShowAiText(true);
    } finally {
      setAiLoading(false);
    }
  };

  // ── Start Game ──────────────────────────────────────────────────────────────
  const filledCount = lineupSlots.filter(s => s.playerId).length;
  const canStart = attendance.size >= 7 && filledCount === 11 && !!h1Gk;

  const startGame = async () => {
    const preset: ShiftPlayer[] = lineupSlots
      .filter(s => s.playerId)
      .map(s => ({ playerId: s.playerId, position: s.position as Position }));

    // Activate Shift 1 immediately with the preset lineup
    const shifts = game.shifts.map(s =>
      s.shiftNumber === 1
        ? { ...s, status: 'active' as const, players: preset }
        : s
    );

    await updateGame(game.id, {
      attendance: Array.from(attendance),
      h1GoalkeeperId: h1Gk,
      h2GoalkeeperId: h2Gk || h1Gk,
      presetLineup: preset,
      shifts,
      status: 'first-half',
      timerStartedAt: Date.now(),
      timerElapsed: 0,
      currentHalf: 1,
    });
    navigate(`/game/${game.id}`);
  };

  const sortedAll = [...players].sort((a, b) => a.number - b.number);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-pitch-700 px-4 pt-12 pb-4 text-white">
        <button onClick={() => navigate('/games')} className="text-pitch-200 text-sm mb-2">← Back</button>
        <h1 className="text-xl font-bold">vs {game.opponent}</h1>
        <p className="text-pitch-200 text-sm">{game.date} · {game.homeAway === 'home' ? 'Home' : 'Away'} · {game.formation}</p>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Attendance ── */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2">
              <Users size={18} className="text-pitch-700" />
              Attendance ({attendance.size}/{players.length})
            </h2>
            <div className="flex gap-3">
              <button onClick={() => setAttendance(new Set(players.map(p => p.id)))} className="text-xs text-pitch-700 font-medium">All</button>
              <button onClick={() => setAttendance(new Set())} className="text-xs text-gray-400 font-medium">Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {sortedAll.map(player => {
              const present = attendance.has(player.id);
              return (
                <button key={player.id} onClick={() => toggleAttendance(player.id)}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border text-sm transition-colors ${
                    present ? 'bg-pitch-50 border-pitch-300 text-pitch-800' : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    present ? 'bg-pitch-700 text-white' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {present ? <Check size={10} /> : player.number}
                  </div>
                  <span className="truncate text-xs font-medium">{player.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Goalkeepers ── */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <div className="w-5 h-5 bg-yellow-500 rounded text-xs font-bold text-white flex items-center justify-center">GK</div>
            Goalkeepers
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">1st Half GK</label>
              <select value={h1Gk} onChange={e => setH1Gk(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500">
                <option value="">— Pick GK —</option>
                {attending.map(p => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">2nd Half GK</label>
              <select value={h2Gk} onChange={e => setH2Gk(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500">
                <option value="">— Same GK —</option>
                {attending.map(p => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
              </select>
            </div>
          </div>
          {h1Gk && (
            <p className="text-xs text-gray-400 mt-2">
              {h2Gk && h2Gk !== h1Gk
                ? `${players.find(p=>p.id===h1Gk)?.name} plays H1 · ${players.find(p=>p.id===h2Gk)?.name} plays H2`
                : `${players.find(p=>p.id===h1Gk)?.name} plays both halves`}
            </p>
          )}
        </div>

        {/* ── Lineup Builder ── */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">Starting Lineup
              <span className="ml-2 text-sm font-normal text-gray-400">{filledCount}/11</span>
            </h2>
            <button onClick={getAiLineup} disabled={aiLoading || attendance.size < 7 || !h1Gk}
              className="flex items-center gap-1.5 bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
              <Zap size={14} />
              {aiLoading ? 'Building…' : 'AI Lineup'}
            </button>
          </div>

          {attendance.size < 7 && (
            <p className="text-sm text-gray-400 mb-3">Mark at least 7 players present first.</p>
          )}
          {!h1Gk && attendance.size >= 7 && (
            <p className="text-sm text-amber-600 mb-3">Select a 1st Half GK to enable AI Lineup.</p>
          )}

          <div className="space-y-1.5">
            {lineupSlots.map((slot, idx) => {
              const player = players.find(p => p.id === slot.playerId);
              const isGk = slot.position === 'GK';
              const posColor = POSITION_COLORS[slot.position] ?? 'bg-gray-500';

              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className={`${posColor} text-white text-xs font-bold px-2 py-1 rounded w-12 text-center shrink-0`}>
                    {slot.position}
                  </div>
                  <button
                    onClick={() => isGk ? null : setPickingSlotIdx(idx)}
                    disabled={isGk}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      player
                        ? 'bg-pitch-50 border-pitch-200 text-pitch-800'
                        : 'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                    } ${!isGk ? 'active:scale-95' : ''}`}
                  >
                    {player ? (
                      <>
                        <span className="font-bold text-xs text-gray-500 w-6">#{player.number}</span>
                        <span className="font-medium">{player.name}</span>
                        {player.positions.includes(slot.position as Position) && (
                          <span className="ml-auto text-xs text-pitch-600">✓ pref</span>
                        )}
                      </>
                    ) : (
                      <span>{isGk ? 'Set GK above' : 'Tap to assign'}</span>
                    )}
                    {isGk && <Lock size={12} className="ml-auto text-gray-400" />}
                  </button>
                  {player && !isGk && (
                    <button onClick={() => clearSlot(idx)} className="text-gray-300 hover:text-red-400 p-1">✕</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI reasoning */}
          {aiText && (
            <div className="mt-3">
              <button onClick={() => setShowAiText(v => !v)}
                className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                <ChevronDown size={14} className={showAiText ? 'rotate-180' : ''} />
                {showAiText ? 'Hide' : 'Show'} AI reasoning
              </button>
              {showAiText && (
                <div className="mt-2 bg-amber-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap">
                  {aiText}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Start Game ── */}
        <button onClick={startGame} disabled={!canStart}
          className="w-full bg-pitch-700 text-white rounded-xl py-4 font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform shadow-lg">
          <ArrowRight size={22} />
          Start Game
        </button>
        {!canStart && (
          <p className="text-center text-xs text-gray-400">
            {attendance.size < 7 ? 'Need at least 7 players' : !h1Gk ? 'Select a 1st Half GK' : `Assign all 11 positions (${filledCount}/11 done)`}
          </p>
        )}

        {game.status !== 'scheduled' && (
          <button onClick={() => navigate(`/game/${game.id}`)}
            className="w-full border border-pitch-300 text-pitch-700 rounded-xl py-3 font-semibold text-sm">
            View Live Game →
          </button>
        )}
      </div>

      {/* ── Player Picker Modal ── */}
      {pickingSlotIdx !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50" onClick={() => setPickingSlotIdx(null)}>
          <div className="w-full bg-white rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1">
              Assign {lineupSlots[pickingSlotIdx]?.position}
            </h3>
            <p className="text-xs text-gray-500 mb-3">Tap a player to assign to this position</p>
            <div className="grid grid-cols-2 gap-2">
              {availableForPicker(pickingSlotIdx).map(p => {
                const pos = lineupSlots[pickingSlotIdx]?.position;
                const prefersThis = p.positions.includes(pos as Position);
                const stats = seasonStats.find(s => s.playerId === p.id);
                return (
                  <button key={p.id} onClick={() => assignPlayer(pickingSlotIdx, p.id)}
                    className={`flex flex-col p-2.5 rounded-xl border text-left transition-colors active:scale-95 ${
                      prefersThis ? 'bg-pitch-50 border-pitch-300' : 'bg-gray-50 border-gray-200'
                    }`}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-gray-700">#{p.number}</span>
                      <span className="font-medium text-sm">{p.name.split(' ')[0]}</span>
                      {prefersThis && <span className="ml-auto text-xs text-pitch-600 font-semibold">✓</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {stats ? `+/- ${stats.plusMinus > 0 ? '+' : ''}${stats.plusMinus} · ${stats.gamesAttended}G` : 'No stats yet'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
