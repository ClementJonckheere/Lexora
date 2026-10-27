import type { ReviewLog } from 'ts-fsrs';
import type { Database, Queryable } from '../db/types';
import { newId } from '../domain/text';
import type { CardRecord, Direction, PracticeMode } from '../domain/types';

/**
 * Enregistre une révision validée : nouvel état FSRS de la fiche + entrée d'historique,
 * dans une même transaction. Retourne l'identifiant de l'historique (pour l'annulation).
 */
/** Réponse exacte tapée : temps de l'affichage à la validation, et longueur de la réponse attendue. */
export interface TypedTiming {
  ms: number;
  chars: number;
}

export async function recordReview(
  db: Database,
  after: CardRecord,
  log: ReviewLog,
  durationMs: number,
  now = Date.now(),
  typed: TypedTiming | null = null,
): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    await writeCard(tx, after, now);
    await tx.execute(
      `INSERT INTO review_logs (id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days,
         scheduled_days, learning_steps, reviewed_at, duration_ms, updated_at, typed_ms, typed_chars)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
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
        now,
        typed ? Math.max(0, Math.round(Math.min(typed.ms, 10 * 60_000))) : null,
        typed ? typed.chars : null,
      ],
    );
  });
  return id;
}

/** Annule une révision : restaure l'état précédent et retire l'entrée d'historique. */
export async function undoReview(db: Database, before: CardRecord, logId: string, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    await writeCard(tx, before, now);
    await tx.execute('UPDATE review_logs SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', [now, logId]);
  });
}

export async function writeCard(tx: Queryable, c: CardRecord, now = Date.now()): Promise<void> {
  await tx.execute(
    `UPDATE cards SET state = ?, due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
       learning_steps = ?, reps = ?, lapses = ?, last_review = ?, updated_at = ?, dirty = 1 WHERE id = ?`,
    [c.state, c.due, c.stability, c.difficulty, c.elapsedDays, c.scheduledDays, c.learningSteps, c.reps, c.lapses, c.lastReview, now, c.id],
  );
}

/** Nombre de nouveaux mots introduits depuis `since` dans un univers (1re révision de la fiche principale). */
export async function countNewIntroduced(db: Queryable, since: number, primary: Direction, universeId: string): Promise<number> {
  const rows = await db.select<{ n: number }>(
    `SELECT COUNT(DISTINCT r.card_id) AS n FROM review_logs r
       JOIN cards c ON c.id = r.card_id
       JOIN notes n ON n.id = c.note_id
     WHERE r.deleted = 0 AND r.state = 0 AND r.reviewed_at >= ? AND c.direction = ? AND n.universe_id = ?`,
    [since, primary, universeId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Entraînement libre : journalisé, sans aucun effet sur la planification. */
export async function recordPractice(db: Database, noteId: string, mode: PracticeMode, rating: number, now = Date.now()) {
  await db.execute('INSERT INTO practice_logs (id, note_id, mode, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
    newId(),
    noteId,
    mode === 'listen' ? 'random' : mode,
    rating,
    now,
    now,
  ]);
}

export interface ReviewHistoryEntry {
  id: string;
  cardId: string;
  direction: Direction;
  rating: number;
  state: number;
  reviewedAt: number;
  scheduledDays: number;
}

export async function loadNoteHistory(db: Queryable, noteId: string): Promise<ReviewHistoryEntry[]> {
  const rows = await db.select<{
    id: string;
    card_id: string;
    direction: Direction;
    rating: number;
    state: number;
    reviewed_at: number;
    scheduled_days: number;
  }>(
    `SELECT r.id, r.card_id, c.direction, r.rating, r.state, r.reviewed_at, r.scheduled_days
     FROM review_logs r JOIN cards c ON c.id = r.card_id
     WHERE c.note_id = ? AND r.deleted = 0 ORDER BY r.reviewed_at DESC LIMIT 100`,
    [noteId],
  );
  return rows.map((r) => ({
    id: r.id,
    cardId: r.card_id,
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
export async function loadForgetCounts(db: Queryable): Promise<Map<string, number>> {
  const rows = await db.select<{ note_id: string; fails: number }>(
    `SELECT note_id, SUM(fails) AS fails FROM (
       SELECT c.note_id AS note_id, COUNT(*) AS fails FROM review_logs r JOIN cards c ON c.id = r.card_id
         WHERE r.deleted = 0 AND r.rating = 1 AND r.state <> 0 GROUP BY c.note_id
       UNION ALL
       SELECT note_id, COUNT(*) FROM practice_logs WHERE deleted = 0 AND rating = 1 GROUP BY note_id
     ) GROUP BY note_id`,
  );
  return new Map(rows.map((r) => [r.note_id, Number(r.fails)]));
}

export const DIFFICULT_THRESHOLD = 2;

/**
 * Temps de réflexion habituel pour les réponses exactes tapées dans un univers : médiane du temps de saisie
 * moins le temps de frappe estimé (`msPerChar` par caractère), sur les 200 dernières. null s'il y en a trop peu.
 */
export async function typedBaseline(db: Queryable, universeId: string, msPerChar: number, minSamples = 20): Promise<number | null> {
  const rows = await db.select<{ typed_ms: number; typed_chars: number }>(
    `SELECT r.typed_ms, r.typed_chars FROM review_logs r
       JOIN cards c ON c.id = r.card_id
       JOIN notes n ON n.id = c.note_id
     WHERE r.deleted = 0 AND r.typed_ms IS NOT NULL AND n.universe_id = ?
     ORDER BY r.reviewed_at DESC LIMIT 200`,
    [universeId],
  );
  if (rows.length < minSamples) return null;
  const thinking = rows.map((r) => Math.max(0, Number(r.typed_ms) - msPerChar * Number(r.typed_chars ?? 0))).sort((a, b) => a - b);
  return thinking[Math.floor(thinking.length / 2)];
}
