import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Star, Clock, Trophy, Target } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { computeSeasonStats, formatShortDate } from '@/lib/utils';

export const PlayerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { players, games, practices, surveys, settings, isCoach } = useStore();

  const player = players.find(p => p.id === id);
  const [aiRec, setAiRec] = useState('');
  const [loading, setLoading] = useState(false);

  if (!player) return <div className="p-8 text-center text-gray-400">Player not found</div>;

  const completedGames = games.filter(g => g.status === 'completed');
  const practiceCount = (pid: string) => practices.filter(p => p.attendance.includes(pid)).length;
  const allStats = computeSeasonStats(players, completedGames, practiceCount);
  const stats = allStats.find(s => s.playerId === id)!;

  const playerSurveys = surveys.filter(s => s.playerId === id);
  const avgEffort = playerSurveys.length > 0
    ? (playerSurveys.reduce((s, r) => s + r.effortRating, 0) / playerSurveys.length).toFixed(1)
    : '—';

  const getAiRecommendation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'player_tips',
          data: {
            playerName: player.name,
            positions: player.positions,
            stats: {
              goals: stats.goals,
              assists: stats.assists,
              minutesPlayed: stats.minutesPlayed,
              gamesAttended: stats.gamesAttended,
              plusMinus: stats.plusMinus
            },
            avgEffort: parseFloat(avgEffort as string) || 0,
            surveyHighlights: playerSurveys.slice(-3).map(s => s.highlight).filter(Boolean),
            surveyImprovements: playerSurveys.slice(-3).map(s => s.improvement).filter(Boolean),
            teamName: settings?.teamName ?? 'Our Team'
          }
        })
      });
      const json = await res.json();
      setAiRec(json.text ?? '');
    } catch {
      setAiRec('Could not load recommendations. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const recentGames = completedGames
    .filter(g => g.attendance.includes(id!))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-pitch-700 px-4 pt-12 pb-6 text-white">
        <button onClick={() => navigate(-1)} className="text-pitch-200 text-sm mb-3 flex items-center gap-1">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-pitch-500 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold">#{player.number}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{player.name}</h1>
            <p className="text-pitch-200 text-sm">
              {player.positions.join(' · ') || 'Position not set'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Season stats */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold text-sm text-gray-700 mb-3">Season Stats</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Goals', value: stats.goals, icon: <Trophy size={16} className="text-amber-500" /> },
              { label: 'Assists', value: stats.assists, icon: <Target size={16} className="text-blue-500" /> },
              { label: '+/-', value: stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus, icon: <Zap size={16} className="text-purple-500" /> },
              { label: 'Minutes', value: stats.minutesPlayed, icon: <Clock size={16} className="text-pitch-600" /> },
              { label: 'Games', value: `${stats.gamesAttended}`, icon: <Star size={16} className="text-gray-400" /> },
              { label: 'Practices', value: stats.practicesAttended, icon: <Star size={16} className="text-gray-400" /> }
            ].map(({ label, value, icon }) => (
              <div key={label} className="text-center">
                <div className="flex justify-center mb-1">{icon}</div>
                <div className="text-xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm text-gray-700 flex items-center gap-2">
              <Zap size={16} className="text-amber-500" /> AI Development Tips
            </h2>
            <button
              onClick={getAiRecommendation}
              disabled={loading}
              className="bg-amber-100 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-lg"
            >
              {loading ? 'Thinking…' : 'Get Tips'}
            </button>
          </div>
          {aiRec ? (
            <div className="bg-amber-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
              {aiRec}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Tap "Get Tips" for personalized development recommendations based on your stats.
            </p>
          )}
        </div>

        {/* Recent games */}
        {recentGames.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="font-bold text-sm text-gray-700 mb-3">Recent Games</h2>
            <div className="space-y-2">
              {recentGames.map(game => {
                const goals = game.events.filter(e => e.playerId === id && e.type === 'goal' && !e.isOpponentGoal).length;
                const assists = game.events.filter(e => e.assistPlayerIds?.includes(id ?? '')).length;
                const shift = game.shifts.filter(s =>
                  s.status === 'completed' && s.players.some(sp => sp.playerId === id)
                );
                const minutes = shift.reduce((s, sh) => s + (sh.endMinute - sh.startMinute), 0);
                return (
                  <div key={game.id} className="flex items-center gap-3">
                    <div className="text-xs text-gray-400 w-14 shrink-0">{formatShortDate(game.date)}</div>
                    <div className="flex-1 text-sm font-medium">vs {game.opponent}</div>
                    <div className="text-xs text-gray-500">{minutes}m</div>
                    {goals > 0 && <span className="text-xs font-bold text-amber-600">{goals}G</span>}
                    {assists > 0 && <span className="text-xs font-bold text-blue-600">{assists}A</span>}
                    <div className={`text-xs font-bold ${game.score.home > game.score.away ? 'text-pitch-600' : game.score.home < game.score.away ? 'text-red-500' : 'text-gray-400'}`}>
                      {game.score.home}–{game.score.away}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Survey history */}
        {playerSurveys.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="font-bold text-sm text-gray-700 mb-3">
              Game Reflections <span className="text-gray-400 font-normal">· avg effort {avgEffort}/5</span>
            </h2>
            <div className="space-y-3">
              {playerSurveys.slice(-5).reverse().map(survey => {
                const g = games.find(g => g.id === survey.gameId);
                return (
                  <div key={survey.id} className="border-l-2 border-pitch-200 pl-3">
                    <p className="text-xs text-gray-400 mb-1">
                      vs {g?.opponent ?? '?'} · Effort {survey.effortRating}/5
                    </p>
                    {survey.highlight && (
                      <p className="text-sm text-gray-700">✓ {survey.highlight}</p>
                    )}
                    {survey.improvement && (
                      <p className="text-sm text-gray-500">→ {survey.improvement}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
