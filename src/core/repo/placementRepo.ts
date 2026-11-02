import type { Queryable } from '../db/types';
import type { PlacementMark } from '../learn/placementResults';

/** Corrections du placement d'un univers (table `placement_marks`), une ligne par point et par nature. */
export async function loadPlacementMarks(db: Queryable, universeId: string): Promise<PlacementMark[]> {
  const rows = await db.select<{ kind: string; point_id: string; data: string; updated_at: number }>(
    'SELECT kind, point_id, data, updated_at FROM placement_marks WHERE universe_id = ? AND deleted = 0',
    [universeId],
  );
  const out: PlacementMark[] = [];
  for (const r of rows) {
    if (r.kind !== 'override' && r.kind !== 'check') continue;
    try {
      out.push({ kind: r.kind, pointId: r.point_id, data: JSON.parse(r.data), at: Number(r.updated_at) });
    } catch {
      /* ligne illisible : ignorée */
    }
  }
  return out;
}

export async function savePlacementMark(db: Queryable, universeId: string, mark: Omit<PlacementMark, 'at'>, now = Date.now()): Promise<void> {
  await db.execute(
    `INSERT OR REPLACE INTO placement_marks (mark_key, universe_id, kind, point_id, data, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
    [`${universeId}|${mark.kind}|${mark.pointId}`, universeId, mark.kind, mark.pointId, JSON.stringify(mark.data ?? null), now],
  );
}
