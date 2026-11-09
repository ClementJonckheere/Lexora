import type { Queryable } from '../db/types';
import type { LogRow } from '../srs/dailyBudget';

const DAY = 86_400_000;

/** Réponses des 30 derniers jours (toutes langues), pour le budget quotidien. */
export async function loadBudgetLogs(db: Queryable, now = Date.now()): Promise<(LogRow & { durationMs: number })[]> {
  const rows = await db.select<{ card_id: string; reviewed_at: number; state: number; duration_ms: number }>(
    'SELECT card_id, reviewed_at, state, duration_ms FROM review_logs WHERE deleted = 0 AND reviewed_at >= ?',
    [now - 30 * DAY],
  );
  return rows.map((r) => ({ cardId: r.card_id, at: Number(r.reviewed_at), state: Number(r.state), durationMs: Number(r.duration_ms) || 0 }));
}
