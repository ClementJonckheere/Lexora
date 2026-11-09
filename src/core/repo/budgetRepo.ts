import type { Queryable } from '../db/types';
import type { Direction } from '../domain/types';
import type { LogRow } from '../srs/dailyBudget';

const DAY = 86_400_000;

/** Données du budget quotidien : réponses des 30 derniers jours (toutes langues), nouveaux mots du jour par langue. */
export async function loadBudgetData(
  db: Queryable,
  startOfToday: number,
  primary: Direction,
  now = Date.now(),
): Promise<{ logs: (LogRow & { durationMs: number })[]; introducedToday: Record<string, number> }> {
  const [rows, introduced] = await Promise.all([
    db.select<{ card_id: string; reviewed_at: number; state: number; duration_ms: number }>(
      'SELECT card_id, reviewed_at, state, duration_ms FROM review_logs WHERE deleted = 0 AND reviewed_at >= ?',
      [now - 30 * DAY],
    ),
    db.select<{ universe_id: string; n: number }>(
      `SELECT n.universe_id, COUNT(DISTINCT r.card_id) AS n FROM review_logs r
         JOIN cards c ON c.id = r.card_id
         JOIN notes n ON n.id = c.note_id
       WHERE r.deleted = 0 AND r.state = 0 AND r.reviewed_at >= ? AND c.direction = ?
       GROUP BY n.universe_id`,
      [startOfToday, primary],
    ),
  ]);
  return {
    logs: rows.map((r) => ({ cardId: r.card_id, at: Number(r.reviewed_at), state: Number(r.state), durationMs: Number(r.duration_ms) || 0 })),
    introducedToday: Object.fromEntries(introduced.map((r) => [r.universe_id, Number(r.n)])),
  };
}
