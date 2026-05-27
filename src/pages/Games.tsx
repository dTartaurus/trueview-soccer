import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, ChevronRight, X, Check, Trash2, Share2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { generateId, buildGameSheet } from '@/lib/utils';
import type { Game, GameShift } from '@/types';
import { format } from 'date-fns';

const buildEmptyShifts = (): GameShift[] =>
  [1, 2, 3, 4, 5, 6].map(n => ({
    id: generateId(),
    shiftNumber: n as 1 | 2 | 3 | 4 | 5 | 6,
    half: n <= 3 ? 1 : 2,
    startMinute: (n - 1) * 15,
    endMinute: n * 15,
    status: 'pending',
    players: []
  }));

const statusBadge = (status: Game['status']) => {
  const map: Record<Game['status'], { label: string; color: string }> = {
    scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
    'first-half': { label: 'Live H1', color: 'bg-red-100 text-red-700 animate-pulse' },
    'half-time': { label: 'Half Time', color: 'bg-orange-100 text-orange-700' },
    'second-half': { label: 'Live H2', color: 'bg-red-100 text-red-700 animate-pulse' },
    completed: { label: 'FT', color: 'bg-gray-100 text-gray-600' }
  };
  const { label, color } = map[status];
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  );
};

export const Games = () => {
  const navigate = useNavigate();
  const { games, players, isCoach, saveGame, deleteGame } = useStore();

  const handleShare = async (game: Game) => {
    const text = buildGameSheet(game, players);
    const title = `Game vs ${game.opponent}`;
    if (navigator.share) {
      try { await navigator.share({ title, text }); }
      catch { /* user cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      alert('Game sheet copied to clipboard');
    } catch {
      alert('Could not copy game sheet');
    }
  };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    opponent: '',
    homeAway: 'home' as 'home' | 'away',
    formation: '4-3-3'
  });

  const handleCreate = async () => {
    if (!form.opponent.trim()) return;
    const game: Game = {
      id: generateId(),
      date: form.date,
      opponent: form.opponent.trim(),
      homeAway: form.homeAway,
      status: 'scheduled',
      attendance: [],
      score: { home: 0, away: 0 },
      events: [],
      shifts: buildEmptyShifts(),
      timerElapsed: 0,
      timerStartedAt: null,
      currentHalf: 1,
      formation: form.formation,
      notes: '',
      createdAt: new Date().toISOString(),
      presetLineup: [],
      h1GoalkeeperId: '',
      h2GoalkeeperId: ''
    };
    await saveGame(game);
    setShowForm(false);
    setForm({ date: format(new Date(), 'yyyy-MM-dd'), opponent: '', homeAway: 'home', formation: '4-3-3' });
    navigate(`/game/${game.id}/setup`);
  };

  const sortedGames = [...games].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-pitch-700 px-4 pt-12 pb-4 text-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Games</h1>
          <p className="text-pitch-200 text-sm">{games.length} scheduled</p>
        </div>
        {isCoach && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2 text-sm font-medium active:bg-white/30"
          >
            <Plus size={18} />
            New Game
          </button>
        )}
      </div>

      {/* New game form */}
      {showForm && (
        <div className="m-4 bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold mb-4">New Game</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">Date</label>
              <input
                type="date"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Opponent</label>
              <input
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                placeholder="Team name"
                value={form.opponent}
                onChange={e => setForm(f => ({ ...f, opponent: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 font-medium">Home / Away</label>
                <select
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                  value={form.homeAway}
                  onChange={e => setForm(f => ({ ...f, homeAway: e.target.value as 'home' | 'away' }))}
                >
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 font-medium">Formation</label>
                <select
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                  value={form.formation}
                  onChange={e => setForm(f => ({ ...f, formation: e.target.value }))}
                >
                  {['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '4-1-4-1'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 text-gray-600"
              >
                <X size={16} /> Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.opponent.trim()}
                className="flex-1 bg-pitch-700 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <Check size={16} /> Create & Setup
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {sortedGames.map(game => (
          <div key={game.id} className="bg-white rounded-xl shadow-sm flex items-center">
            <button
              onClick={() => navigate(
                game.status === 'scheduled'
                  ? `/game/${game.id}/setup`
                  : `/game/${game.id}`
              )}
              className="flex-1 p-4 flex items-center gap-3 text-left active:scale-95 transition-transform min-w-0"
            >
              <div className="w-12 h-12 bg-pitch-50 rounded-xl flex flex-col items-center justify-center shrink-0">
                <span className="text-pitch-700 font-bold text-lg leading-none">
                  {new Date(game.date + 'T12:00:00').getDate()}
                </span>
                <span className="text-pitch-600 text-xs uppercase">
                  {format(new Date(game.date + 'T12:00:00'), 'MMM')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">vs {game.opponent}</p>
                  {statusBadge(game.status)}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {game.homeAway === 'home' ? 'Home' : 'Away'} · {game.formation}
                  {game.status !== 'scheduled' && ` · ${game.score.home}–${game.score.away}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {game.attendance.length} attending
                </p>
              </div>
              <ChevronRight className="text-gray-400 shrink-0" size={18} />
            </button>
            {game.status !== 'scheduled' && (
              <button
                onClick={e => { e.stopPropagation(); handleShare(game); }}
                className="p-4 text-gray-300 active:text-blue-500 shrink-0"
                aria-label="Share game sheet"
              >
                <Share2 size={17} />
              </button>
            )}
            {isCoach && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  if (confirm(`Delete game vs ${game.opponent}? This cannot be undone.`)) {
                    deleteGame(game.id);
                  }
                }}
                className="p-4 text-gray-300 active:text-red-500 shrink-0"
                aria-label="Delete game"
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        ))}

        {games.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Calendar size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No games yet</p>
            {isCoach && <p className="text-sm mt-1">Tap "New Game" to add games</p>}
          </div>
        )}
      </div>
    </div>
  );
};
