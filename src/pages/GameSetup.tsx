import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Users, Zap, ArrowRight } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { generateId, FORMATIONS } from '@/lib/utils';
import type { GameShift, ShiftPlayer, Position } from '@/types';

export const GameSetup = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { games, players, isCoach, updateGame, settings } = useStore();

  const game = games.find(g => g.id === id);
  const [attendance, setAttendance] = useState<Set<string>>(
    new Set(game?.attendance ?? [])
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string>('');

  if (!game) return <div className="p-8 text-center text-gray-400">Game not found</div>;

  const toggleAttendance = (pid: string) => {
    setAttendance(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const markAllPresent = () => setAttendance(new Set(players.map(p => p.id)));
  const clearAll = () => setAttendance(new Set());

  const saveAttendance = async () => {
    await updateGame(game.id, { attendance: Array.from(attendance) });
  };

  const getAiLineup = async () => {
    setAiLoading(true);
    try {
      const attending = players.filter(p => attendance.has(p.id));
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lineup',
          data: {
            players: attending.map(p => ({
              name: p.name,
              number: p.number,
              positions: p.positions
            })),
            formation: game.formation,
            teamName: settings?.teamName ?? 'Our Team',
            opponent: game.opponent
          }
        })
      });
      const json = await res.json();
      setAiSuggestion(json.text ?? 'No suggestion available');
    } catch {
      setAiSuggestion('Could not connect to AI. Check your internet connection.');
    } finally {
      setAiLoading(false);
    }
  };

  const startGame = async () => {
    await saveAttendance();
    await updateGame(game.id, {
      status: 'first-half',
      timerStartedAt: Date.now(),
      timerElapsed: 0,
      currentHalf: 1
    });
    navigate(`/game/${game.id}`);
  };

  const sortedPlayers = [...players].sort((a, b) => a.number - b.number);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-pitch-700 px-4 pt-12 pb-4 text-white">
        <button onClick={() => navigate('/games')} className="text-pitch-200 text-sm mb-2">
          ← Back to Games
        </button>
        <h1 className="text-xl font-bold">vs {game.opponent}</h1>
        <p className="text-pitch-200 text-sm">
          {game.date} · {game.homeAway === 'home' ? 'Home' : 'Away'} · {game.formation}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Attendance */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2">
              <Users size={18} className="text-pitch-700" />
              Attendance ({attendance.size}/{players.length})
            </h2>
            <div className="flex gap-2">
              <button onClick={markAllPresent} className="text-xs text-pitch-700 font-medium">All</button>
              <span className="text-gray-300">|</span>
              <button onClick={clearAll} className="text-xs text-gray-400 font-medium">Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {sortedPlayers.map(player => {
              const present = attendance.has(player.id);
              return (
                <button
                  key={player.id}
                  onClick={() => toggleAttendance(player.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                    present
                      ? 'bg-pitch-50 border-pitch-300 text-pitch-800'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    present ? 'bg-pitch-700 text-white' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {present ? <Check size={12} /> : player.number}
                  </div>
                  <span className="text-sm font-medium truncate">{player.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI Lineup Suggestion */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2">
              <Zap size={18} className="text-amber-500" />
              AI Lineup Advice
            </h2>
            <button
              onClick={getAiLineup}
              disabled={aiLoading || attendance.size < 7}
              className="bg-amber-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {aiLoading ? 'Thinking…' : 'Get Advice'}
            </button>
          </div>
          {attendance.size < 7 && (
            <p className="text-sm text-gray-400">Mark at least 7 players present to get AI advice.</p>
          )}
          {aiSuggestion && (
            <div className="bg-amber-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
              {aiSuggestion}
            </div>
          )}
        </div>

        {/* Start game button */}
        <button
          onClick={startGame}
          disabled={attendance.size < 7}
          className="w-full bg-pitch-700 text-white rounded-xl py-4 font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform shadow-lg"
        >
          <ArrowRight size={22} />
          Start Game
        </button>

        {game.status !== 'scheduled' && (
          <button
            onClick={() => navigate(`/game/${game.id}`)}
            className="w-full border border-pitch-300 text-pitch-700 rounded-xl py-3 font-semibold text-sm"
          >
            View Live Game →
          </button>
        )}
      </div>
    </div>
  );
};
