import type { Database, Queryable } from '../db/types';
import { categorize } from '../domain/categorize';
import { expressionKey, newId } from '../domain/text';
import type { CardRecord, Direction, Note, NoteInput } from '../domain/types';
import { DIRECTIONS } from '../domain/types';
import { validateNote, type ValidatedNote } from '../domain/validation';

/*
 * Toute écriture locale positionne updated_at = maintenant et dirty = 1 :
 * la synchronisation enverra la ligne et « la plus récente gagne ».
 * Les suppressions sont douces (deleted = 1) pour se propager aux autres appareils.
 */

interface NoteRow {
  id: string;
  universe_id: string;
  expression: string;
  translation: string;
  pronunciation: string;
  expression_key: string;
  comment: string;
  category: string;
  category_auto: number;
  is_favorite: number;
  suspended: number;
  examples: string;
  tags: string;
  collection_ids: string;
  created_at: number;
  updated_at: number;
}

export interface CardRow {
  id: string;
  note_id: string;
  direction: Direction;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  last_review: number | null;
}

export function parseList(json: unknown): string[] {
  if (typeof json !== 'string') return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function mapCard(r: CardRow): CardRecord {
  return {
    id: r.id,
    noteId: r.note_id,
    direction: r.direction,
    state: Number(r.state),
    due: Number(r.due),
    stability: Number(r.stability),
    difficulty: Number(r.difficulty),
    elapsedDays: Number(r.elapsed_days),
    scheduledDays: Number(r.scheduled_days),
    learningSteps: Number(r.learning_steps),
    reps: Number(r.reps),
    lapses: Number(r.lapses),
    lastReview: r.last_review == null ? null : Number(r.last_review),
  };
}

function mapNote(r: NoteRow): Note {
  return {
    id: r.id,
    universeId: r.universe_id,
    expression: r.expression,
    translation: r.translation,
    pronunciation: r.pronunciation ?? '',
    expressionKey: r.expression_key,
    comment: r.comment,
    category: r.category,
    categoryAuto: !!Number(r.category_auto),
    isFavorite: !!Number(r.is_favorite),
    suspended: !!Number(r.suspended),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    examples: parseList(r.examples),
    tags: parseList(r.tags),
    collectionIds: parseList(r.collection_ids),
    cards: {},
  };
}

/** Charge toutes les notes non supprimées (tous univers), avec leurs fiches. */
export async function loadNotes(db: Queryable): Promise<Note[]> {
  const rows = await db.select<NoteRow>('SELECT * FROM notes WHERE deleted = 0 ORDER BY created_at DESC, id DESC');
  const cards = await db.select<CardRow>('SELECT * FROM cards WHERE deleted = 0');
  const byId = new Map<string, Note>();
  const notes = rows.map((r) => {
    const n = mapNote(r);
    byId.set(n.id, n);
    return n;
  });
  for (const c of cards) {
    const card = mapCard(c);
    const note = byId.get(card.noteId);
    // En cas de doublon (synchronisation concurrente), la fiche la plus révisée l'emporte.
    if (note && (!note.cards[card.direction] || card.reps > note.cards[card.direction]!.reps)) note.cards[card.direction] = card;
  }
  return notes;
}

function resolveCategory(v: ValidatedNote, language: string): { category: string; auto: boolean } {
  return v.category ? { category: v.category, auto: false } : { category: categorize(v.expression, language), auto: true };
}

export interface NoteTarget {
  universeId: string;
  language: string;
}

/** Insère une note validée et ses deux fiches de mémorisation (dans une transaction existante). */
export async function insertNote(tx: Queryable, v: ValidatedNote, target: NoteTarget, now: number, createdAt = now): Promise<string> {
  const { category, auto } = resolveCategory(v, target.language);
  const id = newId();
  await tx.execute(
    `INSERT INTO notes (id, universe_id, expression, translation, pronunciation, expression_key, comment, category, category_auto,
       is_favorite, examples, tags, collection_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      target.universeId,
      v.expression,
      v.translation,
      v.pronunciation,
      expressionKey(v.expression, target.language),
      v.comment,
      category,
      auto ? 1 : 0,
      v.isFavorite ? 1 : 0,
      JSON.stringify(v.examples),
      JSON.stringify(v.tags),
      JSON.stringify(v.collectionIds),
      createdAt,
      now,
    ],
  );
  for (const direction of DIRECTIONS) {
    await tx.execute('INSERT INTO cards (id, note_id, direction, state, due, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [
      newId(),
      id,
      direction,
      createdAt,
      now,
    ]);
  }
  return id;
}

export async function createNote(db: Database, input: NoteInput, target: NoteTarget, now = Date.now()): Promise<string> {
  const v = validateNote(input);
  return db.transaction((tx) => insertNote(tx, v, target, now));
}

/**
 * Met à jour une note. La planification des révisions est conservée :
 * corriger une faute ne remet pas à zéro l'apprentissage.
 */
export async function updateNote(db: Database, id: string, input: NoteInput, language: string, now = Date.now()): Promise<void> {
  const v = validateNote(input);
  const { category, auto } = resolveCategory(v, language);
  const res = await db.execute(
    `UPDATE notes SET expression = ?, translation = ?, pronunciation = ?, expression_key = ?, comment = ?, category = ?,
       category_auto = ?, is_favorite = ?, examples = ?, tags = ?, collection_ids = ?, updated_at = ?, dirty = 1
     WHERE id = ? AND deleted = 0`,
    [
      v.expression,
      v.translation,
      v.pronunciation,
      expressionKey(v.expression, language),
      v.comment,
      category,
      auto ? 1 : 0,
      v.isFavorite ? 1 : 0,
      JSON.stringify(v.examples),
      JSON.stringify(v.tags),
      JSON.stringify(v.collectionIds),
      now,
      id,
    ],
  );
  if (res.rowsAffected === 0) throw new Error("Cette note n'existe plus.");
}

/** Suppression douce de notes et de leurs fiches. */
export async function softDeleteNotes(tx: Queryable, ids: string[], now: number): Promise<void> {
  for (const id of ids) {
    await tx.execute('UPDATE notes SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', [now, id]);
    await tx.execute('UPDATE cards SET deleted = 1, updated_at = ?, dirty = 1 WHERE note_id = ?', [now, id]);
  }
}

export async function deleteNotes(db: Database, ids: string[], now = Date.now()): Promise<void> {
  if (!ids.length) return;
  await db.transaction((tx) => softDeleteNotes(tx, ids, now));
}

export async function setFavorite(db: Database, id: string, favorite: boolean, now = Date.now()): Promise<void> {
  await db.execute('UPDATE notes SET is_favorite = ?, updated_at = ?, dirty = 1 WHERE id = ?', [favorite ? 1 : 0, now, id]);
}

/** Notes existantes ayant la même clé normalisée (doublons), dans la liste fournie (un univers). */
export function findDuplicates(notes: Note[], expression: string, language: string, excludeId?: string): Note[] {
  const key = expressionKey(expression, language);
  if (!key) return [];
  return notes.filter((n) => n.expressionKey === key && n.id !== excludeId);
}

/** Modifie la liste des collections de plusieurs notes. */
export async function updateCollectionIds(
  tx: Queryable,
  noteIds: string[],
  change: (ids: string[]) => string[],
  now: number,
): Promise<void> {
  for (const id of noteIds) {
    const rows = await tx.select<{ collection_ids: string }>('SELECT collection_ids FROM notes WHERE id = ?', [id]);
    if (!rows.length) continue;
    const before = parseList(rows[0].collection_ids);
    const after = [...new Set(change(before))];
    if (after.length === before.length && after.every((x, i) => x === before[i])) continue;
    await tx.execute('UPDATE notes SET collection_ids = ?, updated_at = ?, dirty = 1 WHERE id = ?', [JSON.stringify(after), now, id]);
  }
}

/** Annule une suppression (notes et fiches supprimées en même temps). */
export async function restoreNotes(db: Database, ids: string[], now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    for (const id of ids) {
      await tx.execute('UPDATE notes SET deleted = 0, updated_at = ?, dirty = 1 WHERE id = ?', [now, id]);
      await tx.execute('UPDATE cards SET deleted = 0, updated_at = ?, dirty = 1 WHERE note_id = ? AND deleted = 1', [now, id]);
    }
  });
}

/** Suspend (exclut des révisions) ou réactive des notes. */
export async function setSuspended(db: Database, ids: string[], suspended: boolean, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    for (const id of ids) await tx.execute('UPDATE notes SET suspended = ?, updated_at = ?, dirty = 1 WHERE id = ?', [suspended ? 1 : 0, now, id]);
  });
}

/** Ajoute un tag à plusieurs notes. */
export async function addTag(db: Database, ids: string[], tag: string, now = Date.now()): Promise<void> {
  const t = tag.replace(/\s+/g, ' ').trim();
  if (!t) throw new Error('Tag vide.');
  await db.transaction(async (tx) => {
    for (const id of ids) {
      const rows = await tx.select<{ tags: string }>('SELECT tags FROM notes WHERE id = ?', [id]);
      if (!rows.length) continue;
      const tags = parseList(rows[0].tags);
      if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
      await tx.execute('UPDATE notes SET tags = ?, updated_at = ?, dirty = 1 WHERE id = ?', [JSON.stringify([...tags, t]), now, id]);
    }
  });
}

/**
 * Déplace des notes vers un autre univers (ex. mot saisi dans la mauvaise langue).
 * L'historique de révision est conservé ; les collections, propres à chaque univers, sont retirées.
 */
export async function moveNotes(db: Database, ids: string[], target: NoteTarget, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    for (const id of ids) {
      const rows = await tx.select<NoteRow>('SELECT * FROM notes WHERE id = ?', [id]);
      const n = rows[0];
      if (!n || n.universe_id === target.universeId) continue;
      const category = Number(n.category_auto) ? categorize(n.expression, target.language) : n.category;
      await tx.execute(
        `UPDATE notes SET universe_id = ?, expression_key = ?, category = ?, collection_ids = '[]', updated_at = ?, dirty = 1 WHERE id = ?`,
        [target.universeId, expressionKey(n.expression, target.language), category, now, id],
      );
    }
  });
}
