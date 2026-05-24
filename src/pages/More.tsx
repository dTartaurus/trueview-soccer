import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Dumbbell, Zap, ChevronRight, Check, Lock, UserCircle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { hashPin } from '@/lib/utils';
import type { AppSettings } from '@/types';

export const More = () => {
  const navigate = useNavigate();
  const { isCoach, setCoach, currentPlayerId, setCurrentPlayer, players, settings, saveSettings } = useStore();
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showSetup, setShowSetup] = useState(!settings?.setupComplete);
  const [setupForm, setSetupForm] = useState<Partial<AppSettings>>({
    teamName: settings?.teamName ?? '',
    coachPin: settings?.coachPin ?? '',
    seasonYear: settings?.seasonYear ?? new Date().getFullYear()
  });
  const [newPin, setNewPin] = useState('');

  const handleCoachLogin = async () => {
    if (!settings?.coachPin) return;
    const hashed = await hashPin(pinInput);
    if (hashed === settings.coachPin) {
      setCoach(true);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('Incorrect PIN');
    }
  };

  const handleSetup = async () => {
    if (!setupForm.teamName?.trim() || !newPin) return;
    const coachPin = await hashPin(newPin);
    await saveSettings({
      teamName: setupForm.teamName.trim(),
      coachPin,
      seasonYear: setupForm.seasonYear ?? new Date().getFullYear(),
      setupComplete: true
    });
    setCoach(true);
    setShowSetup(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-pitch-700 px-4 pt-12 pb-4 text-white">
        <h1 className="text-xl font-bold">More</h1>
        <p className="text-pitch-200 text-sm">{settings?.teamName ?? 'Trueview Soccer'}</p>
      </div>

      {/* First-time setup */}
      {showSetup && !settings?.setupComplete && (
        <div className="m-4 bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-1">Welcome! Set up your team</h2>
          <p className="text-sm text-gray-500 mb-4">This only needs to be done once by the coach.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">Team Name</label>
              <input
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                placeholder="e.g. Lightning FC"
                value={setupForm.teamName ?? ''}
                onChange={e => setSetupForm(f => ({ ...f, teamName: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Coach PIN (4 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                placeholder="e.g. 1234"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button
              onClick={handleSetup}
              disabled={!setupForm.teamName?.trim() || newPin.length < 4}
              className="w-full bg-pitch-700 text-white rounded-xl py-3 font-semibold disabled:opacity-50"
            >
              Complete Setup
            </button>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Player identity */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <UserCircle size={18} className="text-pitch-600" /> I am a Player
          </h2>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={currentPlayerId ?? ''}
            onChange={e => setCurrentPlayer(e.target.value || null)}
          >
            <option value="">— Select your name —</option>
            {[...players].sort((a, b) => a.number - b.number).map(p => (
              <option key={p.id} value={p.id}>#{p.number} {p.name}</option>
            ))}
          </select>
          {currentPlayerId && (
            <button
              onClick={() => navigate(`/player/${currentPlayerId}`)}
              className="mt-3 w-full flex items-center justify-between text-pitch-700 text-sm font-medium"
            >
              View my stats <ChevronRight size={16} />
            </button>
          )}
        </div>

        {/* Coach section */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Shield size={18} className="text-pitch-600" />
            {isCoach ? 'Coach Mode Active' : 'Coach Login'}
          </h2>
          {isCoach ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-pitch-700 text-sm">
                <Check size={16} /> Logged in as Coach
              </div>
              <button
                onClick={() => setCoach(false)}
                className="text-sm text-red-500 font-medium"
              >
                Log out of coach mode
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                placeholder="Enter 4-digit coach PIN"
                value={pinInput}
                onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCoachLogin()}
              />
              {pinError && <p className="text-xs text-red-500">{pinError}</p>}
              <button
                onClick={handleCoachLogin}
                disabled={pinInput.length < 4}
                className="w-full bg-pitch-700 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
              >
                <Lock size={14} className="inline mr-1" /> Unlock Coach Mode
              </button>
            </div>
          )}
        </div>

        {/* Quick links */}
        {[
          { to: '/practice', label: 'Practice Log', icon: <Dumbbell size={18} />, coachOnly: false },
          { to: '/ai', label: 'AI Coach', icon: <Zap size={18} />, coachOnly: false },
          { to: '/roster', label: 'Manage Roster', icon: <Users size={18} />, coachOnly: true }
        ].filter(item => !item.coachOnly || isCoach).map(item => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 text-left active:scale-95"
          >
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
              {item.icon}
            </div>
            <span className="font-medium text-gray-800">{item.label}</span>
            <ChevronRight size={18} className="ml-auto text-gray-400" />
          </button>
        ))}

        {/* App info */}
        <div className="text-center py-4">
          <p className="text-xs text-gray-400">Trueview Soccer v1.0</p>
          <p className="text-xs text-gray-400 mt-0.5">Powered by Claude AI</p>
        </div>
      </div>
    </div>
  );
};
