import { dayKey } from '../domain/dates';
import type { LessonReview } from '../learn/review';
import { FOCUS_GAP_MS, type XpEvent } from './xp';

/**
 * Titres : distinctions gagnées par ce qu'on a accompli, un seul affiché à côté du rang (au choix). Comme l'XP, tout
 * se déduit de l'historique (révisions, séances, livres, leçons) ; un titre gagné reste acquis (chaque condition porte
 * sur un record, pas sur l'état du moment).
 */

const DAY = 86_400_000;

export type TitleCategory = 'Lecture' | 'Saisie et vitesse' | 'Grammaire' | 'Mémorisation' | 'Concentration';
export const TITLE_CATEGORIES: readonly TitleCategory[] = ['Lecture', 'Saisie et vitesse', 'Grammaire', 'Mémorisation', 'Concentration'];

export interface Title {
  id: string;
  name: string;
  category: TitleCategory;
  /** Condition, en clair. */
  description: string;
  earned: boolean;
  /** Avancement lisible (« 3 / 4 »), vide une fois le titre gagné. */
  progress: string;
}

export interface TitleData {
  now: number;
  /** Événements d'XP de l'univers (séances, réponses tapées, jours actifs). */
  events: readonly XpEvent[];
  /** Révisions planifiées : fiche, note, réponse, ancienneté et échéance au moment de la révision. */
  reviews: readonly { noteId: string; cardId: string; rating: number; elapsedDays: number; at: number; due: number }[];
  books: readonly { progress: number; level: string | null }[];
  /** Décisions prises dans « Mots du chapitre » (dates). */
  chapterDecisions: readonly number[];
  lessons: readonly LessonReview[];
  /** Bonnes réponses aux exercices de grammaire. */
  grammarCorrect: number;
  /** Ajouts de mots depuis le formulaire : date et durée de saisie. */
  entries: readonly { at: number; durationMs: number }[];
  /** Minutes de lecture comptées (séances de lecture). */
  readingMinutes?: number;
  /** Verbes irréguliers maîtrisés. */
  verbsMastered?: number;
  /** Niveau atteint dans chaque univers. */
  levels: readonly number[];
}

/** Livre terminé (dernière page atteinte, à la marge près). */
export const BOOK_DONE = 0.98;
/** Séance « au clavier » : au moins 10 révisions, 95 % tapées. */
const KEYBOARD_MIN = 10;
const KEYBOARD_SHARE = 0.95;
/** Ajout « éclair » : durée médiane du jour sous 5 secondes. */
const FAST_ENTRY_MS = 5000;
/** Deux décisions de « Mots du chapitre » à plus de 10 minutes d'écart appartiennent à deux chapitres. */
const CHAPTER_GAP = 10 * 60_000;
const CHAPTER_MIN = 3;
/** Une fiche revue plus de 2 jours après son échéance est « en retard ». */
const LATE_MS = 2 * DAY;
/** Rang Argent. */
const SILVER_LEVEL = 10;

interface Session {
  start: number;
  end: number;
  reviews: number;
  typed: number;
}

/** Séances : activités (révision, entraînement, grammaire) à moins de 2 minutes d'écart. */
export function sessionsOf(events: readonly XpEvent[]): Session[] {
  const active = events.filter((e) => e.kind === 'review' || e.kind === 'practice' || e.kind === 'grammar').sort((a, b) => a.at - b.at);
  const out: Session[] = [];
  for (const e of active) {
    let s = out.at(-1);
    if (!s || e.at - s.end > FOCUS_GAP_MS) {
      s = { start: e.at, end: e.at, reviews: 0, typed: 0 };
      out.push(s);
    }
    s.end = e.at;
    if (e.kind === 'review') {
      s.reviews++;
      if (e.typed) s.typed++;
    }
  }
  return out;
}

