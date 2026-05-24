import type { GameShift, Player } from '@/types';

// Normalized field positions for each slot in common formations
// x: 0 (left) to 100 (right), y: 0 (top/opponent goal) to 100 (bottom/own goal)
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
  GK:  { x: 50, y: 92 },
  LB:  { x: 15, y: 75 }, RB: { x: 85, y: 75 },
  LCB: { x: 33, y: 80 }, RCB: { x: 67, y: 80 }, CB: { x: 50, y: 80 },
  LWB: { x: 10, y: 65 }, RWB: { x: 90, y: 65 },
  CDM: { x: 50, y: 62 },
  LCM: { x: 28, y: 55 }, CM:  { x: 50, y: 55 }, RCM: { x: 72, y: 55 },
  LM:  { x: 12, y: 55 }, RM:  { x: 88, y: 55 },
  CAM: { x: 50, y: 42 },
  LW:  { x: 15, y: 30 }, RW:  { x: 85, y: 30 },
  SS:  { x: 35, y: 25 },
  CF:  { x: 65, y: 18 }, ST:  { x: 50, y: 15 },
};

interface Props {
  shift: GameShift;
  players: Player[];
  onPlayerClick?: (playerId: string) => void;
}

export const FormationField = ({ shift, players, onPlayerClick }: Props) => {
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

  return (
    <div className="relative w-full bg-pitch-700 rounded-xl overflow-hidden select-none"
         style={{ paddingBottom: '140%' }}>
      {/* Field markings */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Center line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/30" />
        {/* Center circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-white/30" />
        {/* Center dot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white/50 rounded-full" />
        {/* Top penalty area */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2 w-2/5 h-[15%] border border-white/30" />
        {/* Bottom penalty area */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-2/5 h-[15%] border border-white/30" />
      </div>

      {/* Players */}
      {shift.players.map(({ playerId, position }) => {
        const coords = POSITION_COORDS[position] ?? { x: 50, y: 50 };
        const player = playerMap[playerId];
        if (!player) return null;

        return (
          <button
            key={playerId}
            onClick={() => onPlayerClick?.(playerId)}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 active:scale-110 transition-transform"
            style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
          >
            <div className="w-8 h-8 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center shadow-lg">
              <span className="text-xs font-bold text-gray-900">{player.number}</span>
            </div>
            <span className="text-white text-xs font-semibold drop-shadow px-1 rounded"
                  style={{ fontSize: '0.6rem', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              {player.name.split(' ')[0]}
            </span>
            <span className="text-white/80 font-medium"
                  style={{ fontSize: '0.55rem' }}>
              {position}
            </span>
          </button>
        );
      })}
    </div>
  );
};
