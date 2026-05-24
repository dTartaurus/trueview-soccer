import { useState } from 'react';
import { Plus, Check, X, Zap, Trash2, ChevronRight } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { generateId, formatDate } from '@/lib/utils';
import type { Practice as PracticeType } from '@/types';
import { format } from 'date-fns';

export const Practice = () => {
  const { players, practices, isCoach, savePractice, deletePractice, settings } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    duration: 60,
    notes: ''
  });
  const [attendance, setAttendance] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const toggleAttendance = (pid: string) =>
    setAttendance(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });

  const handleCreate = async () => {
    const practice: PracticeType = {
      id: generateId(),
      date: form.date,
      attendance: Array.from(attendance),
      drills: [],
      duration: form.duration,
      notes: form.notes,
      createdAt: new Date().toISOString()
    };
    await savePractice(practice);
    setShowForm(false);
    setForm({ date: format(new Date(), 'yyyy-MM-dd'), duration: 60, notes: '' });
    setAttendance(new Set());
  };

  const getAiDrills = async (practice: PracticeType) => {
    setAiLoading(practice.id);
    try {
      const attending = players.filter(p => practice.attendance.includes(p.id));
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'practice',
          data: {
            duration: practice.duration,
            playerCount: attending.length,
            teamName: settings?.teamName ?? 'Our Team',
            notes: practice.notes
          }
        })
      });
      const json = await res.json();
      await savePractice({ ...practice, aiDrills: json.text ?? '' });
    } catch {
      alert('Could not get AI recommendations. Check your internet.');
    } finally {
      setAiLoading(null);
    }
  };

  const sortedPractices = [...practices].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-pitch-700 px-4 pt-12 pb-4 text-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Practices</h1>
          <p className="text-pitch-200 text-sm">{practices.length} sessions</p>
        </div>
        {isCoach && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2 text-sm font-medium"
          >
            <Plus size={18} /> Log Practice
          </button>
        )}
      </div>

      {showForm && isCoach && (
        <div className="m-4 bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold mb-4">Log Practice</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 font-medium">Date</label>
                <input type="date" value={form.date}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="w-28">
                <label className="text-xs text-gray-500 font-medium">Duration (min)</label>
                <input type="number" value={form.duration}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                  onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 60 }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Attendance</label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {[...players].sort((a,b) => a.number - b.number).map(p => (
                  <button key={p.id}
                    onClick={() => toggleAttendance(p.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-colors ${
                      attendance.has(p.id)
                        ? 'bg-pitch-50 border-pitch-300 text-pitch-800'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      attendance.has(p.id) ? 'bg-pitch-700 text-white' : 'bg-gray-200'
                    }`}>
                      {attendance.has(p.id) ? <Check size={10} /> : p.number}
                    </div>
                    {p.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Focus notes (optional)</label>
              <textarea rows={2} value={form.notes}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                placeholder="e.g. Work on pressing, set pieces…"
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 text-gray-600">
                <X size={16} /> Cancel
              </button>
              <button onClick={handleCreate}
                className="flex-1 bg-pitch-700 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1">
                <Check size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {sortedPractices.map(practice => (
          <div key={practice.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center gap-3 p-4 text-left"
              onClick={() => setExpanded(expanded === practice.id ? null : practice.id)}
            >
              <div className="w-12 h-12 bg-pitch-50 rounded-xl flex flex-col items-center justify-center shrink-0">
                <span className="text-pitch-700 font-bold text-lg leading-none">
                  {new Date(practice.date + 'T12:00:00').getDate()}
                </span>
                <span className="text-pitch-600 text-xs uppercase">
                  {format(new Date(practice.date + 'T12:00:00'), 'MMM')}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-semibold">Practice</p>
                <p className="text-sm text-gray-500">
                  {practice.attendance.length} players · {practice.duration} min
                </p>
              </div>
              <ChevronRight size={18} className={`text-gray-400 transition-transform ${expanded === practice.id ? 'rotate-90' : ''}`} />
            </button>

            {expanded === practice.id && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                {/* Attendance */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Present</p>
                  <div className="flex flex-wrap gap-1.5">
                    {players.filter(p => practice.attendance.includes(p.id)).map(p => (
                      <span key={p.id} className="bg-pitch-50 text-pitch-700 text-xs font-medium px-2 py-1 rounded-full">
                        #{p.number} {p.name.split(' ')[0]}
                      </span>
                    ))}
                  </div>
                </div>

                {/* AI Drills */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">AI Drill Plan</p>
                    {isCoach && (
                      <button
                        onClick={() => getAiDrills(practice)}
                        disabled={!!aiLoading}
                        className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded-lg"
                      >
                        <Zap size={12} />
                        {aiLoading === practice.id ? 'Loading…' : 'Generate'}
                      </button>
                    )}
                  </div>
                  {practice.aiDrills ? (
                    <div className="bg-amber-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {practice.aiDrills}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No drill plan yet. Tap Generate to get AI suggestions.</p>
                  )}
                </div>

                {isCoach && (
                  <button
                    onClick={() => { if (confirm('Delete this practice?')) deletePractice(practice.id); }}
                    className="flex items-center gap-1 text-red-400 text-sm"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {practices.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="font-medium">No practices logged yet</p>
          </div>
        )}
      </div>
    </div>
  );
};
