import { State } from 'ts-fsrs';
import { activeDirections, primaryDirection, type Settings } from '../domain/settings';
import { endOfStudyDay, startOfStudyDay } from '../domain/dates';
import type { CardRecord, Direction, Mastery, Note } from '../domain/types';
import { cardMastery, retrievability, type Scheduler } from './scheduler';

/** Les fiches en apprentissage dont l'échéance tombe dans ce délai sont montrées tout de suite. */
export const LEARN_AHEAD_MS = 20 * 60_000;

export type QueueKind = 'learning' | 'review' | 'new';

export interface QueueItem {
  noteId: number;
  cardId: number;
  direction: Direction;
  kind: QueueKind;
}

export interface QueueOptions {
  now: number;
  settings: Settings;
  scheduler: Scheduler;
  /** Nombre de nouveaux mots déjà introduits aujourd'hui (fiche principale révisée pour la 1re fois). */
  newIntroducedToday: number;
  /** null = toutes les révisions du jour. */
  limit?: number | null;
  /** Limiter à une direction. */
  direction?: Direction | null;
  /** Limiter à un sous-ensemble de notes (collection). */
  noteIds?: Set<number> | null;
}

interface Candidate extends QueueItem {
  sortKey: number;
}

/** Fiches dues, classées par priorité, sans application de limite ni de regroupement. */
export function collectDue(notes: Note[], opts: QueueOptions) {
  const { now, settings, scheduler } = opts;
  const endOfDay = endOfStudyDay(now, settings.dayStartHour);
  const startOfDay = startOfStudyDay(now, settings.dayStartHour);
  const directions = activeDirections(settings).filter((d) => !opts.direction || d === opts.direction);
  const primary = primaryDirection(settings);
  const both = settings.directions === 'both';

  const learning: Candidate[] = [];
  const reviews: Candidate[] = [];
  const newPrimary: Candidate[] = [];
  const newSecondary: Candidate[] = [];

  for (const note of notes) {
    if (opts.noteIds && !opts.noteIds.has(note.id)) continue;
    for (const direction of directions) {
      const card = note.cards[direction];
      if (!card) continue;
      const base = { noteId: note.id, cardId: card.id, direction };
      if (card.state === State.Learning || card.state === State.Relearning) {
        if (card.due <= now + LEARN_AHEAD_MS) learning.push({ ...base, kind: 'learning', sortKey: card.due });
      } else if (card.state === State.Review) {
        if (card.due < endOfDay) reviews.push({ ...base, kind: 'review', sortKey: retrievability(scheduler, card, now) });
      } else if (card.state === State.New) {
        if (!both || direction === primary) {
          newPrimary.push({ ...base, kind: 'new', sortKey: note.createdAt });
        } else {
          // La 2e direction n'est introduite qu'une fois la 1re vue un jour précédent.
          const sibling = note.cards[primary];
          if (sibling && sibling.state !== State.New && sibling.lastReview != null && sibling.lastReview < startOfDay) {
            newSecondary.push({ ...base, kind: 'new', sortKey: note.createdAt });
          }
        }
      }
    }
  }

  learning.sort((a, b) => a.sortKey - b.sortKey);
  // Les plus menacées d'oubli d'abord (rétrievabilité la plus faible) ; à égalité, FR→EN.
  reviews.sort((a, b) => a.sortKey - b.sortKey || (a.direction === b.direction ? 0 : a.direction === 'fr_en' ? -1 : 1));
  newPrimary.sort((a, b) => a.sortKey - b.sortKey || a.noteId - b.noteId);
  newSecondary.sort((a, b) => a.sortKey - b.sortKey || a.noteId - b.noteId);

  const newQuota = Math.max(0, settings.newPerDay - opts.newIntroducedToday);
  const news = [...newSecondary, ...newPrimary.slice(0, newQuota)];
  return { learning, reviews, news, newPrimaryWaiting: Math.max(0, newPrimary.length - newQuota) };
}

export interface DueCounts {
  learning: number;
  review: number;
  new: number;
  total: number;
  /** Nouveaux mots en attente au-delà du plafond du jour. */
  newWaiting: number;
}

