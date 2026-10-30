import { dayKey } from '../domain/dates';

/**
 * Expérience (XP), niveaux et rangs. L'XP récompense l'effort plutôt que le volume : rappeler un mot ancien, taper
 * une réponse, rester concentré longtemps. Tout se recalcule à partir de l'historique déjà enregistré (révisions,
 * entraînement, mots ajoutés, réponses de grammaire, séances de lecture) : rien à stocker ni à synchroniser en plus.
 *
 * Barème :
 * - révision : 4 XP réponse tapée, 2 XP aux boutons, 1 XP pour un oubli (l'effort compte), × ancienneté de la fiche
 *   (×1 pour une fiche nouvelle, jusqu'à ×2 pour une fiche revue après 6 mois) ;
 * - entraînement libre : 1 XP ; grammaire : 5 XP réponse tapée juste, 2 XP choix juste, 1 XP une erreur ;
 * - leçon acquise : 60 XP ; révision de leçon réussie : 25 XP ;
 * - mot ajouté : 3 XP avec un exemple, 1 XP sans, 30 XP par jour au plus ;
 * - verbe irrégulier : 4 XP les deux formes justes (tapées), 1 XP sinon ;
 * - lecture : 2 XP par minute comptée (temps actif, 5 minutes au plus par page tournée), 2 heures par jour au plus ;
 *   livre fini : 50 XP, s'il a été lu au moins une heure (aller à la fin par la table des matières ne suffit pas) ;
 * - concentration : dans une séance sans pause de plus de 2 minutes, ×1,25 après 10 minutes, ×1,5 après 25 ;
 * - anti-abus : la même fiche (ou la même phrase) le même jour rapporte moitié moins à chaque fois.
 */

export type XpEvent =
  | { kind: 'review'; at: number; cardId: string; rating: number; elapsedDays: number; typed: boolean }
  | { kind: 'practice'; at: number; noteId: string; rating: number }
  | { kind: 'note'; at: number; withExample: boolean }
  | { kind: 'grammar'; at: number; itemId: string; correct: boolean; typed: boolean }
  | { kind: 'lesson-mastered'; at: number; lessonId: string }
  | { kind: 'lesson-review'; at: number; lessonId: string; passed: boolean }
  /** Une séance de lecture : minutes comptées (`countedReadingMinutes`). */
  | { kind: 'reading'; at: number; minutes: number }
  | { kind: 'verb'; at: number; verb: string; correct: boolean }
  | { kind: 'book-finished'; at: number; bookKey: string };

export type XpSource = 'vocabulary' | 'grammar' | 'words' | 'lessons' | 'reading';

/** Pause au-delà de laquelle une séance s'arrête (et le bonus de concentration avec). */
export const FOCUS_GAP_MS = 2 * 60_000;
export const FOCUS_STEPS: readonly { afterMin: number; multiplier: number }[] = [
  { afterMin: 25, multiplier: 1.5 },
  { afterMin: 10, multiplier: 1.25 },
];
export const NOTE_XP_PER_DAY = 30;
export const READING_XP_PER_MINUTE = 2;
/** Minutes de lecture comptées par jour au plus. */
export const READING_MINUTES_PER_DAY = 120;
export const BOOK_FINISHED_XP = 50;
/** Lecture mesurée exigée pour le bonus d'un livre fini. */
export const BOOK_FINISHED_MIN_MINUTES = 60;
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

const ACTIVE = new Set<XpEvent['kind']>(['review', 'practice', 'grammar', 'verb']);

/** Multiplicateur de concentration après `minutes` de séance sans pause. */
export function focusMultiplier(minutes: number): number {
  return FOCUS_STEPS.find((s) => minutes >= s.afterMin)?.multiplier ?? 1;
}

/** XP de base d'un événement (avant concentration et anti-abus). */
export function baseXp(e: XpEvent): number {
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
    case 'verb':
      return e.correct ? 4 : 1;
    case 'reading':
      return e.minutes * READING_XP_PER_MINUTE;
    case 'book-finished':
      return BOOK_FINISHED_XP;
  }
}

function source(e: XpEvent): XpSource {
  if (e.kind === 'review' || e.kind === 'practice') return 'vocabulary';
  if (e.kind === 'grammar' || e.kind === 'verb') return 'grammar';
  if (e.kind === 'note') return 'words';
  if (e.kind === 'reading' || e.kind === 'book-finished') return 'reading';
  return 'lessons';
}

function itemKey(e: XpEvent): string | null {
  if (e.kind === 'review') return `c:${e.cardId}`;
  if (e.kind === 'practice') return `p:${e.noteId}`;
  if (e.kind === 'grammar') return `g:${e.itemId}`;
  if (e.kind === 'verb') return `v:${e.verb}`;
  return null;
}

/** Rejoue l'historique dans l'ordre et calcule l'XP, le niveau, le rang et le bilan du jour. */
export function computeXp(events: readonly XpEvent[], now = Date.now()): XpSummary {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const today = dayKey(now);
  const repeats = new Map<string, number>();
  const notesPerDay = new Map<string, number>();
  const readingPerDay = new Map<string, number>();
  const bySource: Record<XpSource, number> = { vocabulary: 0, grammar: 0, words: 0, lessons: 0, reading: 0 };
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
      const multiplier = focusMultiplier(minutes);
      if (multiplier > 1) {
        xp *= multiplier;
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
    if (e.kind === 'reading') {
      const used = readingPerDay.get(day) ?? 0;
      const minutes = Math.max(0, Math.min(e.minutes, READING_MINUTES_PER_DAY - used));
      readingPerDay.set(day, used + minutes);
      xp = minutes * READING_XP_PER_MINUTE;
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
      reading: Math.round(bySource.reading),
    },
  };
}

/**
 * Compteur de concentration d'une séance en cours (pied de page de la révision) : mêmes règles que `computeXp`
 * (pause de plus de 2 minutes, paliers, même fiche divisée par deux), appliquées au fil des réponses.
 */
export class FocusMeter {
  private start = -Infinity;
  private last = -Infinity;
  private repeats = new Map<string, number>();
  /** XP gagnée depuis le début de la séance. */
  gained = 0;

  add(e: XpEvent): number {
    if (e.at - this.last > FOCUS_GAP_MS) this.start = e.at;
    this.last = e.at;
    const key = itemKey(e);
    const n = key ? (this.repeats.get(key) ?? 0) : 0;
    if (key) this.repeats.set(key, n + 1);
    const xp = (baseXp(e) * focusMultiplier((e.at - this.start) / 60_000)) / 2 ** n;
    this.gained += xp;
    return xp;
  }

  /** Minutes de concentration en cours (0 après une pause de plus de 2 minutes) et multiplicateur atteint. */
  state(now = Date.now()): { minutes: number; multiplier: number; gained: number } {
    const minutes = now - this.last > FOCUS_GAP_MS ? 0 : (now - this.start) / 60_000;
    return { minutes: Math.floor(minutes), multiplier: focusMultiplier(minutes), gained: Math.round(this.gained) };
  }
}