/** Plus longue suite de jours consécutifs parmi des jours donnés (« AAAA-MM-JJ »). */
function longestRun(days: Iterable<string>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = new Date(`${d}T12:00`).getTime();
    run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/** Plus grand nombre de jours actifs sur une fenêtre glissante de `window` jours. */
function bestWindow(days: Iterable<string>, window: number): number {
  const times = [...new Set(days)].sort().map((d) => new Date(`${d}T12:00`).getTime());
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < times.length; hi++) {
    while (times[hi] - times[lo] >= window * DAY - DAY / 2) lo++;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Plus longue période (en jours) sans laisser une fiche plus de 2 jours en retard, tant qu'on révise. */
function onTimeDays(reviews: TitleData['reviews'], now: number): number {
  const sorted = [...reviews].sort((a, b) => a.at - b.at);
  if (!sorted.length) return 0;
  let best = 0;
  let start = sorted[0].at;
  let last = sorted[0].at;
  for (const r of sorted) {
    // Plus de 2 jours sans réviser : des fiches ont pu prendre du retard sans laisser de trace ; la période s'arrête.
    if (r.at - last > LATE_MS) {
      best = Math.max(best, last - start);
      start = r.at;
    }
    if (r.at - r.due > LATE_MS) {
      best = Math.max(best, r.at - start);
      start = r.at;
    }
    last = r.at;
  }
  best = Math.max(best, Math.min(now, last + LATE_MS) - start);
  return Math.floor(best / DAY);
}

const count = (n: number, goal: number, unit = '') => `${Math.min(n, goal)} / ${goal}${unit}`;

export function computeTitles(d: TitleData): Title[] {
  const sessions = sessionsOf(d.events);
  const finished = d.books.filter((b) => b.progress >= BOOK_DONE);
  const finishedLevels = new Set(finished.map((b) => b.level).filter(Boolean)).size;

  const chapters = (() => {
    const times = [...d.chapterDecisions].sort((a, b) => a - b);
    let n = 0;
    let size = 0;
    let last = -Infinity;
    for (const t of times) {
      if (t - last > CHAPTER_GAP) {
        if (size >= CHAPTER_MIN) n++;
        size = 0;
      }
      size++;
      last = t;
    }
    return n + (size >= CHAPTER_MIN ? 1 : 0);
  })();

  const keyboardSessions = sessions.filter((s) => s.reviews >= KEYBOARD_MIN && s.typed / s.reviews >= KEYBOARD_SHARE).length;

  const entriesByDay = new Map<string, number[]>();
  for (const e of d.entries) entriesByDay.set(dayKey(e.at), [...(entriesByDay.get(dayKey(e.at)) ?? []), e.durationMs]);
  const fastDays = longestRun([...entriesByDay].filter(([, ms]) => median(ms) < FAST_ENTRY_MS).map(([day]) => day));

  const mastered = d.lessons.filter((l) => l.masteredAt !== null).length;
  const held = d.lessons.filter((l) => {
    let run = 0;
    for (const r of l.reviews) {
      run = r.passed ? run + 1 : 0;
      if (run >= 3) return true;
    }
    return false;
  }).length;

  const resilient = (() => {
    const forgotten = new Map<string, number>();
    const back = new Set<string>();
    for (const r of [...d.reviews].sort((a, b) => a.at - b.at)) {
      if (r.rating === 1) {
        if (!forgotten.has(r.cardId)) forgotten.set(r.cardId, r.at);
      } else if (forgotten.has(r.cardId) && dayKey(r.at) !== dayKey(forgotten.get(r.cardId)!)) back.add(r.cardId);
    }
    return back.size;
  })();
  const longMemory = new Set(d.reviews.filter((r) => r.rating >= 2 && r.elapsedDays >= 90).map((r) => r.noteId)).size;
  const onTime = onTimeDays(d.reviews, d.now);

  const activeDays = d.events.filter((e) => e.kind === 'review' || e.kind === 'practice' || e.kind === 'grammar').map((e) => dayKey(e.at));
  const constant = bestWindow(activeDays, 40);
  const deep = sessions.filter((s) => s.end - s.start >= 45 * 60_000).length;
  const focusHours = Math.floor(sessions.reduce((sum, s) => sum + (s.end - s.start), 0) / 3_600_000);
  const silver = d.levels.filter((l) => l >= SILVER_LEVEL).length;
  const readingHours = Math.floor((d.readingMinutes ?? 0) / 60);
  const verbs = d.verbsMastered ?? 0;

  const t = (id: string, name: string, category: TitleCategory, description: string, earned: boolean, progress: string): Title => ({
    id,
    name,
    category,
    description,
    earned,
    progress: earned ? '' : progress,
  });
  return [
    t('tourne-page', 'Tourne-page', 'Lecture', 'Finir un premier livre', finished.length >= 1, count(finished.length, 1)),
    t('collectionneur', 'Collectionneur de mondes', 'Lecture', 'Finir des livres de 4 niveaux différents', finishedLevels >= 4, count(finishedLevels, 4)),
    t('pilleur', 'Pilleur de chapitres', 'Lecture', 'Passer en revue les mots de 20 chapitres', chapters >= 20, count(chapters, 20)),
    t('grand-lecteur', 'Grand lecteur', 'Lecture', 'Finir 10 livres', finished.length >= 10, count(finished.length, 10)),
    t('rat-bibliotheque', 'Rat de bibliothèque', 'Lecture', '25 heures de lecture', readingHours >= 25, count(readingHours, 25, ' h')),
    t('archiviste', "Archiviste de l'instant", 'Saisie et vitesse', 'Ajouter ses mots en moins de 5 s, 7 jours de suite', fastDays >= 7, count(fastDays, 7, ' jours')),
    t('dactylographe', 'Dactylographe éclair', 'Saisie et vitesse', '30 séances menées à 95 % au clavier', keyboardSessions >= 30, count(keyboardSessions, 30)),
    t(
      'architecte',
      'Architecte de la phrase',
      'Grammaire',
      '10 leçons acquises et 500 exercices justes',
      mastered >= 10 && d.grammarCorrect >= 500,
      `${count(mastered, 10)} leçons · ${count(d.grammarCorrect, 500)}`,
    ),
    t('gardien', 'Gardien des règles', 'Grammaire', '10 leçons réussies sur 3 révisions de suite', held >= 10, count(held, 10)),
    t('dompteur', "Dompteur d'irréguliers", 'Grammaire', '100 verbes irréguliers maîtrisés', verbs >= 100, count(verbs, 100)),
    t('resilient', 'Résilient', 'Mémorisation', '50 fiches oubliées, puis retrouvées un autre jour', resilient >= 50, count(resilient, 50)),
    t('stratege', 'Stratège du temps', 'Mémorisation', '90 jours sans laisser une fiche plus de 2 jours en retard', onTime >= 90, count(onTime, 90, ' jours')),
    t('memoire-longue', 'Mémoire longue', 'Mémorisation', '500 mots retrouvés après plus de 3 mois', longMemory >= 500, count(longMemory, 500)),
    t('constant', 'Constant', 'Concentration', '30 jours de pratique sur 40', constant >= 30, count(constant, 30, ' jours')),
    t('plongeur', 'Plongeur', 'Concentration', '10 séances de 45 min sans pause', deep >= 10, count(deep, 10)),
    t('ascete', 'Ascète', 'Concentration', '100 heures de séances sans pause', focusHours >= 100, count(focusHours, 100, ' h')),
    t('polyglotte', 'Polyglotte', 'Concentration', 'Deux langues au rang Argent', silver >= 2, count(silver, 2)),
  ];
}

/** Titre affiché : celui choisi s'il est gagné, sinon le premier gagné ; « aucun » pour n'en afficher aucun. */
export function displayedTitle(titles: readonly Title[], chosen: string | undefined): Title | null {
  if (chosen === 'none') return null;
  const earned = titles.filter((t) => t.earned);
  return earned.find((t) => t.id === chosen) ?? earned[0] ?? null;
}
