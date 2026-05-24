import { useState } from 'react';
import { Zap, ChevronRight, Trophy, Users, BookOpen, Target } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { computeSeasonStats } from '@/lib/utils';

type AIMode = 'formation' | 'practice' | 'season' | 'substitution';

export const AICoach = () => {
  const { players, games, practices, settings } = useStore();
  const [mode, setMode] = useState<AIMode | null>(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [formInput, setFormInput] = useState({
    opponent: '',
    formation: '4-3-3',
    duration: 60,
    notes: ''
  });

  const completedGames = games.filter(g => g.status === 'completed');
  const practiceCount = (pid: string) => practices.filter(p => p.attendance.includes(pid)).length;
  const stats = computeSeasonStats(players, completedGames, practiceCount);

  const callAI = async (type: string, data: unknown) => {
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data })
      });
      const json = await res.json();
      setResult(json.text ?? 'No response received.');
    } catch {
      setResult('Could not connect. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormation = () => callAI('formation', {
    players: players.map(p => ({ name: p.name, number: p.number, positions: p.positions })),
    opponent: formInput.opponent,
    preferredFormation: formInput.formation,
    teamName: settings?.teamName ?? 'Our Team',
    seasonStats: stats
  });

  const handlePractice = () => callAI('practice', {
    duration: formInput.duration,
    playerCount: players.length,
    teamName: settings?.teamName ?? 'Our Team',
    notes: formInput.notes
  });

  const handleSeasonReview = () => callAI('season_review', {
    teamName: settings?.teamName ?? 'Our Team',
    record: {
      wins: completedGames.filter(g => g.score.home > g.score.away).length,
      draws: completedGames.filter(g => g.score.home === g.score.away).length,
      losses: completedGames.filter(g => g.score.home < g.score.away).length,
      gamesPlayed: completedGames.length,
      gamesRemaining: games.filter(g => g.status === 'scheduled').length
    },
    stats: stats.map(s => ({
      name: players.find(p => p.id === s.playerId)?.name ?? '?',
      ...s
    })),
    notes: formInput.notes
  });

  const MODES = [
    {
      key: 'formation' as AIMode,
      icon: <Target size={22} className="text-amber-500" />,
      label: 'Formation Advice',
      desc: 'Get recommended lineup and formation for your next game'
    },
    {
      key: 'practice' as AIMode,
      icon: <BookOpen size={22} className="text-blue-500" />,
      label: 'Practice Planner',
      desc: 'Generate a drill plan tailored to your session length'
    },
    {
      key: 'season' as AIMode,
      icon: <Trophy size={22} className="text-pitch-600" />,
      label: 'Season Review',
      desc: 'AI analysis of season performance and recommendations'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-pitch-700 px-4 pt-12 pb-4 text-white">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Zap size={20} /> AI Coach
        </h1>
        <p className="text-pitch-200 text-sm">Powered by Claude</p>
      </div>

      <div className="p-4 space-y-3">
        {MODES.map(m => (
          <button
            key={m.key}
            onClick={() => { setMode(m.key); setResult(''); }}
            className={`w-full bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 text-left active:scale-95 transition-transform ${
              mode === m.key ? 'ring-2 ring-pitch-500' : ''
            }`}
          >
            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
              {m.icon}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{m.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
            </div>
            <ChevronRight size={18} className={`text-gray-400 transition-transform ${mode === m.key ? 'rotate-90' : ''}`} />
          </button>
        ))}

        {/* Input form for selected mode */}
        {mode === 'formation' && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="font-semibold text-gray-800">Formation Advice</h3>
            <div>
              <label className="text-xs text-gray-500 font-medium">Opponent name (optional)</label>
              <input
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                placeholder="e.g. Riverside United"
                value={formInput.opponent}
                onChange={e => setFormInput(f => ({ ...f, opponent: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Preferred Formation</label>
              <select
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={formInput.formation}
                onChange={e => setFormInput(f => ({ ...f, formation: e.target.value }))}
              >
                {['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '4-1-4-1'].map(fmt => (
                  <option key={fmt}>{fmt}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleFormation}
              disabled={loading || players.length === 0}
              className="w-full bg-amber-500 text-white rounded-xl py-3 font-semibold disabled:opacity-50"
            >
              {loading ? 'Thinking…' : 'Get Formation Advice'}
            </button>
          </div>
        )}

        {mode === 'practice' && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="font-semibold text-gray-800">Practice Planner</h3>
            <div>
              <label className="text-xs text-gray-500 font-medium">Session duration (minutes)</label>
              <input
                type="number"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={formInput.duration}
                onChange={e => setFormInput(f => ({ ...f, duration: parseInt(e.target.value) || 60 }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Focus areas / notes (optional)</label>
              <textarea
                rows={2}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. work on finishing, defending set pieces…"
                value={formInput.notes}
                onChange={e => setFormInput(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <button
              onClick={handlePractice}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold disabled:opacity-50"
            >
              {loading ? 'Thinking…' : 'Generate Practice Plan'}
            </button>
          </div>
        )}

        {mode === 'season' && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="font-semibold text-gray-800">Season Review</h3>
            <div>
              <label className="text-xs text-gray-500 font-medium">Any specific concerns or focus? (optional)</label>
              <textarea
                rows={2}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. struggling with set pieces, need more shooting practice…"
                value={formInput.notes}
                onChange={e => setFormInput(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <button
              onClick={handleSeasonReview}
              disabled={loading || completedGames.length === 0}
              className="w-full bg-pitch-700 text-white rounded-xl py-3 font-semibold disabled:opacity-50"
            >
              {loading ? 'Analyzing…' : 'Analyze Season'}
            </button>
            {completedGames.length === 0 && (
              <p className="text-xs text-gray-400 text-center">Complete at least one game first</p>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-amber-500" />
              <h3 className="font-semibold text-sm text-gray-700">Claude's Recommendation</h3>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {result}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
