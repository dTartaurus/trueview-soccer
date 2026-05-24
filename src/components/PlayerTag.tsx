import type { Player } from '@/types';

interface Props {
  player: Player;
  position?: string;
  minutesPlayed?: number;
  isOnField?: boolean;
  selected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const PlayerTag = ({
  player, position, minutesPlayed, isOnField, selected, onClick, size = 'md'
}: Props) => {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        flex items-center gap-2 rounded-lg border transition-all
        ${sizeClasses[size]}
        ${selected
          ? 'bg-pitch-700 text-white border-pitch-700'
          : isOnField
            ? 'bg-pitch-50 text-pitch-800 border-pitch-300'
            : 'bg-white text-gray-700 border-gray-200'
        }
        ${onClick ? 'active:scale-95 cursor-pointer' : 'cursor-default'}
      `}
    >
      <span className={`font-bold ${size === 'sm' ? 'w-5 text-center' : 'w-7 text-center'}`}>
        #{player.number}
      </span>
      <span className="font-medium truncate">{player.name}</span>
      {position && (
        <span className={`
          text-xs font-semibold px-1.5 py-0.5 rounded
          ${selected ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}
        `}>
          {position}
        </span>
      )}
      {minutesPlayed !== undefined && (
        <span className="ml-auto text-xs opacity-70">{minutesPlayed}m</span>
      )}
    </button>
  );
};
