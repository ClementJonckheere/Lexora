import type { Database, Queryable, SqlValue } from '../db/types';
import { categorize } from '../domain/categorize';
import { expressionKey } from '../domain/text';
import type { CardRecord, Direction, Note, NoteInput } from '../domain/types';
import { DIRECTIONS } from '../domain/types';
import { validateNote, type ValidatedNote } from '../domain/validation';

interface NoteRow {
  id: number;
  expression: string;
  translation: string;
  expression_key: string;
  comment: string;
  category: string;
  category_auto: number;
  is_favorite: number;
  created_at: number;
  updated_at: number;
}

export interface CardRow {
  id: number;
  note_id: number;
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

export function mapCard(r: CardRow): CardRecord {
  return {
    id: Number(r.id),
    noteId: Number(r.note_id),
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

/** Charge toute la bibliothèque en 5 requêtes (assemblage en mémoire, très rapide jusqu'à des dizaines de milliers de notes). */
export async function loadNotes(db: Queryable): Promise<Note[]> {
  const [rows, examples, tags, colls, cards] = await Promise.all([
    db.select<NoteRow>('SELECT * FROM notes ORDER BY created_at DESC, id DESC'),
    db.select<{ note_id: number; sentence: string }>('SELECT note_id, sentence FROM examples ORDER BY note_id, position, id'),
    db.select<{ note_id: number; name: string }>(
      'SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id ORDER BY t.name COLLATE NOCASE',
    ),
    db.select<{ note_id: number; collection_id: number }>('SELECT note_id, collection_id FROM collection_notes'),
    db.select<CardRow>('SELECT * FROM cards'),
  ]);

  const byId = new Map<number, Note>();
  const notes = rows.map((r) => {
    const n: Note = {
      id: Number(r.id),
      expression: r.expression,
      translation: r.translation,
      expressionKey: r.expression_key,
      comment: r.comment,
      category: r.category,
      categoryAuto: !!r.category_auto,
      isFavorite: !!r.is_favorite,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      examples: [],
      tags: [],
      collectionIds: [],
      cards: {},
    };
    byId.set(n.id, n);
    return n;
  });
  for (const e of examples) byId.get(Number(e.note_id))?.examples.push(e.sentence);
  for (const t of tags) byId.get(Number(t.note_id))?.tags.push(t.name);
  for (const c of colls) byId.get(Number(c.note_id))?.collectionIds.push(Number(c.collection_id));
  for (const c of cards) {
    const card = mapCard(c);
    const note = byId.get(card.noteId);
    if (note) note.cards[card.direction] = card;
  }
  return notes;
}

function resolveCategory(v: ValidatedNote): { category: string; auto: boolean } {
  return v.category ? { category: v.category, auto: false } : { category: categorize(v.expression), auto: true };
}

async function setExamples(tx: Queryable, noteId: number, examples: string[]) {
  await tx.execute('DELETE FROM examples WHERE note_id = ?', [noteId]);
  for (let i = 0; i < examples.length; i++) {
    await tx.execute('INSERT INTO examples (note_id, sentence, position) VALUES (?, ?, ?)', [noteId, examples[i], i]);
  }
}

async function setTags(tx: Queryable, noteId: number, tags: string[]) {
  await tx.execute('DELETE FROM note_tags WHERE note_id = ?', [noteId]);
  for (const name of tags) {
    await tx.execute('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name]);
    await tx.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) SELECT ?, id FROM tags WHERE name = ?', [noteId, name]);
  }
}

async function setCollections(tx: Queryable, noteId: number, collectionIds: number[], now: number) {
  const placeholders = collectionIds.map(() => '?').join(',');
  await tx.execute(
    collectionIds.length
      ? `DELETE FROM collection_notes WHERE note_id = ? AND collection_id NOT IN (${placeholders})`
      : 'DELETE FROM collection_notes WHERE note_id = ?',
    [noteId, ...collectionIds],
  );
  for (const cid of collectionIds) {
    await tx.execute('INSERT OR IGNORE INTO collection_notes (collection_id, note_id, added_at) VALUES (?, ?, ?)', [cid, noteId, now]);
  }
}

export async function deleteOrphanTags(tx: Queryable) {
  await tx.execute('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)');
}

/** Insère une note validée et ses deux fiches de mémorisation (dans une transaction existante). */
export async function insertNote(tx: Queryable, v: ValidatedNote, now: number, createdAt = now): Promise<number> {
  const { category, auto } = resolveCategory(v);
  const res = await tx.execute(
    `INSERT INTO notes (expression, translation, expression_key, comment, category, category_auto, is_favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [v.expression, v.translation, expressionKey(v.expression), v.comment, category, auto ? 1 : 0, v.isFavorite ? 1 : 0, createdAt, now],
  );
  const id = res.lastInsertId;
  for (const direction of DIRECTIONS) {
    await tx.execute('INSERT INTO cards (note_id, direction, state, due) VALUES (?, ?, 0, ?)', [id, direction, createdAt]);
  }
  await setExamples(tx, id, v.examples);
  await setTags(tx, id, v.tags);
  await setCollections(tx, id, v.collectionIds, now);
  return id;
}

export async function createNote(db: Database, input: NoteInput, now = Date.now()): Promise<number> {
  const v = validateNote(input);
  return db.transaction((tx) => insertNote(tx, v, now));
}

/**
 * Met à jour une note. La planification des révisions est conservée :
 * corriger une faute ne remet pas à zéro l'apprentissage.
 */
export async function updateNote(db: Database, id: number, input: NoteInput, now = Date.now()): Promise<void> {
  const v = validateNote(input);
  await db.transaction(async (tx) => {
    const { category, auto } = resolveCategory(v);
    const res = await tx.execute(
      `UPDATE notes SET expression = ?, translation = ?, expression_key = ?, comment = ?, category = ?,
         category_auto = ?, is_favorite = ?, updated_at = ? WHERE id = ?`,
      [v.expression, v.translation, expressionKey(v.expression), v.comment, category, auto ? 1 : 0, v.isFavorite ? 1 : 0, now, id],
    );
    if (res.rowsAffected === 0) throw new Error('Cette note n’existe plus.');
    await setExamples(tx, id, v.examples);
    await setTags(tx, id, v.tags);
    await setCollections(tx, id, v.collectionIds, now);
    await deleteOrphanTags(tx);
  });
}

export async function deleteNotes(db: Database, ids: number[]): Promise<void> {
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    for (const id of ids) await tx.execute('DELETE FROM notes WHERE id = ?', [id]);
    await deleteOrphanTags(tx);
  });
}

export async function setFavorite(db: Database, id: number, favorite: boolean): Promise<void> {
  await db.execute('UPDATE notes SET is_favorite = ? WHERE id = ?', [favorite ? 1 : 0, id]);
}

/** Notes existantes ayant la même clé normalisée (doublons). */
export function findDuplicates(notes: Note[], expression: string, excludeId?: number): Note[] {
  const key = expressionKey(expression);
  if (!key) return [];
  return notes.filter((n) => n.expressionKey === key && n.id !== excludeId);
}

export async function renameTag(db: Database, from: string, to: string): Promise<void> {
  const target = to.trim();
  if (!target) throw new Error('Nom de tag vide.');
  await db.transaction(async (tx) => {
    await tx.execute('INSERT OR IGNORE INTO tags (name) VALUES (?)', [target]);
    const params: SqlValue[] = [target, from];
    await tx.execute(
      `INSERT OR IGNORE INTO note_tags (note_id, tag_id)
       SELECT nt.note_id, (SELECT id FROM tags WHERE name = ?) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE t.name = ?`,
      params,
    );
    if (target.toLowerCase() !== from.toLowerCase()) await tx.execute('DELETE FROM tags WHERE name = ?', [from]);
    else await tx.execute('UPDATE tags SET name = ? WHERE name = ?', [target, from]);
    await deleteOrphanTags(tx);
  });
}
