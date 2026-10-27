import type { Database, Queryable } from '../db/types';
import { DEVICE_KEYS, sanitizeSettings, type Settings } from '../domain/settings';

const isDeviceKey = (k: string) => (DEVICE_KEYS as readonly string[]).includes(k);

/** Réglages = réglages partagés (synchronisés) + réglages propres à l'appareil. */
export async function loadSettings(db: Queryable): Promise<Settings> {
  const [shared, device] = await Promise.all([
    db.select<{ key: string; value: string }>('SELECT key, value FROM settings'),
    db.select<{ key: string; value: string }>('SELECT key, value FROM device_settings'),
  ]);
  const raw: Record<string, unknown> = {};
  for (const r of [...shared.filter((r) => !isDeviceKey(r.key)), ...device]) {
    try {
      raw[r.key] = JSON.parse(r.value);
    } catch {
      /* valeur corrompue : la valeur par défaut s'applique */
    }
  }
  return sanitizeSettings(raw);
}

export async function saveSettings(db: Database, patch: Partial<Settings>, now = Date.now()): Promise<Settings> {
  const current = await loadSettings(db);
  const next = sanitizeSettings({ ...current, ...patch });
  await db.transaction(async (tx) => {
    for (const key of Object.keys(patch) as (keyof Settings)[]) {
      const value = JSON.stringify(next[key]);
      if (JSON.stringify(current[key]) === value) continue;
      if (isDeviceKey(key)) {
        await tx.execute('INSERT INTO device_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
      } else {
        await tx.execute(
          `INSERT INTO settings (key, value, updated_at, dirty) VALUES (?, ?, ?, 1)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, dirty = 1`,
          [key, value, now],
        );
      }
    }
  });
  return next;
}
