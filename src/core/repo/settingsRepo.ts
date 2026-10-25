import type { Database, Queryable } from '../db/types';
import { sanitizeSettings, type Settings } from '../domain/settings';

export async function loadSettings(db: Queryable): Promise<Settings> {
  const rows = await db.select<{ key: string; value: string }>('SELECT key, value FROM settings');
  const raw: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      raw[r.key] = JSON.parse(r.value);
    } catch {
      /* valeur corrompue : la valeur par défaut s'applique */
    }
  }
  return sanitizeSettings(raw);
}

export async function saveSettings(db: Database, patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings(db);
  const next = sanitizeSettings({ ...current, ...patch });
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(next)) {
      await tx.execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
        key,
        JSON.stringify(value),
      ]);
    }
  });
  return next;
}
