import type { Queryable } from '../db/types';
import type { ReviewRow } from '../srs/optimizer';

/** Historique des révisions (toutes langues), avec la langue de chaque fiche, pour l'optimisation FSRS. */
export async function loadReviewHistory(db: Queryable): Promise<(ReviewRow & { universeId: string })[]> {
  const rows = await db.select<{ card_id: string; reviewed_at: number; rating: number; state: number; universe_id: string }>(
    `SELECT l.card_id, l.reviewed_at, l.rating, l.state, n.universe_id
       FROM review_logs l JOIN cards c ON c.id = l.card_id JOIN notes n ON n.id = c.note_id
      WHERE l.deleted = 0`,
  );
  return rows.map((r) => ({ cardId: r.card_id, at: Number(r.reviewed_at), rating: Number(r.rating), state: Number(r.state), universeId: r.universe_id }));
}
