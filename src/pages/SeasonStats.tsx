import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Clock, Target, Zap, TrendingUp, Users } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { useStore } from '@/store/useStore';
import { computeSeasonStats } from '@/lib/utils';

type StatKey = 'goals' | 'assists' | 'avgMinutes' | 'plusMinus' | 'gamesAttended';

export const SeasonStats = () => {
  const { players, games, practices } = useStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<StatKey>('goals');

  const completedGames = games.filter(g => g.status === 'completed');
  const practiceCount = (pid: string) =>
    practices.filter(p => p.attendance.includes(pid)).length;

  const baseStats = computeSeasonStats(players, completedGames, practiceCount);
  // Augment with avgMinutes = total outfield minutes / games attended.
  // Rounded to 1 decimal so the leaderboard shows e.g. 42.5m/g.
  const stats = baseStats.map(s => ({
    ...s,
    avgMinutes: s.gamesAttended > 0
      ? Math.round((s.minutesPlayed / s.gamesAttended) * 10) / 10
      : 0,
  }));

  const sorted = [...stats].sort((a, b) => (b[activeTab] as number) - (a[activeTab] as number));

  const chartData = sorted.slice(0, 10).map(s => {
    const player = players.find(p => p.id === s.playerId);
    return {
      name: player?.name.split(' ')[0] ?? '?',
      value: s[activeTab] as number
    };
  });

  const TABS: { key: StatKey; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'goals', label: 'Goals', icon: <Trophy size={14} />, color: '#d97706' },
    { key: 'assists', label: 'Assists', icon: <Zap size={14} />, color: '#2563eb' },
    { key: 'avgMinutes', label: 'Avg Min', icon: <Clock size={14} />, color: '#16a34a' },
    { key: 'plusMinus', label: '+/-', icon: <TrendingUp size={14} />, color: '#7c3aed' },
    { key: 'gamesAttended', label: 'Games', icon: <Users size={14} />, color: '#0891b2' }
  ];

  const activeTabConfig = TABS.find(t => t.key === activeTab)!;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-pitch-700 px-4 pt-12 pb-4 text-white">
        <h1 className="text-xl font-bold">Season Stats</h1>
        <p className="text-pitch-200 text-sm">
          {completedGames.length} games · {practices.length} practices
        </p>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-pitch-700 text-pitch-700'
                  : 'border-transparent text-gray-400'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Chart */}
        {chartData.some(d => d.value !== 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="font-bold mb-3 text-sm text-gray-700">
              Top {activeTabConfig.label}
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? activeTabConfig.color : '#d1d5db'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Leaderboard */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-bold text-sm text-gray-700">Leaderboard</h2>
          </div>
          {sorted.map((s, i) => {
            const player = players.find(p => p.id === s.playerId);
            if (!player) return null;
            const value = s[activeTab] as number;
            const maxVal = sorted[0][activeTab] as number;
            const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;

            return (
              <button
                key={s.playerId}
                onClick={() => navigate(`/player/${s.playerId}`)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 text-left hover:bg-gray-50"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? 'bg-amber-400 text-white' :
                  i === 1 ? 'bg-gray-300 text-white' :
                  i === 2 ? 'bg-amber-700/60 text-white' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm">
                      #{player.number} {player.name}
                    </p>
                    <span className="font-bold text-sm" style={{ color: activeTabConfig.color }}>
                      {activeTab === 'plusMinus' && value > 0 ? '+' : ''}{value}
                      {activeTab === 'avgMinutes' ? 'm/g' : ''}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: activeTabConfig.color }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Season summary card */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold mb-3 text-sm text-gray-700">Team Season Summary</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Goals For', value: completedGames.reduce((s, g) => s + g.score.home, 0) },
              { label: 'Goals Against', value: completedGames.reduce((s, g) => s + g.score.away, 0) },
              { label: 'Avg Attendance', value: completedGames.length > 0
                ? Math.round(completedGames.reduce((s, g) => s + g.attendance.length, 0) / completedGames.length)
                : 0 }
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-pitch-700">{value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
