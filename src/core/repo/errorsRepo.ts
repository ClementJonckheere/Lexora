import type { Database, Queryable } from '../db/types';
import type { ErrorKind } from '../domain/errorKind';
import { newId } from '../domain/text';

export type ErrorSource = 'review' | 'practice' | 'reuse' | 'grammar' | 'verbs';

export interface AnswerError {
  source: ErrorSource;
  itemId: string;
  kind: ErrorKind;
  expected: string;
  given: string;
  createdAt: number;
}

/** Enregistre une réponse fausse ou approchée avec son type d'erreur (textes bornés à 200 caractères). */
export async function recordAnswerError(db: Database, universeId: string, e: AnswerError, now = Date.now()): Promise<void> {
  await db.execute(
    `INSERT INTO answer_errors (id, universe_id, source, item_id, kind, expected, given, created_at, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [newId(), universeId, e.source, e.itemId, e.kind, e.expected.trim().slice(0, 200), e.given.trim().slice(0, 200), e.createdAt, now],
  );
}

/** Erreurs d'un univers depuis `since`. */
export async function loadAnswerErrors(db: Queryable, universeId: string, since = 0): Promise<AnswerError[]> {
  const rows = await db.select<{ source: string; item_id: string; kind: string; expected: string; given: string; created_at: number }>(
    'SELECT source, item_id, kind, expected, given, created_at FROM answer_errors WHERE universe_id = ? AND deleted = 0 AND created_at >= ? ORDER BY created_at',
    [universeId, since],
  );
  return rows.map((r) => ({
    source: r.source as ErrorSource,
    itemId: r.item_id,
    kind: r.kind as ErrorKind,
    expected: r.expected,
    given: r.given,
    createdAt: Number(r.created_at),
  }));
}
