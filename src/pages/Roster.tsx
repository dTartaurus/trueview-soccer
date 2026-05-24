import { useState } from 'react';
import { UserPlus, Edit2, Trash2, ChevronRight, X, Check, Users } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';
import { generateId } from '@/lib/utils';
import type { Player, Position } from '@/types';

const POSITIONS: Position[] = [
  'GK', 'CB', 'LCB', 'RCB', 'LB', 'RB',
  'CDM', 'CM', 'LCM', 'RCM', 'CAM', 'LM', 'RM',
  'LW', 'RW', 'ST', 'CF'
];

const defaultPlayer = (): Omit<Player, 'id' | 'createdAt'> => ({
  name: '', number: 0, positions: []
});

export const Roster = () => {
  const { players, isCoach, savePlayer, deletePlayer } = useStore();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Player | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(defaultPlayer());

  const openNew = () => {
    setForm(defaultPlayer());
    setIsNew(true);
    setEditing(null);
  };

  const openEdit = (p: Player) => {
    setForm({ name: p.name, number: p.number, positions: [...p.positions] });
    setEditing(p);
    setIsNew(false);
  };

  const togglePosition = (pos: Position) => {
    setForm(f => ({
      ...f,
      positions: f.positions.includes(pos)
        ? f.positions.filter(p => p !== pos)
        : [...f.positions, pos]
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.number <= 0) return;
    const player: Player = editing
      ? { ...editing, ...form }
      : { id: generateId(), createdAt: new Date().toISOString(), ...form };
    await savePlayer(player);
    setEditing(null);
    setIsNew(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this player from the roster?')) return;
    await deletePlayer(id);
  };

  const sorted = [...players].sort((a, b) => a.number - b.number);
  const showForm = isNew || editing !== null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-pitch-700 px-4 pt-12 pb-4 text-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Roster</h1>
          <p className="text-pitch-200 text-sm">{players.length} players</p>
        </div>
        {isCoach && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2 text-sm font-medium active:bg-white/30"
          >
            <UserPlus size={18} />
            Add Player
          </button>
        )}
      </div>

      {/* Add/Edit form */}
      {showForm && isCoach && (
        <div className="m-4 bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-4">
            {isNew ? 'Add Player' : 'Edit Player'}
          </h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                placeholder="Full name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <input
                type="number"
                className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500"
                placeholder="#"
                value={form.number || ''}
                onChange={e => setForm(f => ({ ...f, number: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Preferred Positions</p>
              <div className="flex flex-wrap gap-1.5">
                {POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => togglePosition(pos)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      form.positions.includes(pos)
                        ? 'bg-pitch-700 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setEditing(null); setIsNew(false); }}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 flex items-center justify-center gap-1"
              >
                <X size={16} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || form.number <= 0}
                className="flex-1 bg-pitch-700 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <Check size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="p-4 space-y-2">
        {sorted.map(player => (
          <div
            key={player.id}
            className="bg-white rounded-xl flex items-center gap-3 p-3 shadow-sm"
          >
            <div className="w-10 h-10 bg-pitch-700 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">#{player.number}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{player.name}</p>
              <p className="text-xs text-gray-500">
                {player.positions.length > 0
                  ? player.positions.join(' · ')
                  : 'No positions set'}
              </p>
            </div>
            {isCoach ? (
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(player)}
                  className="p-2 text-gray-400 hover:text-pitch-700"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(player.id)}
                  className="p-2 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate(`/player/${player.id}`)}
                className="p-2 text-gray-400"
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        ))}
        {players.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Users size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No players yet</p>
            {isCoach && <p className="text-sm mt-1">Tap "Add Player" to get started</p>}
          </div>
        )}
      </div>
    </div>
  );
};

