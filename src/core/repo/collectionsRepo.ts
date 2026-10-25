import type { Database, Queryable } from '../db/types';
import { cleanText } from '../domain/text';
import type { Collection } from '../domain/types';
import { LIMITS } from '../domain/validation';

interface CollectionRow {
  id: number;
  name: string;
  description: string;
  created_at: number;
}

export async function loadCollections(db: Queryable): Promise<Collection[]> {
  const rows = await db.select<CollectionRow>('SELECT * FROM collections ORDER BY name COLLATE NOCASE');
  return rows.map((r) => ({ id: Number(r.id), name: r.name, description: r.description, createdAt: Number(r.created_at) }));
}

function validateName(name: string): string {
  const v = cleanText(name);
  if (!v) throw new Error('Le nom de la collection est obligatoire.');
  if (v.length > LIMITS.collectionName) throw new Error(`${LIMITS.collectionName} caractères maximum.`);
  return v;
}

function friendly(err: unknown): never {
  if (err instanceof Error && /UNIQUE/i.test(err.message)) throw new Error('Une collection porte déjà ce nom.');
  throw err;
}

export async function createCollection(db: Database, name: string, description = '', now = Date.now()): Promise<number> {
  const v = validateName(name);
  try {
    const res = await db.execute('INSERT INTO collections (name, description, created_at) VALUES (?, ?, ?)', [v, description.trim(), now]);
    return res.lastInsertId;
  } catch (err) {
    friendly(err);
  }
}

export async function updateCollection(db: Database, id: number, name: string, description: string): Promise<void> {
  const v = validateName(name);
  try {
    await db.execute('UPDATE collections SET name = ?, description = ? WHERE id = ?', [v, description.trim(), id]);
  } catch (err) {
    friendly(err);
  }
}

/** Supprime la collection, pas les notes qu'elle contient. */
export async function deleteCollection(db: Database, id: number): Promise<void> {
  await db.execute('DELETE FROM collections WHERE id = ?', [id]);
}

export async function addToCollection(db: Database, collectionId: number, noteIds: number[], now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    for (const id of noteIds) {
      await tx.execute('INSERT OR IGNORE INTO collection_notes (collection_id, note_id, added_at) VALUES (?, ?, ?)', [collectionId, id, now]);
    }
  });
}

export async function removeFromCollection(db: Database, collectionId: number, noteIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const id of noteIds) {
      await tx.execute('DELETE FROM collection_notes WHERE collection_id = ? AND note_id = ?', [collectionId, id]);
    }
  });
}
