import type { Database, Queryable, SqlValue } from '../db/types';
import { SYNC_TABLES, type RemoteRow, type SyncTable } from './tables';

/**
 * Synchronisation « hors ligne d'abord ».
 *
 * - La base SQLite locale reste la référence de l'interface : tout fonctionne sans réseau.
 * - Chaque ligne modifiée localement est marquée `dirty` puis envoyée au serveur.
 * - Conflits : la version dont `updated_at` est la plus récente l'emporte (ligne par ligne),
 *   côté client comme côté serveur (déclencheur PostgreSQL).
 * - Réception : le serveur horodate chaque écriture (`server_updated_at`) ; on récupère tout ce
 *   qui a changé depuis le dernier curseur (avec un recouvrement de sécurité).
 * - L'historique des révisions est en ajout seul : les révisions faites sur plusieurs appareils s'additionnent.
 */

export interface Remote {
  /** Envoie des lignes (upsert, « la plus récente gagne » côté serveur). */
  push(table: SyncTable, rows: RemoteRow[]): Promise<void>;
  /** Lignes modifiées strictement après (since, afterKey), triées par (server_updated_at, clé). */
  pull(table: SyncTable, since: number, afterKey: string, limit: number): Promise<RemoteRow[]>;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
}

const PAGE = 500;
/** Recouvrement du curseur : couvre les transactions validées dans le désordre côté serveur. */
const OVERLAP_MS = 5_000;

type LocalRow = Record<string, unknown>;

export async function getSyncState(db: Queryable, key: string): Promise<string | null> {
  const rows = await db.select<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
}

export async function setSyncState(db: Queryable, key: string, value: string | null): Promise<void> {
  if (value === null) await db.execute('DELETE FROM sync_state WHERE key = ?', [key]);
  else await db.execute('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

function toRemote(table: SyncTable, row: LocalRow): RemoteRow {
  const out: RemoteRow = {};
  for (const c of table.columns) {
    const v = row[c];
    if (table.json?.includes(c)) {
      try {
        out[c] = JSON.parse(String(v ?? '[]'));
      } catch {
        out[c] = [];
      }
    } else out[c] = v ?? null;
  }
  return out;
}

function toLocal(table: SyncTable, row: RemoteRow): SqlValue[] {
  return table.columns.map((c) => {
    const v = row[c];
    if (table.json?.includes(c)) return JSON.stringify(Array.isArray(v) ? v : []);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return (v ?? null) as SqlValue;
  });
}

/** Applique des lignes reçues : insertion, ou mise à jour si la version reçue est plus récente. */
async function applyRemote(tx: Queryable, table: SyncTable, rows: RemoteRow[]): Promise<number> {
  const cols = table.columns;
  const updates = cols.filter((c) => c !== table.key).map((c) => `${c} = excluded.${c}`);
  const sql = `INSERT INTO ${table.name} (${cols.join(', ')}, dirty) VALUES (${cols.map(() => '?').join(', ')}, 0)
    ON CONFLICT(${table.key}) DO UPDATE SET ${updates.join(', ')}, dirty = 0
    WHERE excluded.updated_at > ${table.name}.updated_at`;
  let changed = 0;
  for (const r of rows) {
    const res = await tx.execute(sql, toLocal(table, r));
    changed += res.rowsAffected;
  }
  return changed;
}

async function pullTable(db: Database, remote: Remote, table: SyncTable): Promise<number> {
  const cursorKey = `cursor:${table.name}`;
  const saved = Number((await getSyncState(db, cursorKey)) ?? 0);
  let since = Math.max(0, saved - OVERLAP_MS);
  let afterKey = '';
  let maxSeen = saved;
  let changed = 0;
  for (;;) {
    const rows = await remote.pull(table, since, afterKey, PAGE);
    if (!rows.length) break;
    changed += await db.transaction((tx) => applyRemote(tx, table, rows));
    const last = rows[rows.length - 1];
    since = Number(last.server_updated_at ?? since);
    afterKey = String(last[table.key]);
    maxSeen = Math.max(maxSeen, since);
    if (rows.length < PAGE) break;
  }
  if (maxSeen !== saved) await setSyncState(db, cursorKey, String(maxSeen));
  return changed;
}

async function pushTable(db: Database, remote: Remote, table: SyncTable): Promise<number> {
  let pushed = 0;
  for (;;) {
    const rows = await db.select<LocalRow>(`SELECT * FROM ${table.name} WHERE dirty = 1 LIMIT ${PAGE}`);
    if (!rows.length) break;
    await remote.push(
      table,
      rows.map((r) => toRemote(table, r)),
    );
    // Une ligne modifiée pendant l'envoi reste « dirty » (updated_at différent).
    await db.transaction(async (tx) => {
      for (const r of rows) {
        await tx.execute(`UPDATE ${table.name} SET dirty = 0 WHERE ${table.key} = ? AND updated_at = ?`, [
          r[table.key] as SqlValue,
          r.updated_at as SqlValue,
        ]);
      }
    });
    pushed += rows.length;
    if (rows.length < PAGE) break;
  }
  return pushed;
}

/** Un cycle complet : réception puis envoi, table par table dans l'ordre de dépendance. */
export async function syncOnce(db: Database, remote: Remote): Promise<SyncResult> {
  let pulled = 0;
  let pushed = 0;
  for (const t of SYNC_TABLES) pulled += await pullTable(db, remote, t);
  for (const t of SYNC_TABLES) pushed += await pushTable(db, remote, t);
  await setSyncState(db, 'last_sync', String(Date.now()));
  return { pulled, pushed };
}

export async function pendingChanges(db: Queryable): Promise<number> {
  let n = 0;
  for (const t of SYNC_TABLES) {
    const rows = await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t.name} WHERE dirty = 1`);
    n += Number(rows[0]?.n ?? 0);
  }
  return n;
}

export type BindResult = 'bound' | 'same' | 'other-account';

/**
 * Rattache la base locale à un compte.
 * - Base jamais liée : ses données (déjà marquées à envoyer) rejoignent le compte.
 * - Même compte : rien à faire.
 * - Autre compte : `other-account` ; l'appelant demande confirmation puis appelle `resetLocalData`.
 */
export async function bindAccount(db: Database, userId: string): Promise<BindResult> {
  const current = await getSyncState(db, 'user_id');
  if (current === userId) return 'same';
  if (current) return 'other-account';
  await setSyncState(db, 'user_id', userId);
  return 'bound';
}

/** Efface les données locales (avant de charger un autre compte). */
export async function resetLocalData(db: Database, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of SYNC_TABLES) await tx.execute(`DELETE FROM ${t.name}`);
    await tx.execute('DELETE FROM sync_state');
    await tx.execute('INSERT INTO sync_state (key, value) VALUES (?, ?)', ['user_id', userId]);
  });
}
