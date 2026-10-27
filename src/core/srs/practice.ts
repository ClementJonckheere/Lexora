import { buildCloze, type Cloze } from '../domain/cloze';
import { activeDirections, type Settings } from '../domain/settings';
import type { Direction, Note } from '../domain/types';
import { DIFFICULT_THRESHOLD } from '../repo/reviewRepo';

/**
 * Entraînement libre : sélection des notes, sans aucune modification de la planification FSRS.
 */

export interface PracticeItem {
  noteId: string;
  direction: Direction;
}

export interface ClozeItem {
  noteId: string;
  sentence: string;
  cloze: Cloze;
}

type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDirection(settings: Settings, forced: Direction | null | undefined, rng: Rng): Direction {
  if (forced) return forced;
  const dirs = activeDirections(settings);
  // FR→EN privilégié (2 fois sur 3) lorsque les deux directions sont actives.
  return dirs.length === 1 ? dirs[0] : rng() < 2 / 3 ? 'fr_en' : 'en_fr';
}

export function difficultNotes(notes: Note[], forgetCounts: Map<string, number>): Note[] {
  return notes
    .filter((n) => (forgetCounts.get(n.id) ?? 0) >= DIFFICULT_THRESHOLD)
    .sort((a, b) => (forgetCounts.get(b.id) ?? 0) - (forgetCounts.get(a.id) ?? 0));
}

export function buildRandomPractice(
  notes: Note[],
  settings: Settings,
  limit: number | null,
  direction?: Direction | null,
  rng: Rng = Math.random,
): PracticeItem[] {
  return shuffle(notes, rng)
    .slice(0, limit ?? notes.length)
    .map((n) => ({ noteId: n.id, direction: pickDirection(settings, direction, rng) }));
}

export function buildDifficultPractice(
  notes: Note[],
  forgetCounts: Map<string, number>,
  limit: number | null,
  direction?: Direction | null,
  rng: Rng = Math.random,
): PracticeItem[] {
  const hard = difficultNotes(notes, forgetCounts).slice(0, limit ?? undefined);
  // Les plus oubliés sont choisis en priorité, puis présentés dans un ordre aléatoire.
  return shuffle(hard, rng).map((n) => ({ noteId: n.id, direction: direction ?? 'fr_en' }));
}

/** Notes possédant au moins un exemple dans lequel l'expression est repérable. */
export function clozeCandidates(notes: Note[], language = 'en'): ClozeItem[][] {
  return notes
    .map((n) =>
      n.examples
        .map((sentence) => {
          const cloze = buildCloze(n.expression, sentence, language);
          return cloze ? { noteId: n.id, sentence, cloze } : null;
        })
        .filter((x): x is ClozeItem => x !== null),
    )
    .filter((list) => list.length > 0);
}

export function buildClozePractice(notes: Note[], limit: number | null, language = 'en', rng: Rng = Math.random): ClozeItem[] {
  return shuffle(clozeCandidates(notes, language), rng)
    .slice(0, limit ?? undefined)
    .map((options) => options[Math.floor(rng() * options.length)]);
}
