import type { Database, Queryable } from '../db/types';
import { cleanText, newId } from '../domain/text';
import type { Universe } from '../domain/types';
import { softDeleteNotes } from './notesRepo';

interface UniverseRow {
  id: string;
  name: string;
  language: string;
  position: number;
  new_per_day: number | null;
  created_at: number;
  updated_at: number;
}

export async function loadUniverses(db: Queryable): Promise<Universe[]> {
  const rows = await db.select<UniverseRow>('SELECT * FROM universes WHERE deleted = 0 ORDER BY position, created_at');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    language: r.language,
    position: Number(r.position),
    newPerDay: r.new_per_day == null ? null : Number(r.new_per_day),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }));
}

function validate(name: string, language: string) {
  const n = cleanText(name);
  const l = cleanText(language).toLowerCase();
  if (!n) throw new Error("Le nom de l'univers est obligatoire.");
  if (n.length > 40) throw new Error('40 caractères maximum.');
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(l)) throw new Error('Code de langue invalide (ex. « en », « es », « zh »).');
  return { name: n, language: l };
}

export async function createUniverse(db: Database, name: string, language: string, now = Date.now()): Promise<string> {
  const v = validate(name, language);
  return db.transaction(async (tx) => {
    const dup = await tx.select('SELECT id FROM universes WHERE deleted = 0 AND lower(name) = lower(?)', [v.name]);
    if (dup.length) throw new Error('Un univers porte déjà ce nom.');
    const pos = await tx.select<{ p: number | null }>('SELECT max(position) AS p FROM universes WHERE deleted = 0');
    const id = newId();
    await tx.execute('INSERT INTO universes (id, name, language, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      v.name,
      v.language,
      Number(pos[0]?.p ?? -1) + 1,
      now,
      now,
    ]);
    return id;
  });
}

export async function renameUniverse(db: Database, id: string, name: string, now = Date.now()): Promise<void> {
  const n = cleanText(name);
  if (!n) throw new Error("Le nom de l'univers est obligatoire.");
  await db.execute('UPDATE universes SET name = ?, updated_at = ?, dirty = 1 WHERE id = ?', [n, now, id]);
}

/** Plafond de nouveaux mots propre à l'univers (null = réglage général). */
export async function setUniverseNewPerDay(db: Database, id: string, value: number | null, now = Date.now()): Promise<void> {
  const v = value == null ? null : Math.round(Math.min(200, Math.max(0, value)));
  await db.execute('UPDATE universes SET new_per_day = ?, updated_at = ?, dirty = 1 WHERE id = ?', [v, now, id]);
}

/** Supprime un univers avec toutes ses notes, fiches et collections. */
export async function deleteUniverse(db: Database, id: string, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    const notes = await tx.select<{ id: string }>('SELECT id FROM notes WHERE universe_id = ? AND deleted = 0', [id]);
    await softDeleteNotes(
      tx,
      notes.map((n) => n.id),
      now,
    );
    await tx.execute('UPDATE collections SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE books SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE word_marks SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE vocab_tests SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE vocab_observations SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE grammar_answers SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE note_entries SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE typed_answers SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE reading_sessions SET deleted = 1, updated_at = ?, dirty = 1 WHERE universe_id = ? AND deleted = 0', [now, id]);
    await tx.execute('UPDATE universes SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', [now, id]);
  });
}
