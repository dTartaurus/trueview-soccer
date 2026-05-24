/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  enableIndexedDbPersistence,
  type Unsubscribe
} from 'firebase/firestore';
import type { Game, Player, Practice, PlayerSurvey, AppSettings } from '@/types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch(() => {
  // Silently fail — multiple tabs open or private browsing
});

// ─── Players ──────────────────────────────────────────────────────────────────
export const playersRef = () => collection(db, 'players');
export const playerRef = (id: string) => doc(db, 'players', id);

export const savePlayers = async (players: Player[]) => {
  await Promise.all(players.map(p => setDoc(playerRef(p.id), p)));
};

export const savePlayer = async (player: Player) => {
  await setDoc(playerRef(player.id), player);
};

export const deletePlayer = async (id: string) => {
  await deleteDoc(playerRef(id));
};

export const subscribePlayers = (cb: (players: Player[]) => void): Unsubscribe => {
  const q = query(playersRef(), orderBy('number'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => d.data() as Player)));
};

// ─── Games ────────────────────────────────────────────────────────────────────
export const gamesRef = () => collection(db, 'games');
export const gameRef = (id: string) => doc(db, 'games', id);

export const saveGame = async (game: Game) => {
  await setDoc(gameRef(game.id), game);
};

export const updateGame = async (id: string, data: Partial<Game>) => {
  await updateDoc(gameRef(id), data as Record<string, unknown>);
};

export const deleteGame = async (id: string) => {
  await deleteDoc(gameRef(id));
};

export const subscribeGames = (cb: (games: Game[]) => void): Unsubscribe => {
  const q = query(gamesRef(), orderBy('date', 'desc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => d.data() as Game)));
};

export const subscribeGame = (id: string, cb: (game: Game | null) => void): Unsubscribe => {
  return onSnapshot(gameRef(id), snap =>
    cb(snap.exists() ? (snap.data() as Game) : null)
  );
};

// ─── Practices ────────────────────────────────────────────────────────────────
export const practicesRef = () => collection(db, 'practices');
export const practiceRef = (id: string) => doc(db, 'practices', id);

export const savePractice = async (practice: Practice) => {
  await setDoc(practiceRef(practice.id), practice);
};

export const updatePractice = async (id: string, data: Partial<Practice>) => {
  await updateDoc(practiceRef(id), data as Record<string, unknown>);
};

export const deletePractice = async (id: string) => {
  await deleteDoc(practiceRef(id));
};

export const subscribePractices = (cb: (practices: Practice[]) => void): Unsubscribe => {
  const q = query(practicesRef(), orderBy('date', 'desc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => d.data() as Practice)));
};

// ─── Surveys ─────────────────────────────────────────────────────────────────
export const surveysRef = () => collection(db, 'surveys');
export const surveyRef = (id: string) => doc(db, 'surveys', id);

export const saveSurvey = async (survey: PlayerSurvey) => {
  await setDoc(surveyRef(survey.id), survey);
};

export const subscribeSurveys = (cb: (surveys: PlayerSurvey[]) => void): Unsubscribe => {
  return onSnapshot(surveysRef(), snap =>
    cb(snap.docs.map(d => d.data() as PlayerSurvey))
  );
};

// ─── Settings ────────────────────────────────────────────────────────────────
export const settingsRef = () => doc(db, 'config', 'settings');

export const saveSettings = async (settings: AppSettings) => {
  await setDoc(settingsRef(), settings);
};

export const getSettings = async (): Promise<AppSettings | null> => {
  const snap = await getDoc(settingsRef());
  return snap.exists() ? (snap.data() as AppSettings) : null;
};

export const subscribeSettings = (cb: (s: AppSettings | null) => void): Unsubscribe => {
  return onSnapshot(settingsRef(), snap =>
    cb(snap.exists() ? (snap.data() as AppSettings) : null)
  );
};

export {
  getDocs,
  collection,
  onSnapshot,
  type Unsubscribe
};
