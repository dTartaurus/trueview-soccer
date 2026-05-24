import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Check, ArrowLeft } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { generateId } from '@/lib/utils';

const StarRating = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
  <div>
    <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            n <= value ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-400'
          }`}
        >
          <Star size={18} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  </div>
);

export const Survey = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { games, players, currentPlayerId, surveys, saveSurvey } = useStore();

  const game = games.find(g => g.id === gameId);
  const player = players.find(p => p.id === currentPlayerId);
  const alreadyDone = surveys.some(s => s.gameId === gameId && s.playerId === currentPlayerId);

  const [form, setForm] = useState({
    overallRating: 0,
    effortRating: 0,
    teamworkRating: 0,
    funRating: 0,
    highlight: '',
    improvement: ''
  });
  const [submitted, setSubmitted] = useState(false);

  if (!game) return <div className="p-8 text-center text-gray-400">Game not found</div>;

  if (alreadyDone || submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-pitch-100 rounded-full flex items-center justify-center mb-4">
          <Check size={40} className="text-pitch-700" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Thanks!</h2>
        <p className="text-gray-500 mb-6">Your reflection for vs {game.opponent} has been saved.</p>
        <button
          onClick={() => navigate('/')}
          className="bg-pitch-700 text-white px-6 py-3 rounded-xl font-semibold"
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (!currentPlayerId || !player) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-gray-500 mb-4">Please select your name in Settings before completing a survey.</p>
        <button onClick={() => navigate('/more')} className="bg-pitch-700 text-white px-6 py-3 rounded-xl font-semibold">
          Go to Settings
        </button>
      </div>
    );
  }

  const canSubmit = form.overallRating > 0 && form.effortRating > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const survey = {
      id: `${gameId}_${currentPlayerId}`,
      playerId: currentPlayerId,
      gameId: gameId!,
      submittedAt: new Date().toISOString(),
      ...form
    };
    await saveSurvey(survey);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-pitch-700 px-4 pt-12 pb-6 text-white">
        <button onClick={() => navigate(-1)} className="text-pitch-200 text-sm mb-3 flex items-center gap-1">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-bold">Game Reflection</h1>
        <p className="text-pitch-200 text-sm">vs {game.opponent} · {player.name}</p>
      </div>

      <div className="p-4 space-y-6">
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-5">
          <StarRating
            label="How did you play overall?"
            value={form.overallRating}
            onChange={v => setForm(f => ({ ...f, overallRating: v }))}
          />
          <StarRating
            label="How hard did you work / effort?"
            value={form.effortRating}
            onChange={v => setForm(f => ({ ...f, effortRating: v }))}
          />
          <StarRating
            label="How well did the team work together?"
            value={form.teamworkRating}
            onChange={v => setForm(f => ({ ...f, teamworkRating: v }))}
          />
          <StarRating
            label="How much fun did you have?"
            value={form.funRating}
            onChange={v => setForm(f => ({ ...f, funRating: v }))}
          />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              What was your best moment this game?
            </label>
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
              placeholder="e.g. Made a great tackle in the second half…"
              value={form.highlight}
              onChange={e => setForm(f => ({ ...f, highlight: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              What's one thing you want to improve?
            </label>
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
              placeholder="e.g. First touch when receiving the ball…"
              value={form.improvement}
              onChange={e => setForm(f => ({ ...f, improvement: e.target.value }))}
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full bg-pitch-700 text-white rounded-xl py-4 font-bold text-lg disabled:opacity-50 active:scale-95 transition-transform"
        >
          Submit Reflection
        </button>
      </div>
    </div>
  );
};
