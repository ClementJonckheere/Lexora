import type { ImportCandidate } from '../repo/transfer';

/**
 * Collections prêtes à importer (public/grammar/en/collections) : des listes à mémoriser plutôt que des règles
 * (make ou do, verbes et adjectifs à préposition). Importées comme notes ordinaires, dans une collection à leur nom,
 * avec leurs fiches FSRS ; la phrase d'exemple sert de phrase à trous (la préposition est à taper).
 */

export const READY_COLLECTIONS = ['make-do', 'dependent-prepositions'] as const;
export type ReadyCollectionId = (typeof READY_COLLECTIONS)[number];

export interface ReadyNote {
  expression: string;
  translation: string;
  examples: string[];
  comment?: string;
}

export interface ReadyCollection {
  id: ReadyCollectionId;
  title: string;
  description: string;
  status: string;
  notes: ReadyNote[];
}

/** Notes à importer : dans la collection du même nom, avec un tag (make-do…) pour les retrouver. */
export function readyCandidates(c: ReadyCollection): ImportCandidate[] {
  return c.notes.map((n) => ({
    expression: n.expression,
    translation: n.translation,
    examples: n.examples,
    comment: n.comment ?? '',
    tags: [c.id],
    collectionNames: [c.title],
  }));
}
