import { describe, expect, it } from 'vitest';
import { createMemoryDatabase } from '../db/testing';
import type { GrammarAnswer } from '../learn/progress';
import { loadHistory, loadXpEvents, recordNoteEntry } from './xpRepo';

const T = new Date(2026, 9, 29, 9, 0).getTime();

async function setup() {
  const db = await createMemoryDatabase();
  const note = (id: string, universe: string, examples: string) =>
    db.execute(
      `INSERT INTO notes (id, universe_id, expression, translation, expression_key, examples, created_at, updated_at)
       VALUES (?, ?, 'x', 'x', ?, ?, ?, ?)`,
      [id, universe, id, examples, T, T],
    );
  await note('n1', 'en', '["I gave up."]');
  await note('n2', 'en', '[]');
  await note('n3', 'es', '[]');
  for (const [card, noteId] of [['c1', 'n1'], ['c3', 'n3']]) {
    await db.execute(`INSERT INTO cards (id, note_id, direction, due, updated_at) VALUES (?, ?, 'fr_en', 0, ?)`, [card, noteId, T]);
  }
  const log = (id: string, card: string, typedMs: number | null) =>
    db.execute(
      `INSERT INTO review_logs (id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, reviewed_at, duration_ms, typed_ms, updated_at)
       VALUES (?, ?, 3, 2, 0, 1, 5, 12, 0, 1, 0, ?, 4000, ?, ?)`,
      [id, card, T, typedMs, T],
    );
  await log('l1', 'c1', 2500);
  await log('l2', 'c1', null);
  await log('l3', 'c3', 2500);
  await db.execute(`INSERT INTO practice_logs (id, note_id, mode, rating, created_at, updated_at) VALUES ('p1', 'n1', 'random', 3, ?, ?)`, [T, T]);
  return db;
}

describe('événements d’XP', () => {
  it('révisions, entraînement et mots de l’univers seulement ; réponse tapée et exemple repérés', async () => {
    const events = await loadXpEvents(await setup(), 'en', []);
    const reviews = events.filter((e) => e.kind === 'review');
    expect(reviews.map((e) => e.kind === 'review' && e.typed)).toEqual([true, false]);
    expect(reviews.every((e) => e.kind === 'review' && e.elapsedDays === 12)).toBe(true);
    expect(events.filter((e) => e.kind === 'practice')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'note').map((e) => e.kind === 'note' && e.withExample).sort()).toEqual([false, true]);
  });

  it('grammaire : phrases signalées ignorées, leçons tapées repérées, acquisition déduite des réponses', async () => {
    const answers: GrammarAnswer[] = Array.from({ length: 20 }, (_, i) => ({
      lessonId: 'present-perfect',
      itemId: `present-perfect:${i}`,
      correct: true,
      reported: i === 0,
      createdAt: T + i * 30_000,
    }));
    answers.push({ lessonId: 'say-tell', itemId: 'say-tell:1', correct: true, reported: false, createdAt: T });
    const events = await loadXpEvents(await createMemoryDatabase(), 'en', answers);
    const grammar = events.filter((e) => e.kind === 'grammar');
    expect(grammar).toHaveLength(20);
    expect(grammar.filter((e) => e.kind === 'grammar' && e.typed)).toHaveLength(19);
    expect(events.filter((e) => e.kind === 'lesson-mastered')).toHaveLength(0); // 19 réponses comptées, il en faut 20
    answers.push({ lessonId: 'present-perfect', itemId: 'present-perfect:20', correct: true, reported: false, createdAt: T + 20 * 30_000 });
    const again = await loadXpEvents(await createMemoryDatabase(), 'en', answers);
    expect(again.filter((e) => e.kind === 'lesson-mastered')).toHaveLength(1);
  });
});

describe('durée de saisie', () => {
  it('enregistrée pour un nouveau mot, ignorée au-delà de 10 minutes', async () => {
    const db = await createMemoryDatabase();
    await recordNoteEntry(db, 'en', 'n1', 3200, T);
    await recordNoteEntry(db, 'en', 'n2', 11 * 60_000, T);
    await recordNoteEntry(db, 'es', 'n3', 2000, T);
    expect((await loadHistory(db, 'en', [])).entries).toEqual([{ at: T, durationMs: 3200 }]);
  });
});
