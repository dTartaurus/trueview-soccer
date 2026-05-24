import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Home } from '@/pages/Home';
import { Roster } from '@/pages/Roster';
import { Games } from '@/pages/Games';
import { GameSetup } from '@/pages/GameSetup';
import { GameActive } from '@/pages/GameActive';
import { Practice } from '@/pages/Practice';
import { SeasonStats } from '@/pages/SeasonStats';
import { PlayerProfile } from '@/pages/PlayerProfile';
import { Survey } from '@/pages/Survey';
import { AICoach } from '@/pages/AICoach';
import { More } from '@/pages/More';
import { useStore } from '@/store/useStore';

export default function App() {
  const { initSubscriptions, teardown, loading } = useStore();

  useEffect(() => {
    initSubscriptions();
    return teardown;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pitch-700">
        <div className="text-center text-white">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="font-semibold text-lg">Trueview Soccer</p>
          <p className="text-pitch-200 text-sm mt-1">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Pages with bottom nav */}
        <Route path="/" element={<Layout><Home /></Layout>} />
        <Route path="/roster" element={<Layout><Roster /></Layout>} />
        <Route path="/games" element={<Layout><Games /></Layout>} />
        <Route path="/stats" element={<Layout><SeasonStats /></Layout>} />
        <Route path="/more" element={<Layout><More /></Layout>} />
        <Route path="/practice" element={<Layout><Practice /></Layout>} />
        <Route path="/ai" element={<Layout><AICoach /></Layout>} />
        <Route path="/player/:id" element={<Layout><PlayerProfile /></Layout>} />
        <Route path="/survey/:gameId" element={<Layout><Survey /></Layout>} />

        {/* Game routes — full-screen, no bottom nav */}
        <Route path="/game/:id/setup" element={<GameSetup />} />
        <Route path="/game/:id" element={<GameActive />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
