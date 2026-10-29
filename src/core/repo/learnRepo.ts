import type { Database, Queryable } from '../db/types';
import type { GrammarAnswer } from '../learn/progress';
import { newId } from '../domain/text';

/** Réponses aux exercices de grammaire de l'univers (toutes leçons). */
export async function loadGrammarAnswers(db: Queryable, universeId: string): Promise<GrammarAnswer[]> {
  const rows = await db.select<{ lesson_id: string; item_id: string; correct: number; reported: number; created_at: number }>(
    'SELECT lesson_id, item_id, correct, reported, created_at FROM grammar_answers WHERE universe_id = ? AND deleted = 0',
    [universeId],
  );
  return rows.map((r) => ({ lessonId: r.lesson_id, itemId: r.item_id, correct: Number(r.correct) === 1, reported: Number(r.reported) === 1, createdAt: Number(r.created_at) }));
}

export async function recordGrammarAnswer(db: Database, universeId: string, answer: GrammarAnswer, now = Date.now()): Promise<void> {
  await db.execute(
    `INSERT INTO grammar_answers (id, universe_id, lesson_id, item_id, correct, reported, created_at, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [newId(), universeId, answer.lessonId, answer.itemId, answer.correct ? 1 : 0, answer.reported ? 1 : 0, answer.createdAt, now],
  );
}

/** Phrase signalée (« ne correspond pas à la leçon ») : ses réponses ne comptent plus, elle n'est plus proposée. */
export async function reportGrammarItem(db: Database, universeId: string, lessonId: string, itemId: string, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute('UPDATE grammar_answers SET reported = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND item_id = ? AND deleted = 0', [now, universeId, itemId]);
    await tx.execute(
      `INSERT INTO grammar_answers (id, universe_id, lesson_id, item_id, correct, reported, created_at, updated_at, deleted, dirty)
       VALUES (?, ?, ?, ?, 0, 1, ?, ?, 0, 1)`,
      [newId(), universeId, lessonId, itemId, now, now],
    );
  });
}
