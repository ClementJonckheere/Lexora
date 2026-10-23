import type { Direction } from './types';

export type DirectionMode = 'both' | Direction;

export interface Settings {
  /** Plafond de nouveaux mots introduits par jour. */
  newPerDay: number;
  /** Rétention visée par FSRS (probabilité de se souvenir au moment de la révision). */
  desiredRetention: number;
  /** Intervalle maximal en jours. */
  maximumInterval: number;
  /** Directions révisées. */
  directions: DirectionMode;
  /** Heure de bascule de la journée de révision (0-23). */
  dayStartHour: number;
  /** Légère variation aléatoire des intervalles (évite les paquets de révisions le même jour). */
  enableFuzz: boolean;
  /** Seuil de stabilité FSRS (jours) pour considérer une fiche « maîtrisée ». */
  masteryThresholdDays: number;
  ttsVoice: string;
  ttsRate: number;
  /** Lecture automatique de la prononciation au dévoilement de la réponse. */
  autoSpeak: boolean;
  /** Raccourci système pour ouvrir l'ajout rapide depuis n'importe quelle application ('' = désactivé). */
  globalShortcut: string;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  desiredRetention: 0.9,
  maximumInterval: 3650,
  directions: 'both',
  dayStartHour: 4,
  enableFuzz: true,
  masteryThresholdDays: 21,
  ttsVoice: '',
  ttsRate: 0.95,
  autoSpeak: false,
  globalShortcut: 'Alt+Shift+L',
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Garantit des valeurs cohérentes, quelle que soit la source (base, import). */
export function sanitizeSettings(raw: Partial<Record<keyof Settings, unknown>>): Settings {
  const s = { ...DEFAULT_SETTINGS };
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  s.newPerDay = Math.round(clamp(num(raw.newPerDay, s.newPerDay), 0, 200));
  s.desiredRetention = clamp(num(raw.desiredRetention, s.desiredRetention), 0.7, 0.97);
  s.maximumInterval = Math.round(clamp(num(raw.maximumInterval, s.maximumInterval), 30, 36500));
  s.directions = raw.directions === 'fr_en' || raw.directions === 'en_fr' ? raw.directions : 'both';
  s.dayStartHour = Math.round(clamp(num(raw.dayStartHour, s.dayStartHour), 0, 23));
  s.enableFuzz = typeof raw.enableFuzz === 'boolean' ? raw.enableFuzz : s.enableFuzz;
  s.masteryThresholdDays = Math.round(clamp(num(raw.masteryThresholdDays, s.masteryThresholdDays), 7, 365));
  s.ttsVoice = typeof raw.ttsVoice === 'string' ? raw.ttsVoice : '';
  s.ttsRate = clamp(num(raw.ttsRate, s.ttsRate), 0.5, 1.5);
  s.autoSpeak = typeof raw.autoSpeak === 'boolean' ? raw.autoSpeak : s.autoSpeak;
  s.globalShortcut = typeof raw.globalShortcut === 'string' ? raw.globalShortcut.trim() : s.globalShortcut;
  return s;
}

export function activeDirections(settings: Pick<Settings, 'directions'>): Direction[] {
  return settings.directions === 'both' ? ['fr_en', 'en_fr'] : [settings.directions];
}

/**
 * Direction « principale » : sa fiche nouvelle compte dans le plafond quotidien.
 * Le français → anglais est prioritaire (objectif : parler spontanément).
 */
export function primaryDirection(settings: Pick<Settings, 'directions'>): Direction {
  return settings.directions === 'en_fr' ? 'en_fr' : 'fr_en';
}
