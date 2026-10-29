import type { Database, Queryable } from '../db/types';
import { newId } from '../domain/text';
import type { GrammarAnswer } from '../learn/progress';
import { lessonReview, type LessonReview } from '../learn/review';
import type { TitleData } from '../progress/titles';
import type { XpEvent } from '../progress/xp';

/** Leçons dont les exercices se font en tapant la réponse (les autres se font en choisissant). */
export const TYPED_LESSONS = new Set(['present-perfect', 'past-perfect', 'passive', 'perfect-continuous']);

/** Historique de l'univers utile à la progression : événements d'XP, et le détail demandé par les titres. */
export interface History {
  events: XpEvent[];
  reviews: TitleData['reviews'];
  lessons: LessonReview[];
  grammarCorrect: number;
  chapterDecisions: number[];
  entries: TitleData['entries'];
}

/** Historique de l'univers, sous forme d'événements d'XP (révisions, entraînement, mots ajoutés, grammaire). */
export async function loadXpEvents(db: Queryable, universeId: string, grammar: GrammarAnswer[]): Promise<XpEvent[]> {
  return (await loadHistory(db, universeId, grammar)).events;
}

export async function loadHistory(db: Queryable, universeId: string, grammar: GrammarAnswer[]): Promise<History> {
  const [reviews, practice, notes, chapter, entries] = await Promise.all([
    db.select<{ card_id: string; note_id: string; rating: number; elapsed_days: number; reviewed_at: number; due: number; typed_ms: number | null }>(
      `SELECT r.card_id, c.note_id, r.rating, r.elapsed_days, r.reviewed_at, r.due, r.typed_ms FROM review_logs r
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
    db.select<{ created_at: number }>(
      "SELECT created_at FROM vocab_observations WHERE universe_id = ? AND source = 'chapter' AND deleted = 0",
      [universeId],
    ),
    db.select<{ created_at: number; duration_ms: number }>(
      'SELECT created_at, duration_ms FROM note_entries WHERE universe_id = ? AND deleted = 0',
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
  let grammarCorrect = 0;
  for (const a of grammar) {
    if (a.reported) continue;
    if (a.correct) grammarCorrect++;
    events.push({ kind: 'grammar', at: a.createdAt, itemId: a.itemId, correct: a.correct, typed: TYPED_LESSONS.has(a.lessonId) });
    byLesson.set(a.lessonId, [...(byLesson.get(a.lessonId) ?? []), a]);
  }
  const lessons: LessonReview[] = [];
  for (const [lessonId, answers] of byLesson) {
    const r = lessonReview(answers);
    lessons.push(r);
    if (r.masteredAt !== null) events.push({ kind: 'lesson-mastered', at: r.masteredAt, lessonId });
    for (const rev of r.reviews) events.push({ kind: 'lesson-review', at: rev.at, lessonId, passed: rev.passed });
  }
  return {
    events,
    reviews: reviews.map((r) => ({
      cardId: r.card_id,
      noteId: r.note_id,
      rating: Number(r.rating),
      elapsedDays: Number(r.elapsed_days),
      at: Number(r.reviewed_at),
      due: Number(r.due),
    })),
    lessons,
    grammarCorrect,
    chapterDecisions: chapter.map((c) => Number(c.created_at)),
    entries: entries.map((e) => ({ at: Number(e.created_at), durationMs: Number(e.duration_ms) })),
  };
}

/** Saisie d'un mot depuis le formulaire : au-delà de 10 minutes, le formulaire est resté ouvert, la durée ne dit rien. */
export async function recordNoteEntry(db: Database, universeId: string, noteId: string, durationMs: number, now = Date.now()): Promise<void> {
  if (!(durationMs > 0) || durationMs > 10 * 60_000) return;
  await db.execute(
    `INSERT INTO note_entries (id, universe_id, note_id, duration_ms, created_at, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
    [newId(), universeId, noteId, Math.round(durationMs), now, now],
  );
}

function hasExample(raw: string): boolean {
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) && list.some((x) => typeof x === 'string' ? x.trim() !== '' : !!x);
  } catch {
    return false;
  }
}
