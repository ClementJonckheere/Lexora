import type { Migration } from './migrations';
import type { Queryable } from './types';
import { expressionKey } from '../domain/text';

/**
 * v2 — univers (une langue par univers) et synchronisation entre appareils.
 *
 * - Identifiants universels (UUID) au lieu d'entiers locaux.
 * - Colonnes de synchronisation sur chaque table partagée :
 *     updated_at (ms, horodatage client → « la plus récente gagne »),
 *     deleted    (suppression douce, propagée aux autres appareils),
 *     dirty      (1 = modification locale pas encore envoyée).
 * - Exemples, tags et appartenance aux collections stockés en JSON dans la note
 *   (une note = une ligne à synchroniser).
 * - Pas de clés étrangères : l'ordre d'arrivée des lignes synchronisées n'est pas garanti.
 *
 * Les données v1 sont conservées dans un univers « Anglais ».
 */

const SYNC_COLS = `updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 1`;

export const V2_TABLES = [
  `CREATE TABLE universes (
    id          TEXT PRIMARY KEY,
    name        TEXT    NOT NULL,
    language    TEXT    NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    ${SYNC_COLS}
  )`,
  `CREATE TABLE notes (
    id              TEXT PRIMARY KEY,
    universe_id     TEXT    NOT NULL,
    expression      TEXT    NOT NULL,
    translation     TEXT    NOT NULL,
    pronunciation   TEXT    NOT NULL DEFAULT '',
    expression_key  TEXT    NOT NULL,
    comment         TEXT    NOT NULL DEFAULT '',
    category        TEXT    NOT NULL DEFAULT '',
    category_auto   INTEGER NOT NULL DEFAULT 1,
    is_favorite     INTEGER NOT NULL DEFAULT 0,
    examples        TEXT    NOT NULL DEFAULT '[]',
    tags            TEXT    NOT NULL DEFAULT '[]',
    collection_ids  TEXT    NOT NULL DEFAULT '[]',
    created_at      INTEGER NOT NULL,
    ${SYNC_COLS}
  )`,
  `CREATE INDEX idx_notes_universe ON notes(universe_id, deleted)`,
  `CREATE INDEX idx_notes_key ON notes(expression_key)`,
  `CREATE TABLE collections (
    id           TEXT PRIMARY KEY,
    universe_id  TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL,
    ${SYNC_COLS}
  )`,
  `CREATE TABLE cards (
    id              TEXT PRIMARY KEY,
    note_id         TEXT    NOT NULL,
    direction       TEXT    NOT NULL CHECK (direction IN ('fr_en', 'en_fr')),
    state           INTEGER NOT NULL DEFAULT 0,
    due             INTEGER NOT NULL,
    stability       REAL    NOT NULL DEFAULT 0,
    difficulty      REAL    NOT NULL DEFAULT 0,
    elapsed_days    INTEGER NOT NULL DEFAULT 0,
    scheduled_days  INTEGER NOT NULL DEFAULT 0,
    learning_steps  INTEGER NOT NULL DEFAULT 0,
    reps            INTEGER NOT NULL DEFAULT 0,
    lapses          INTEGER NOT NULL DEFAULT 0,
    last_review     INTEGER,
    ${SYNC_COLS}
  )`,
  `CREATE INDEX idx_cards_note ON cards(note_id)`,
  `CREATE INDEX idx_cards_due ON cards(state, due)`,
  `CREATE TABLE review_logs (
    id                 TEXT PRIMARY KEY,
    card_id            TEXT    NOT NULL,
    rating             INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
    state              INTEGER NOT NULL,
    due                INTEGER NOT NULL,
    stability          REAL    NOT NULL,
    difficulty         REAL    NOT NULL,
    elapsed_days       INTEGER NOT NULL,
    last_elapsed_days  INTEGER NOT NULL,
    scheduled_days     INTEGER NOT NULL,
    learning_steps     INTEGER NOT NULL,
    reviewed_at        INTEGER NOT NULL,
    duration_ms        INTEGER NOT NULL DEFAULT 0,
    ${SYNC_COLS}
  )`,
  `CREATE INDEX idx_review_logs_card ON review_logs(card_id, reviewed_at)`,
  `CREATE INDEX idx_review_logs_time ON review_logs(reviewed_at)`,
  `CREATE TABLE practice_logs (
    id          TEXT PRIMARY KEY,
    note_id     TEXT    NOT NULL,
    mode        TEXT    NOT NULL CHECK (mode IN ('cloze', 'random', 'difficult')),
    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
    created_at  INTEGER NOT NULL,
    ${SYNC_COLS}
  )`,
  `CREATE INDEX idx_practice_logs_note ON practice_logs(note_id)`,
  // Réglages partagés entre appareils.
  `CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL,
    dirty       INTEGER NOT NULL DEFAULT 1
  )`,
  // Réglages propres à cet appareil (voix, raccourci global…).
  `CREATE TABLE device_settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  )`,
  // État de la synchronisation (compte lié, curseurs).
  `CREATE TABLE sync_state (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  )`,
];

const V1_TABLES = ['note_tags', 'examples', 'collection_notes', 'review_logs', 'practice_logs', 'cards', 'notes', 'tags', 'collections', 'settings'];
const V1_INDEXES = [
  'idx_notes_key', 'idx_notes_created', 'idx_examples_note', 'idx_note_tags_tag', 'idx_collection_notes_note',
  'idx_cards_due', 'idx_review_logs_card', 'idx_review_logs_time', 'idx_practice_logs_note',
];
const DEVICE_KEYS = new Set(['ttsRate', 'globalShortcut']);

