import type { ReviewLog } from 'ts-fsrs';
import type { Database, Queryable } from '../db/types';
import type { CardRecord, Direction, PracticeMode } from '../domain/types';

/**
 * Enregistre une révision validée : nouvel état FSRS de la fiche + entrée d'historique,
 * dans une même transaction. Retourne l'identifiant de l'historique (pour l'annulation).
 */
export async function recordReview(db: Database, after: CardRecord, log: ReviewLog, durationMs: number): Promise<number> {
  return db.transaction(async (tx) => {
    await writeCard(tx, after);
    const res = await tx.execute(
      `INSERT INTO review_logs (card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days,
         scheduled_days, learning_steps, reviewed_at, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        after.id,
        log.rating,
        log.state,
        log.due.getTime(),
        log.stability,
        log.difficulty,
        log.elapsed_days,
        log.last_elapsed_days,
        log.scheduled_days,
        log.learning_steps,
        log.review.getTime(),
        Math.max(0, Math.round(Math.min(durationMs, 10 * 60_000))),
      ],
    );
    return res.lastInsertId;
  });
}

/** Annule une révision : restaure l'état précédent et supprime l'entrée d'historique. */
export async function undoReview(db: Database, before: CardRecord, logId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await writeCard(tx, before);
    await tx.execute('DELETE FROM review_logs WHERE id = ?', [logId]);
  });
}

export async function writeCard(tx: Queryable, c: CardRecord): Promise<void> {
  await tx.execute(
    `UPDATE cards SET state = ?, due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
       learning_steps = ?, reps = ?, lapses = ?, last_review = ? WHERE id = ?`,
    [c.state, c.due, c.stability, c.difficulty, c.elapsedDays, c.scheduledDays, c.learningSteps, c.reps, c.lapses, c.lastReview, c.id],
  );
}

/** Nombre de nouveaux mots introduits depuis `since` (1re révision de la fiche principale). */
export async function countNewIntroduced(db: Queryable, since: number, primary: Direction): Promise<number> {
  const rows = await db.select<{ n: number }>(
    `SELECT COUNT(DISTINCT r.card_id) AS n FROM review_logs r JOIN cards c ON c.id = r.card_id
     WHERE r.state = 0 AND r.reviewed_at >= ? AND c.direction = ?`,
    [since, primary],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Entraînement libre : journalisé, sans aucun effet sur la planification. */
export async function recordPractice(db: Database, noteId: number, mode: PracticeMode, rating: number, now = Date.now()) {
  await db.execute('INSERT INTO practice_logs (note_id, mode, rating, created_at) VALUES (?, ?, ?, ?)', [noteId, mode, rating, now]);
}

export interface ReviewHistoryEntry {
  id: number;
  cardId: number;
  direction: Direction;
  rating: number;
  state: number;
  reviewedAt: number;
  scheduledDays: number;
}

export async function loadNoteHistory(db: Queryable, noteId: number): Promise<ReviewHistoryEntry[]> {
  const rows = await db.select<{
    id: number;
    card_id: number;
    direction: Direction;
    rating: number;
    state: number;
    reviewed_at: number;
    scheduled_days: number;
  }>(
    `SELECT r.id, r.card_id, c.direction, r.rating, r.state, r.reviewed_at, r.scheduled_days
     FROM review_logs r JOIN cards c ON c.id = r.card_id WHERE c.note_id = ? ORDER BY r.reviewed_at DESC LIMIT 100`,
    [noteId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    cardId: Number(r.card_id),
    direction: r.direction,
    rating: Number(r.rating),
    state: Number(r.state),
    reviewedAt: Number(r.reviewed_at),
    scheduledDays: Number(r.scheduled_days),
  }));
}

/**
 * Mots souvent oubliés : nombre d'échecs (« Oublié ») hors toute première présentation,
 * en révision planifiée comme en entraînement. Seuil : au moins 2 échecs.
 */
export async function loadForgetCounts(db: Queryable): Promise<Map<number, number>> {
  const rows = await db.select<{ note_id: number; fails: number }>(
    `SELECT note_id, SUM(fails) AS fails FROM (
       SELECT c.note_id AS note_id, COUNT(*) AS fails FROM review_logs r JOIN cards c ON c.id = r.card_id
         WHERE r.rating = 1 AND r.state <> 0 GROUP BY c.note_id
       UNION ALL
       SELECT note_id, COUNT(*) FROM practice_logs WHERE rating = 1 GROUP BY note_id
     ) GROUP BY note_id`,
  );
  return new Map(rows.map((r) => [Number(r.note_id), Number(r.fails)]));
}

export const DIFFICULT_THRESHOLD = 2;
