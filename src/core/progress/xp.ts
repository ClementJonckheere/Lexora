import { dayKey } from '../domain/dates';

/**
 * Expérience (XP), niveaux et rangs. L'XP récompense l'effort plutôt que le volume : rappeler un mot ancien, taper
 * une réponse, rester concentré longtemps. Tout se recalcule à partir de l'historique déjà enregistré (révisions,
 * entraînement, mots ajoutés, réponses de grammaire) : rien à stocker ni à synchroniser en plus.
 *
 * Barème :
 * - révision : 4 XP réponse tapée, 2 XP aux boutons, 1 XP pour un oubli (l'effort compte), × ancienneté de la fiche
 *   (×1 pour une fiche nouvelle, jusqu'à ×2 pour une fiche revue après 6 mois) ;
 * - entraînement libre : 1 XP ; grammaire : 5 XP réponse tapée juste, 2 XP choix juste, 1 XP une erreur ;
 * - leçon acquise : 60 XP ; révision de leçon réussie : 25 XP ;
 * - mot ajouté : 3 XP avec un exemple, 1 XP sans, 30 XP par jour au plus ;
 * - concentration : dans une séance sans pause de plus de 2 minutes, ×1,25 après 10 minutes, ×1,5 après 25 ;
 * - anti-abus : la même fiche (ou la même phrase) le même jour rapporte moitié moins à chaque fois.
 */

export type XpEvent =
  | { kind: 'review'; at: number; cardId: string; rating: number; elapsedDays: number; typed: boolean }
  | { kind: 'practice'; at: number; noteId: string; rating: number }
  | { kind: 'note'; at: number; withExample: boolean }
  | { kind: 'grammar'; at: number; itemId: string; correct: boolean; typed: boolean }
  | { kind: 'lesson-mastered'; at: number; lessonId: string }
  | { kind: 'lesson-review'; at: number; lessonId: string; passed: boolean };

export type XpSource = 'vocabulary' | 'grammar' | 'words' | 'lessons';

/** Pause au-delà de laquelle une séance s'arrête (et le bonus de concentration avec). */
export const FOCUS_GAP_MS = 2 * 60_000;
export const FOCUS_STEPS: readonly { afterMin: number; multiplier: number }[] = [
  { afterMin: 25, multiplier: 1.5 },
  { afterMin: 10, multiplier: 1.25 },
];
export const NOTE_XP_PER_DAY = 30;
/** Ancienneté donnant le facteur ×2 (6 mois). */
const SENIORITY_FULL_DAYS = 180;

/** Facteur d'ancienneté : ×1 pour une fiche revue le jour même, ×2 au-delà de 6 mois (échelle logarithmique). */
export function seniority(elapsedDays: number): number {
  const d = Math.max(0, elapsedDays);
  return 1 + Math.min(1, Math.log2(1 + d) / Math.log2(1 + SENIORITY_FULL_DAYS));
}

/** XP nécessaire pour passer du niveau n au niveau n + 1. */
export function xpToNext(level: number): number {
  return Math.round(120 * level ** 1.4);
}

export interface LevelInfo {
  level: number;
  /** XP déjà gagnée dans le niveau, et XP à gagner pour le suivant. */
  into: number;
  needed: number;
}

export function levelFor(total: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, total);
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, needed: xpToNext(level) };
}

export interface Rank {
  id: 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'emerald' | 'master' | 'grandmaster';
  name: string;
  /** Premier niveau du rang. */
  from: number;
}

export const RANKS: readonly Rank[] = [
  { id: 'iron', name: 'Fer', from: 1 },
  { id: 'bronze', name: 'Bronze', from: 5 },
  { id: 'silver', name: 'Argent', from: 10 },
  { id: 'gold', name: 'Or', from: 15 },
  { id: 'platinum', name: 'Platine', from: 20 },
  { id: 'diamond', name: 'Diamant', from: 30 },
  { id: 'emerald', name: 'Émeraude', from: 40 },
  { id: 'master', name: 'Maître', from: 50 },
  { id: 'grandmaster', name: 'Grand Maître', from: 75 },
];

export function rankFor(level: number): Rank {
  return [...RANKS].reverse().find((r) => level >= r.from) ?? RANKS[0];
}

