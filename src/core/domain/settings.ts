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
  /** Lecture automatique de la prononciation au dévoilement de la réponse. */
  autoSpeak: boolean;
  /** Français → langue : taper la réponse avant de la dévoiler (vérification automatique). */
  typeAnswer: boolean;
  /** Traduction proposée automatiquement (sélection dans un livre, ajout rapide). */
  autoTranslate: boolean;
  /** Objectif quotidien : nombre de réponses par jour (toutes langues). */
  dailyGoal: number;
  /** Prononciation : enregistrement humain (Wiktionnaire) quand il existe, sinon voix de synthèse. */
  recordedVoice: boolean;
  /** Voix naturelle partagée (fonction « speak », Azure) plutôt que la voix de Windows. */
  naturalVoice: boolean;
  /** Français → langue : une phrase d'exemple à trous au recto (quand la note en a une). */
  clozeFront: boolean;
  /** Ordre des nouveaux mots : les plus fréquents dans la langue d'abord, ou par date d'ajout. */
  newOrder: 'frequency' | 'added';
  /** Version des réglages par défaut appliqués (changements de défaut une seule fois, pour tous). */
  settingsVersion: number;

  /* --- Réglages propres à l'appareil (jamais synchronisés) --- */
  /** Voix choisie par langue (code langue → identifiant de voix du système). */
  ttsVoices: Record<string, string>;
  ttsRate: number;
  /** Raccourci système pour ouvrir l'ajout rapide depuis n'importe quelle application ('' = désactivé). */
  globalShortcut: string;
  /** Le raccourci global pré-remplit l'expression avec le texte copié. */
  clipboardPrefill: boolean;
  /** Fermer la fenêtre la masque dans la zone de notification (l'application reste active). */
  closeToTray: boolean;
  /** Rappel quotidien (notification Windows) s'il reste des révisions. */
  reminderEnabled: boolean;
  /** Heure du rappel, « HH:MM ». */
  reminderTime: string;
  /** Clé d'API DeepL (facultative) : traduction plus fiable, avec le contexte de la phrase. */
  deeplKey: string;
  /** Fond de l'interface : clair, sombre, ou celui de Windows. */
  theme: ThemeMode;
}

export type ThemeMode = 'system' | 'light' | 'dark';

/** Réglages liés au matériel : stockés localement, non synchronisés entre appareils. */
export const DEVICE_KEYS = ['ttsVoices', 'ttsRate', 'globalShortcut', 'clipboardPrefill', 'closeToTray', 'reminderEnabled', 'reminderTime', 'deeplKey', 'theme'] as const satisfies readonly (keyof Settings)[];

/** Version actuelle des réglages par défaut (voir `settingsUpgrade`). */
export const SETTINGS_VERSION = 2;

/**
 * Changements de réglage par défaut à appliquer une seule fois aux réglages déjà enregistrés
 * (sinon une ancienne valeur enregistrée masquerait le nouveau défaut).
 * - v2 : la réponse tapée devient la règle.
 */
export function settingsUpgrade(settings: Settings): Partial<Settings> | null {
  if (settings.settingsVersion >= SETTINGS_VERSION) return null;
  const patch: Partial<Settings> = { settingsVersion: SETTINGS_VERSION };
  if (settings.settingsVersion < 2) patch.typeAnswer = true;
  return patch;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  desiredRetention: 0.9,
  maximumInterval: 3650,
  directions: 'both',
  dayStartHour: 4,
  enableFuzz: true,
  masteryThresholdDays: 21,
  autoSpeak: false,
  typeAnswer: true,
  autoTranslate: true,
  dailyGoal: 20,
  recordedVoice: true,
  naturalVoice: true,
  clozeFront: true,
  newOrder: 'frequency',
  settingsVersion: 0,
  ttsVoices: {},
  ttsRate: 0.95,
  globalShortcut: 'Alt+Shift+L',
  clipboardPrefill: true,
  closeToTray: true,
  reminderEnabled: true,
  reminderTime: '19:00',
  deeplKey: '',
  theme: 'system',
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
  s.ttsVoices =
    raw.ttsVoices && typeof raw.ttsVoices === 'object'
      ? Object.fromEntries(Object.entries(raw.ttsVoices as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
      : {};
  s.ttsRate = clamp(num(raw.ttsRate, s.ttsRate), 0.5, 1.5);
  s.autoSpeak = typeof raw.autoSpeak === 'boolean' ? raw.autoSpeak : s.autoSpeak;
  s.globalShortcut = typeof raw.globalShortcut === 'string' ? raw.globalShortcut.trim() : s.globalShortcut;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  s.typeAnswer = bool(raw.typeAnswer, s.typeAnswer);
  s.autoTranslate = bool(raw.autoTranslate, s.autoTranslate);
  s.dailyGoal = Math.round(clamp(num(raw.dailyGoal, s.dailyGoal), 5, 500));
  s.recordedVoice = bool(raw.recordedVoice, s.recordedVoice);
  s.naturalVoice = bool(raw.naturalVoice, s.naturalVoice);
  s.clozeFront = bool(raw.clozeFront, s.clozeFront);
  s.newOrder = raw.newOrder === 'added' ? 'added' : 'frequency';
  s.settingsVersion = Number.isInteger(raw.settingsVersion) ? (raw.settingsVersion as number) : 0;
  s.clipboardPrefill = bool(raw.clipboardPrefill, s.clipboardPrefill);
  s.closeToTray = bool(raw.closeToTray, s.closeToTray);
  s.reminderEnabled = bool(raw.reminderEnabled, s.reminderEnabled);
  s.reminderTime = typeof raw.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.reminderTime) ? raw.reminderTime : s.reminderTime;
  s.deeplKey = typeof raw.deeplKey === 'string' ? raw.deeplKey.trim() : s.deeplKey;
  s.theme = raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system';
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

/** Réglages appliqués à un univers : son plafond de nouveaux mots, s'il en a un, remplace le réglage général. */
export function settingsFor<T extends Pick<Settings, 'newPerDay'>>(settings: T, universe: { newPerDay: number | null } | null | undefined): T {
  return universe?.newPerDay == null ? settings : { ...settings, newPerDay: universe.newPerDay };
}
