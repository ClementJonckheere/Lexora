import type { Database, Queryable } from '../db/types';
import { newId } from '../domain/text';
import type { ReuseAnswer, ReuseRating, ReuseStage, ReuseVerdict } from '../srs/reuse';

/** Réponses de « Réutiliser mes expressions » d'un univers (notes supprimées comprises : elles sont ignorées à l'usage). */
export async function loadReuseAnswers(db: Queryable, universeId: string): Promise<ReuseAnswer[]> {
  const rows = await db.select<{
    id: string;
    note_id: string;
    stage: number;
    sentence_id: number;
    given: string;
    verdict: string;
    rating: number;
    created_at: number;
  }>(
    'SELECT id, note_id, stage, sentence_id, given, verdict, rating, created_at FROM reuse_answers WHERE universe_id = ? AND deleted = 0 ORDER BY created_at',
    [universeId],
  );
  return rows.map((r) => ({
    id: r.id,
    universeId,
    noteId: r.note_id,
    stage: Number(r.stage) as ReuseStage,
    sentenceId: Number(r.sentence_id) || 0,
    given: r.given,
    verdict: r.verdict as ReuseVerdict,
    rating: Number(r.rating) as ReuseRating,
    createdAt: Number(r.created_at),
  }));
}

/** Enregistre une réponse (texte borné à 500 caractères) ; renvoie la ligne enregistrée. */
export async function recordReuseAnswer(db: Database, a: Omit<ReuseAnswer, 'id'>, now = Date.now()): Promise<ReuseAnswer> {
  const row: ReuseAnswer = { ...a, id: newId(), given: a.given.trim().slice(0, 500) };
  await db.execute(
    `INSERT INTO reuse_answers (id, universe_id, note_id, stage, sentence_id, given, verdict, rating, created_at, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [row.id, row.universeId, row.noteId, row.stage, row.sentenceId, row.given, row.verdict, row.rating, row.createdAt, now],
  );
  return row;
}
