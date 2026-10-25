import { cleanList, cleanText } from './text';
import type { NoteInput } from './types';

export const LIMITS = {
  expression: 200,
  translation: 300,
  example: 600,
  comment: 4000,
  tag: 40,
  category: 40,
  collectionName: 60,
} as const;

export interface ValidatedNote {
  expression: string;
  translation: string;
  examples: string[];
  comment: string;
  category: string;
  tags: string[];
  collectionIds: number[];
  isFavorite: boolean;
}

export type FieldErrors = Partial<Record<'expression' | 'translation' | 'examples' | 'comment' | 'category' | 'tags', string>>;

export class ValidationError extends Error {
  constructor(readonly fields: FieldErrors) {
    super(Object.values(fields)[0] ?? 'Données invalides');
    this.name = 'ValidationError';
  }
}

export function validateNote(input: NoteInput): ValidatedNote {
  const expression = cleanText(input.expression);
  const translation = cleanText(input.translation);
  const examples = cleanList(input.examples);
  const comment = (input.comment ?? '').trim();
  const category = cleanText(input.category);
  const tags = cleanList(input.tags);
  const errors: FieldErrors = {};

  if (!expression) errors.expression = "L'expression anglaise est obligatoire.";
  else if (expression.length > LIMITS.expression) errors.expression = `${LIMITS.expression} caractères maximum.`;
  if (!translation) errors.translation = 'La traduction française est obligatoire.';
  else if (translation.length > LIMITS.translation) errors.translation = `${LIMITS.translation} caractères maximum.`;
  if (examples.some((e) => e.length > LIMITS.example)) errors.examples = `Chaque exemple : ${LIMITS.example} caractères maximum.`;
  if (comment.length > LIMITS.comment) errors.comment = `${LIMITS.comment} caractères maximum.`;
  if (category.length > LIMITS.category) errors.category = `${LIMITS.category} caractères maximum.`;
  if (tags.some((t) => t.length > LIMITS.tag)) errors.tags = `Chaque tag : ${LIMITS.tag} caractères maximum.`;

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    expression,
    translation,
    examples,
    comment,
    category,
    tags,
    collectionIds: [...new Set(input.collectionIds ?? [])],
    isFavorite: !!input.isFavorite,
  };
}