export function countDue(notes: Note[], opts: QueueOptions): DueCounts {
  const { learning, reviews, news, newPrimaryWaiting } = collectDue(notes, opts);
  return {
    learning: learning.length,
    review: reviews.length,
    new: news.length,
    total: learning.length + reviews.length + news.length,
    newWaiting: newPrimaryWaiting,
  };
}

/** Répartit régulièrement les nouvelles fiches parmi les révisions. */
function interleave<T>(reviews: T[], news: T[]): T[] {
  if (!news.length) return reviews;
  if (!reviews.length) return news;
  const out: T[] = [];
  const step = (reviews.length + news.length) / news.length;
  let r = 0;
  let n = 0;
  for (let i = 0; r < reviews.length || n < news.length; i++) {
    const wantNew = n < news.length && (r >= reviews.length || i + 1 >= Math.round((n + 0.5) * step));
    out.push(wantNew ? news[n++] : reviews[r++]);
  }
  return out;
}

/**
 * Construit la file d'une session de révision.
 * Priorité : apprentissage en cours → révisions (les plus fragiles d'abord) → nouveaux mots.
 * Deux fiches d'une même note (FR→EN et EN→FR) ne sont jamais montrées à la suite :
 * la seconde est repoussée en fin de session (ou à une session suivante si une limite s'applique).
 */
export function buildQueue(notes: Note[], opts: QueueOptions): QueueItem[] {
  const { learning, reviews, news } = collectDue(notes, opts);
  const limit = opts.limit ?? Infinity;

  const seen = new Set<number>();
  const deferred: Candidate[] = [];
  const pick = (list: Candidate[]) => {
    const kept: Candidate[] = [];
    for (const c of list) {
      if (seen.has(c.noteId)) deferred.push(c);
      else {
        seen.add(c.noteId);
        kept.push(c);
      }
    }
    return kept;
  };

  const l = pick(learning);
  const r = pick(reviews);
  const n = pick(news);

  // Sélection selon la priorité, puis mise en ordre.
  let budget = limit;
  const take = <T>(list: T[]) => {
    const part = list.slice(0, Math.max(0, budget));
    budget -= part.length;
    return part;
  };
  const selL = take(l);
  const selR = take(r);
  const selN = take(n);
  const tail = take(deferred);

  const strip = ({ sortKey: _s, ...item }: Candidate): QueueItem => item;
  return separateSiblings([...selL, ...interleave(selR, selN), ...tail].map(strip));
}

/** Évite que deux fiches de la même note se suivent (quand c'est possible). */
function separateSiblings(list: QueueItem[]): QueueItem[] {
  const out = [...list];
  // `item` placé en `pos` (après échange avec `other`) n'a-t-il aucun voisin de la même note ?
  const fits = (pos: number, item: QueueItem, other: number) =>
    [pos - 1, pos + 1].every((k) => k < 0 || k >= out.length || (k === other ? out[pos] : out[k]).noteId !== item.noteId);
  for (let i = 1; i < out.length; i++) {
    if (out[i].noteId !== out[i - 1].noteId) continue;
    const order = [...out.keys()].filter((k) => k > i).concat([...out.keys()].filter((k) => k < i - 1));
    const j = order.find((k) => fits(k, out[i], i) && fits(i, out[k], k));
    if (j !== undefined) [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Maîtrise d'une note : la moins avancée de ses directions actives. */
export function noteMastery(note: Note, settings: Pick<Settings, 'directions' | 'masteryThresholdDays'>): Mastery {
  const levels = activeDirections(settings).map((d) => cardMastery(note.cards[d], settings.masteryThresholdDays));
  if (levels.every((m) => m === 'new')) return 'new';
  if (levels.every((m) => m === 'mastered')) return 'mastered';
  return 'learning';
}

export function directionMastery(card: CardRecord | undefined, settings: Pick<Settings, 'masteryThresholdDays'>): Mastery {
  return cardMastery(card, settings.masteryThresholdDays);
}
