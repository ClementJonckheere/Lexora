import type { Database, Queryable } from '../db/types';
import { newId } from '../domain/text';
import type { ListeningAnswer } from '../srs/listening';

/** Phrases écoutées d'un univers. */
export async function loadListeningAnswers(db: Queryable, universeId: string): Promise<ListeningAnswer[]> {
  const rows = await db.select<{
    id: string;
    sentence_id: number;
    note_id: string;
    comprehension: number;
    dictation: string;
    dictation_score: number;
    shadowed: number;
    reformulated: number;
    created_at: number;
  }>(
    `SELECT id, sentence_id, note_id, comprehension, dictation, dictation_score, shadowed, reformulated, created_at
       FROM listening_answers WHERE universe_id = ? AND deleted = 0 ORDER BY created_at`,
    [universeId],
  );
  return rows.map((r) => ({
    id: r.id,
    universeId,
    sentenceId: Number(r.sentence_id),
    noteId: r.note_id ?? '',
    comprehension: Number(r.comprehension) as 1 | 2 | 3,
    dictation: r.dictation ?? '',
    dictationScore: Number(r.dictation_score),
    shadowed: Number(r.shadowed) || 0,
    reformulated: Number(r.reformulated) === 1,
    createdAt: Number(r.created_at),
  }));
}

/** Enregistre une phrase écoutée (dictée bornée à 500 caractères) ; renvoie la ligne enregistrée. */
export async function recordListeningAnswer(db: Database, a: Omit<ListeningAnswer, 'id'>, now = Date.now()): Promise<ListeningAnswer> {
  const row: ListeningAnswer = { ...a, id: newId(), dictation: a.dictation.trim().slice(0, 500) };
  await db.execute(
    `INSERT INTO listening_answers (id, universe_id, sentence_id, note_id, comprehension, dictation, dictation_score, shadowed, reformulated, created_at, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [row.id, row.universeId, row.sentenceId, row.noteId, row.comprehension, row.dictation, row.dictationScore, row.shadowed, row.reformulated ? 1 : 0, row.createdAt, now],
  );
  return row;
}
