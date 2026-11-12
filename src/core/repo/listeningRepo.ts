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

/** Note de prononciation d'une répétition (Azure) : seules les notes sont gardées. */
export async function recordPronunciation(
  db: Database,
  universeId: string,
  s: { sentenceId: number; score: number; accuracy: number; fluency: number; completeness: number; createdAt: number },
  now = Date.now(),
): Promise<void> {
  const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
  await db.execute(
    `INSERT INTO pronunciation_scores (id, universe_id, sentence_id, score, accuracy, fluency, completeness, created_at, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [newId(), universeId, s.sentenceId, clamp(s.score), clamp(s.accuracy), clamp(s.fluency), clamp(s.completeness), s.createdAt, now],
  );
}

/** Notes de prononciation d'un univers depuis `since` (évolution dans le temps). */
export async function loadPronunciation(db: Queryable, universeId: string, since = 0): Promise<{ sentenceId: number; score: number; createdAt: number }[]> {
  const rows = await db.select<{ sentence_id: number; score: number; created_at: number }>(
    'SELECT sentence_id, score, created_at FROM pronunciation_scores WHERE universe_id = ? AND deleted = 0 AND created_at >= ? ORDER BY created_at',
    [universeId, since],
  );
  return rows.map((r) => ({ sentenceId: Number(r.sentence_id), score: Number(r.score), createdAt: Number(r.created_at) }));
}