/** Rang suivant (null au sommet). */
export function nextRank(level: number): Rank | null {
  return RANKS.find((r) => r.from > level) ?? null;
}

export interface XpSummary extends LevelInfo {
  total: number;
  rank: Rank;
  next: Rank | null;
  today: number;
  /** Part de l'XP du jour gagnée avec un bonus de concentration. */
  todayFocusShare: number;
  /** Plus longue séance concentrée du jour, en minutes. */
  todayFocusMinutes: number;
  bySource: Record<XpSource, number>;
}

const ACTIVE = new Set<XpEvent['kind']>(['review', 'practice', 'grammar']);

/** XP de base d'un événement (avant concentration et anti-abus). */
function baseXp(e: XpEvent): number {
  switch (e.kind) {
    case 'review':
      return (e.rating === 1 ? 1 : e.typed ? 4 : 2) * seniority(e.elapsedDays);
    case 'practice':
      return 1;
    case 'grammar':
      return e.correct ? (e.typed ? 5 : 2) : 1;
    case 'note':
      return e.withExample ? 3 : 1;
    case 'lesson-mastered':
      return 60;
    case 'lesson-review':
      return e.passed ? 25 : 0;
  }
}

function source(e: XpEvent): XpSource {
  if (e.kind === 'review' || e.kind === 'practice') return 'vocabulary';
  if (e.kind === 'grammar') return 'grammar';
  if (e.kind === 'note') return 'words';
  return 'lessons';
}

function itemKey(e: XpEvent): string | null {
  if (e.kind === 'review') return `c:${e.cardId}`;
  if (e.kind === 'practice') return `p:${e.noteId}`;
  if (e.kind === 'grammar') return `g:${e.itemId}`;
  return null;
}

/** Rejoue l'historique dans l'ordre et calcule l'XP, le niveau, le rang et le bilan du jour. */
export function computeXp(events: readonly XpEvent[], now = Date.now()): XpSummary {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const today = dayKey(now);
  const repeats = new Map<string, number>();
  const notesPerDay = new Map<string, number>();
  const bySource: Record<XpSource, number> = { vocabulary: 0, grammar: 0, words: 0, lessons: 0 };
  let total = 0;
  let todayXp = 0;
  let todayFocus = 0;
  let todayFocusMinutes = 0;
  let sessionStart = -Infinity;
  let lastActive = -Infinity;

  for (const e of sorted) {
    const day = dayKey(e.at);
    let xp = baseXp(e);
    let focused = false;
    if (ACTIVE.has(e.kind)) {
      if (e.at - lastActive > FOCUS_GAP_MS) sessionStart = e.at;
      lastActive = e.at;
      const minutes = (e.at - sessionStart) / 60_000;
      const step = FOCUS_STEPS.find((s) => minutes >= s.afterMin);
      if (step) {
        xp *= step.multiplier;
        focused = true;
      }
      if (day === today) todayFocusMinutes = Math.max(todayFocusMinutes, minutes);
      const key = itemKey(e);
      if (key) {
        const k = `${day}|${key}`;
        const n = repeats.get(k) ?? 0;
        repeats.set(k, n + 1);
        xp /= 2 ** n;
      }
    }
    if (e.kind === 'note') {
      const used = notesPerDay.get(day) ?? 0;
      xp = Math.max(0, Math.min(xp, NOTE_XP_PER_DAY - used));
      notesPerDay.set(day, used + xp);
    }
    total += xp;
    bySource[source(e)] += xp;
    if (day === today) {
      todayXp += xp;
      if (focused) todayFocus += xp;
    }
  }

  const rounded = Math.floor(total);
  const lvl = levelFor(rounded);
  return {
    ...lvl,
    total: rounded,
    rank: rankFor(lvl.level),
    next: nextRank(lvl.level),
    today: Math.round(todayXp),
    todayFocusShare: todayXp > 0 ? todayFocus / todayXp : 0,
    todayFocusMinutes: Math.floor(todayFocusMinutes),
    bySource: {
      vocabulary: Math.round(bySource.vocabulary),
      grammar: Math.round(bySource.grammar),
      words: Math.round(bySource.words),
      lessons: Math.round(bySource.lessons),
    },
  };
}
