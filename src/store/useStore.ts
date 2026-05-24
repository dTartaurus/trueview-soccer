import { create } from 'zustand';
import type { Player, Game, Practice, PlayerSurvey, AppSettings } from '@/types';
import {
  subscribePlayers, subscribeGames, subscribePractices,
  subscribeSurveys, subscribeSettings,
  savePlayer, deletePlayer, saveGame, updateGame, deleteGame,
  savePractice, updatePractice, deletePractice, saveSurvey, saveSettings
} from '@/lib/firebase';
import type { Unsubscribe } from 'firebase/firestore';

interface StoreState {
  // Auth
  isCoach: boolean;
  currentPlayerId: string | null;
  setCoach: (val: boolean) => void;
  setCurrentPlayer: (id: string | null) => void;

  // Data
  players: Player[];
  games: Game[];
  practices: Practice[];
  surveys: PlayerSurvey[];
  settings: AppSettings | null;
  loading: boolean;

  // Subscriptions
  _unsubs: Unsubscribe[];
  initSubscriptions: () => void;
  teardown: () => void;

  // Player actions
  savePlayer: (p: Player) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;

  // Game actions
  saveGame: (g: Game) => Promise<void>;
  updateGame: (id: string, data: Partial<Game>) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;

  // Practice actions
  savePractice: (p: Practice) => Promise<void>;
  updatePractice: (id: string, data: Partial<Practice>) => Promise<void>;
  deletePractice: (id: string) => Promise<void>;

  // Survey actions
  saveSurvey: (s: PlayerSurvey) => Promise<void>;

  // Settings
  saveSettings: (s: AppSettings) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  isCoach: localStorage.getItem('isCoach') === 'true',
  currentPlayerId: localStorage.getItem('currentPlayerId'),
  setCoach: (val) => {
    localStorage.setItem('isCoach', String(val));
    set({ isCoach: val });
  },
  setCurrentPlayer: (id) => {
    if (id) localStorage.setItem('currentPlayerId', id);
    else localStorage.removeItem('currentPlayerId');
    set({ currentPlayerId: id });
  },

  players: [],
  games: [],
  practices: [],
  surveys: [],
  settings: null,
  loading: true,
  _unsubs: [],

  initSubscriptions: () => {
    const unsubs: Unsubscribe[] = [
      subscribePlayers(players => set({ players })),
      subscribeGames(games => set({ games })),
      subscribePractices(practices => set({ practices })),
      subscribeSurveys(surveys => set({ surveys })),
      subscribeSettings(settings => set({ settings, loading: false }))
    ];
    set({ _unsubs: unsubs });
  },

  teardown: () => {
    get()._unsubs.forEach(u => u());
    set({ _unsubs: [] });
  },

  savePlayer: async (p) => { await savePlayer(p); },
  deletePlayer: async (id) => { await deletePlayer(id); },
  saveGame: async (g) => { await saveGame(g); },
  updateGame: async (id, data) => { await updateGame(id, data); },
  deleteGame: async (id) => { await deleteGame(id); },
  savePractice: async (p) => { await savePractice(p); },
  updatePractice: async (id, data) => { await updatePractice(id, data); },
  deletePractice: async (id) => { await deletePractice(id); },
  saveSurvey: async (s) => { await saveSurvey(s); },
  saveSettings: async (s) => { await saveSettings(s); }
}));
