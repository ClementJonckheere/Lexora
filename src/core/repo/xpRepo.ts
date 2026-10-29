import type { Queryable } from '../db/types';
import type { GrammarAnswer } from '../learn/progress';
import { lessonReview } from '../learn/review';
import type { XpEvent } from '../progress/xp';

/** Leçons dont les exercices se font en tapant la réponse (les autres se font en choisissant). */
export const TYPED_LESSONS = new Set(['present-perfect', 'past-perfect', 'passive', 'perfect-continuous']);

/** Historique de l'univers, sous forme d'événements d'XP (révisions, entraînement, mots ajoutés, grammaire). */
export async function loadXpEvents(db: Queryable, universeId: string, grammar: GrammarAnswer[]): Promise<XpEvent[]> {
  const [reviews, practice, notes] = await Promise.all([
    db.select<{ card_id: string; rating: number; elapsed_days: number; reviewed_at: number; typed_ms: number | null }>(
      `SELECT r.card_id, r.rating, r.elapsed_days, r.reviewed_at, r.typed_ms FROM review_logs r
         JOIN cards c ON c.id = r.card_id JOIN notes n ON n.id = c.note_id
       WHERE r.deleted = 0 AND n.universe_id = ?`,
      [universeId],
    ),
    db.select<{ note_id: string; rating: number; created_at: number }>(
      `SELECT p.note_id, p.rating, p.created_at FROM practice_logs p JOIN notes n ON n.id = p.note_id
       WHERE p.deleted = 0 AND n.universe_id = ?`,
      [universeId],
    ),
    db.select<{ created_at: number; examples: string }>(
      'SELECT created_at, examples FROM notes WHERE deleted = 0 AND universe_id = ?',
      [universeId],
    ),
  ]);

  const events: XpEvent[] = [];
  for (const r of reviews) {
    events.push({
      kind: 'review',
      at: Number(r.reviewed_at),
      cardId: r.card_id,
      rating: Number(r.rating),
      elapsedDays: Number(r.elapsed_days),
      typed: r.typed_ms != null,
    });
  }
  for (const p of practice) events.push({ kind: 'practice', at: Number(p.created_at), noteId: p.note_id, rating: Number(p.rating) });
  for (const n of notes) events.push({ kind: 'note', at: Number(n.created_at), withExample: hasExample(n.examples) });

  const byLesson = new Map<string, GrammarAnswer[]>();
  for (const a of grammar) {
    if (a.reported) continue;
    events.push({ kind: 'grammar', at: a.createdAt, itemId: a.itemId, correct: a.correct, typed: TYPED_LESSONS.has(a.lessonId) });
    byLesson.set(a.lessonId, [...(byLesson.get(a.lessonId) ?? []), a]);
  }
  for (const [lessonId, answers] of byLesson) {
    const r = lessonReview(answers);
    if (r.masteredAt !== null) events.push({ kind: 'lesson-mastered', at: r.masteredAt, lessonId });
    for (const rev of r.reviews) events.push({ kind: 'lesson-review', at: rev.at, lessonId, passed: rev.passed });
  }
  return events;
}

function hasExample(raw: string): boolean {
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) && list.some((x) => typeof x === 'string' ? x.trim() !== '' : !!x);
  } catch {
    return false;
  }
}
