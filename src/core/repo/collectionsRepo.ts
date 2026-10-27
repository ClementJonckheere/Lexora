import type { Database, Queryable } from '../db/types';
import { cleanText, newId } from '../domain/text';
import type { Collection } from '../domain/types';
import { LIMITS } from '../domain/validation';
import { parseList, updateCollectionIds } from './notesRepo';

interface CollectionRow {
  id: string;
  universe_id: string;
  name: string;
  description: string;
  created_at: number;
}

export async function loadCollections(db: Queryable): Promise<Collection[]> {
  const rows = await db.select<CollectionRow>('SELECT * FROM collections WHERE deleted = 0 ORDER BY name COLLATE NOCASE');
  return rows.map((r) => ({ id: r.id, universeId: r.universe_id, name: r.name, description: r.description, createdAt: Number(r.created_at) }));
}

function validateName(name: string): string {
  const v = cleanText(name);
  if (!v) throw new Error('Le nom de la collection est obligatoire.');
  if (v.length > LIMITS.collectionName) throw new Error(`${LIMITS.collectionName} caractères maximum.`);
  return v;
}

async function assertUnique(tx: Queryable, universeId: string, name: string, excludeId?: string) {
  const rows = await tx.select<{ id: string }>(
    'SELECT id FROM collections WHERE universe_id = ? AND deleted = 0 AND lower(name) = lower(?) AND id <> ?',
    [universeId, name, excludeId ?? ''],
  );
  if (rows.length) throw new Error('Une collection porte déjà ce nom.');
}

export async function insertCollection(tx: Queryable, universeId: string, name: string, description: string, now: number): Promise<string> {
  const v = validateName(name);
  await assertUnique(tx, universeId, v);
  const id = newId();
  await tx.execute('INSERT INTO collections (id, universe_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    universeId,
    v,
    description.trim(),
    now,
    now,
  ]);
  return id;
}

export async function createCollection(db: Database, universeId: string, name: string, description = '', now = Date.now()): Promise<string> {
  return db.transaction((tx) => insertCollection(tx, universeId, name, description, now));
}

export async function updateCollection(db: Database, id: string, name: string, description: string, now = Date.now()): Promise<void> {
  const v = validateName(name);
  await db.transaction(async (tx) => {
    const rows = await tx.select<{ universe_id: string }>('SELECT universe_id FROM collections WHERE id = ?', [id]);
    if (!rows.length) throw new Error('Collection introuvable.');
    await assertUnique(tx, rows[0].universe_id, v, id);
    await tx.execute('UPDATE collections SET name = ?, description = ?, updated_at = ?, dirty = 1 WHERE id = ?', [v, description.trim(), now, id]);
  });
}

/** Supprime la collection, pas les notes qu'elle contient. */
export async function deleteCollection(db: Database, id: string, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute('UPDATE collections SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', [now, id]);
    const notes = await tx.select<{ id: string; collection_ids: string }>(
      "SELECT id, collection_ids FROM notes WHERE deleted = 0 AND collection_ids LIKE '%' || ? || '%'",
      [id],
    );
    await updateCollectionIds(
      tx,
      notes.filter((n) => parseList(n.collection_ids).includes(id)).map((n) => n.id),
      (ids) => ids.filter((x) => x !== id),
      now,
    );
  });
}

export async function addToCollection(db: Database, collectionId: string, noteIds: string[], now = Date.now()): Promise<void> {
  await db.transaction((tx) => updateCollectionIds(tx, noteIds, (ids) => [...ids, collectionId], now));
}

export async function removeFromCollection(db: Database, collectionId: string, noteIds: string[], now = Date.now()): Promise<void> {
  await db.transaction((tx) => updateCollectionIds(tx, noteIds, (ids) => ids.filter((x) => x !== collectionId), now));
}
