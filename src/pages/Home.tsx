import { useNavigate } from 'react-router-dom';
import { Calendar, Users, Trophy, Zap, ChevronRight, Star } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { formatShortDate, computeSeasonStats } from '@/lib/utils';
import { format } from 'date-fns';

export const Home = () => {
  const navigate = useNavigate();
  const { players, games, practices, settings, isCoach, currentPlayerId } = useStore();

  const today = format(new Date(), 'yyyy-MM-dd');
  const completedGames = games.filter(g => g.status === 'completed');
  const upcoming = games
    .filter(g => g.status === 'scheduled' && g.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const activeGame = games.find(g =>
    ['first-half', 'half-time', 'second-half'].includes(g.status)
  );

  const wins = completedGames.filter(g => g.score.home > g.score.away).length;
  const losses = completedGames.filter(g => g.score.home < g.score.away).length;
  const draws = completedGames.filter(g => g.score.home === g.score.away).length;

  const practiceCount = (pid: string) =>
    practices.filter(p => p.attendance.includes(pid)).length;

  const seasonStats = computeSeasonStats(players, completedGames, practiceCount);

  const topScorer = [...seasonStats].sort((a, b) => b.goals - a.goals)[0];
  const topAssists = [...seasonStats].sort((a, b) => b.assists - a.assists)[0];

  const myStats = currentPlayerId
    ? seasonStats.find(s => s.playerId === currentPlayerId)
    : null;
  const myPlayer = currentPlayerId
    ? players.find(p => p.id === currentPlayerId)
    : null;

  // Check if there's a survey pending for current player
  const pendingGame = currentPlayerId
    ? completedGames.find(g =>
        g.attendance.includes(currentPlayerId) &&
        !useStore.getState().surveys.find(s => s.playerId === currentPlayerId && s.gameId === g.id)
      )
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-pitch-700 px-4 pt-12 pb-6 text-white">
        <p className="text-pitch-200 text-sm font-medium">Season 2025</p>
        <h1 className="text-2xl font-bold mt-1">
          {settings?.teamName ?? 'Trueview Soccer'}
        </h1>
        <div className="flex items-center gap-4 mt-3">
          <div className="text-center">
            <div className="text-2xl font-bold">{wins}</div>
            <div className="text-xs text-pitch-200">W</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{draws}</div>
            <div className="text-xs text-pitch-200">D</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{losses}</div>
            <div className="text-xs text-pitch-200">L</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-lg font-bold">{completedGames.length} / {games.length}</div>
            <div className="text-xs text-pitch-200">games played</div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Pending survey banner */}
        {pendingGame && (
          <button
            onClick={() => navigate(`/survey/${pendingGame.id}`)}
            className="w-full bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center gap-3 text-left active:scale-95 transition-transform"
          >
            <Star className="text-amber-500 shrink-0" size={24} />
            <div>
              <p className="font-semibold text-amber-800">Reflect on your game!</p>
              <p className="text-sm text-amber-600">vs {pendingGame.opponent} · takes 1 minute</p>
            </div>
            <ChevronRight className="ml-auto text-amber-400" size={20} />
          </button>
        )}

        {/* Active game alert */}
        {activeGame && (
          <button
            onClick={() => navigate(`/game/${activeGame.id}`)}
            className="w-full bg-red-600 text-white rounded-xl p-4 flex items-center gap-3 active:scale-95 transition-transform"
          >
            <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
            <div className="text-left">
              <p className="font-bold">Game in Progress</p>
              <p className="text-sm text-red-100">
                vs {activeGame.opponent} · {activeGame.score.home}–{activeGame.score.away}
              </p>
            </div>
            <ChevronRight className="ml-auto" size={20} />
          </button>
        )}

        {/* My stats (player mode) */}
        {myStats && myPlayer && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              My Season · #{myPlayer.number} {myPlayer.name}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Goals', value: myStats.goals },
                { label: 'Assists', value: myStats.assists },
                { label: '+/-', value: myStats.plusMinus > 0 ? `+${myStats.plusMinus}` : myStats.plusMinus },
                { label: 'Minutes', value: myStats.minutesPlayed }
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-2xl font-bold text-pitch-700">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next game */}
        {upcoming && (
          <button
            onClick={() => navigate(`/games`)}
            className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 text-left active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 bg-pitch-50 rounded-lg flex items-center justify-center shrink-0">
              <Calendar className="text-pitch-700" size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Next Game</p>
              <p className="font-semibold">vs {upcoming.opponent}</p>
              <p className="text-sm text-gray-500">{formatShortDate(upcoming.date)} · {upcoming.homeAway === 'home' ? 'Home' : 'Away'}</p>
            </div>
            <ChevronRight className="ml-auto text-gray-400" size={20} />
          </button>
        )}

        {/* Season highlights */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Season Leaders
          </p>
          <div className="space-y-3">
            {topScorer && topScorer.goals > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <Trophy size={16} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Top Scorer</p>
                  <p className="font-semibold text-sm">
                    {players.find(p => p.id === topScorer.playerId)?.name ?? '—'}
                  </p>
                </div>
                <span className="ml-auto font-bold text-pitch-700">{topScorer.goals}G</span>
              </div>
            )}
            {topAssists && topAssists.assists > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Zap size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Top Assists</p>
                  <p className="font-semibold text-sm">
                    {players.find(p => p.id === topAssists.playerId)?.name ?? '—'}
                  </p>
                </div>
                <span className="ml-auto font-bold text-blue-600">{topAssists.assists}A</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        {isCoach && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/games')}
              className="bg-pitch-700 text-white rounded-xl p-4 flex items-center gap-2 active:scale-95 transition-transform"
            >
              <Calendar size={20} />
              <span className="font-semibold">Games</span>
            </button>
            <button
              onClick={() => navigate('/practice')}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2 text-gray-700 active:scale-95 transition-transform"
            >
              <Users size={20} />
              <span className="font-semibold">Practice</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