type Row = Record<string, unknown>;
const uuid = () => crypto.randomUUID();

async function migrateData(tx: Queryable): Promise<void> {
  const now = Date.now();
  const all = async (t: string) => tx.select<Row>(`SELECT * FROM ${t}_v1`);
  const [notes, examples, tags, colls, collNotes, cards, reviews, practices, settings] = await Promise.all([
    all('notes'),
    tx.select<Row>('SELECT note_id, sentence FROM examples_v1 ORDER BY note_id, position, id'),
    tx.select<Row>('SELECT nt.note_id, t.name FROM note_tags_v1 nt JOIN tags_v1 t ON t.id = nt.tag_id ORDER BY t.name'),
    all('collections'),
    all('collection_notes'),
    all('cards'),
    all('review_logs'),
    all('practice_logs'),
    all('settings'),
  ]);

  // Univers par défaut, uniquement s'il y a quelque chose à y ranger.
  const universeId = uuid();
  if (notes.length || colls.length) {
    await tx.execute('INSERT INTO universes (id, name, language, position, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [
      universeId,
      'Anglais',
      'en',
      now,
      now,
    ]);
  }

  const collId = new Map<number, string>();
  for (const c of colls) {
    const id = uuid();
    collId.set(Number(c.id), id);
    await tx.execute('INSERT INTO collections (id, universe_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      universeId,
      c.name as string,
      c.description as string,
      Number(c.created_at),
      now,
    ]);
  }

  const group = (rows: Row[], key: string, value: (r: Row) => string) => {
    const m = new Map<number, string[]>();
    for (const r of rows) {
      const k = Number(r[key]);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(value(r));
    }
    return m;
  };
  const exByNote = group(examples, 'note_id', (r) => r.sentence as string);
  const tagsByNote = group(tags, 'note_id', (r) => r.name as string);
  const collsByNote = group(collNotes, 'note_id', (r) => collId.get(Number(r.collection_id)) ?? '');

  const noteId = new Map<number, string>();
  for (const n of notes) {
    const id = uuid();
    noteId.set(Number(n.id), id);
    await tx.execute(
      `INSERT INTO notes (id, universe_id, expression, translation, expression_key, comment, category, category_auto, is_favorite,
         examples, tags, collection_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        universeId,
        n.expression as string,
        n.translation as string,
        expressionKey(n.expression as string, 'en'),
        n.comment as string,
        n.category as string,
        Number(n.category_auto),
        Number(n.is_favorite),
        JSON.stringify(exByNote.get(Number(n.id)) ?? []),
        JSON.stringify(tagsByNote.get(Number(n.id)) ?? []),
        JSON.stringify((collsByNote.get(Number(n.id)) ?? []).filter(Boolean)),
        Number(n.created_at),
        Math.max(Number(n.updated_at), now),
      ],
    );
  }

  const cardId = new Map<number, string>();
  for (const c of cards) {
    const nid = noteId.get(Number(c.note_id));
    if (!nid) continue;
    const id = uuid();
    cardId.set(Number(c.id), id);
    await tx.execute(
      `INSERT INTO cards (id, note_id, direction, state, due, stability, difficulty, elapsed_days, scheduled_days,
         learning_steps, reps, lapses, last_review, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, nid, c.direction as string, Number(c.state), Number(c.due), Number(c.stability), Number(c.difficulty),
        Number(c.elapsed_days), Number(c.scheduled_days), Number(c.learning_steps), Number(c.reps), Number(c.lapses),
        c.last_review == null ? null : Number(c.last_review), now,
      ],
    );
  }

  for (const r of reviews) {
    const cid = cardId.get(Number(r.card_id));
    if (!cid) continue;
    await tx.execute(
      `INSERT INTO review_logs (id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days,
         scheduled_days, learning_steps, reviewed_at, duration_ms, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(), cid, Number(r.rating), Number(r.state), Number(r.due), Number(r.stability), Number(r.difficulty),
        Number(r.elapsed_days), Number(r.last_elapsed_days), Number(r.scheduled_days), Number(r.learning_steps),
        Number(r.reviewed_at), Number(r.duration_ms), now,
      ],
    );
  }

  for (const p of practices) {
    const nid = noteId.get(Number(p.note_id));
    if (!nid) continue;
    await tx.execute('INSERT INTO practice_logs (id, note_id, mode, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      uuid(), nid, p.mode as string, Number(p.rating), Number(p.created_at), now,
    ]);
  }

  for (const s of settings) {
    const key = s.key as string;
    if (key === 'ttsVoice') {
      const voice = (() => {
        try {
          return JSON.parse(s.value as string);
        } catch {
          return '';
        }
      })();
      if (voice) await tx.execute('INSERT INTO device_settings (key, value) VALUES (?, ?)', ['ttsVoices', JSON.stringify({ en: voice })]);
    } else if (DEVICE_KEYS.has(key)) {
      await tx.execute('INSERT INTO device_settings (key, value) VALUES (?, ?)', [key, s.value as string]);
    } else {
      await tx.execute('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, s.value as string, now]);
    }
  }

  for (const t of V1_TABLES) await tx.execute(`DROP TABLE ${t}_v1`);
}

export const MIGRATION_V2: Migration = {
  version: 2,
  name: 'univers et synchronisation',
  statements: [
    ...V1_INDEXES.map((i) => `DROP INDEX IF EXISTS ${i}`),
    ...V1_TABLES.map((t) => `ALTER TABLE ${t} RENAME TO ${t}_v1`),
    ...V2_TABLES,
  ],
  run: migrateData,
};
