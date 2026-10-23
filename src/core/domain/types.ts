import type { State } from 'ts-fsrs';

/** fr_en : on voit le français, on retrouve l'anglais (production). en_fr : l'inverse (compréhension). */
export type Direction = 'fr_en' | 'en_fr';
export const DIRECTIONS: Direction[] = ['fr_en', 'en_fr'];

export const DIRECTION_LABEL: Record<Direction, string> = {
  fr_en: 'Français → Anglais',
  en_fr: 'Anglais → Français',
};

export type Mastery = 'new' | 'learning' | 'mastered';

export const MASTERY_LABEL: Record<Mastery, string> = {
  new: 'À apprendre',
  learning: 'En cours',
  mastered: 'Maîtrisé',
};

/** Ligne de la table `cards` (état FSRS d'une direction d'une note). */
export interface CardRecord {
  id: number;
  noteId: number;
  direction: Direction;
  state: State;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
}

export interface Note {
  id: number;
  expression: string;
  translation: string;
  expressionKey: string;
  comment: string;
  category: string;
  categoryAuto: boolean;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  examples: string[];
  tags: string[];
  collectionIds: number[];
  cards: Partial<Record<Direction, CardRecord>>;
}

/** Données saisies par l'utilisateur pour créer / modifier une note. */
export interface NoteInput {
  expression: string;
  translation: string;
  examples?: string[];
  comment?: string;
  /** undefined ou '' → catégorie détectée automatiquement. */
  category?: string;
  tags?: string[];
  collectionIds?: number[];
  isFavorite?: boolean;
}

export interface Collection {
  id: number;
  name: string;
  description: string;
  createdAt: number;
}

export type PracticeMode = 'cloze' | 'random' | 'difficult';
