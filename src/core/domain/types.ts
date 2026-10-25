import type { State } from 'ts-fsrs';
import { languageInfo } from './languages';

/**
 * fr_en : on voit le français, on retrouve la langue cible (production).
 * en_fr : on voit la langue cible, on retrouve le français (compréhension).
 * (Codes historiques : « en » désigne la langue de l'univers, quelle qu'elle soit.)
 */
export type Direction = 'fr_en' | 'en_fr';
export const DIRECTIONS: Direction[] = ['fr_en', 'en_fr'];

export function directionLabel(direction: Direction, language = 'en'): string {
  const target = languageInfo(language).name;
  return direction === 'fr_en' ? `Français → ${target}` : `${target} → Français`;
}

export function directionShort(direction: Direction, language = 'en'): string {
  const code = language.slice(0, 2).toUpperCase();
  return direction === 'fr_en' ? `FR → ${code}` : `${code} → FR`;
}

export type Mastery = 'new' | 'learning' | 'mastered';

export const MASTERY_LABEL: Record<Mastery, string> = {
  new: 'À apprendre',
  learning: 'En cours',
  mastered: 'Maîtrisé',
};

/** Un univers = une langue cible avec sa propre bibliothèque, ses collections et ses révisions. */
export interface Universe {
  id: string;
  name: string;
  language: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

/** Ligne de la table `cards` (état FSRS d'une direction d'une note). */
export interface CardRecord {
  id: string;
  noteId: string;
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
  id: string;
  universeId: string;
  expression: string;
  translation: string;
  /** Pinyin, translittération… (facultatif). */
  pronunciation: string;
  expressionKey: string;
  comment: string;
  category: string;
  categoryAuto: boolean;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  examples: string[];
  tags: string[];
  collectionIds: string[];
  cards: Partial<Record<Direction, CardRecord>>;
}

/** Données saisies par l'utilisateur pour créer / modifier une note. */
export interface NoteInput {
  expression: string;
  translation: string;
  pronunciation?: string;
  examples?: string[];
  comment?: string;
  /** undefined ou '' → catégorie détectée automatiquement. */
  category?: string;
  tags?: string[];
  collectionIds?: string[];
  isFavorite?: boolean;
}

export interface Collection {
  id: string;
  universeId: string;
  name: string;
  description: string;
  createdAt: number;
}

export type PracticeMode = 'cloze' | 'random' | 'difficult';
