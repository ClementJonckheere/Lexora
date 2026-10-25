import type { Database, Queryable } from '../db/types';
import { LATEST_VERSION } from '../db/migrations';
import { parseCsv, toCsv } from '../domain/csv';
import { expressionKey } from '../domain/text';
import type { Collection, Note, NoteInput } from '../domain/types';
import { MASTERY_LABEL } from '../domain/types';
import { validateNote, ValidationError } from '../domain/validation';
import type { Settings } from '../domain/settings';
import { noteMastery } from '../srs/queue';
import { insertNote, type NoteTarget } from './notesRepo';
import { insertCollection } from './collectionsRepo';

/* -------------------------------------------------------------------------- */
/*  Sauvegarde complète (JSON) : tous les univers, historique compris.        */
/* -------------------------------------------------------------------------- */

export const BACKUP_FORMAT = 'lexora-backup';

/** Tables synchronisées, dans l'ordre de dépendance. */
const TABLES = ['universes', 'collections', 'notes', 'cards', 'review_logs', 'practice_logs', 'settings'] as const;

type Row = Record<string, unknown>;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<(typeof TABLES)[number], Row[]>;
}

export async function exportBackup(db: Queryable): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const t of TABLES) {
    const rows = await db.select<Row>(t === 'settings' ? 'SELECT key, value, updated_at FROM settings' : `SELECT * FROM ${t} WHERE deleted = 0`);
    tables[t] = rows.map(({ dirty: _d, deleted: _x, ...r }) => r);
  }
  return { format: BACKUP_FORMAT, schemaVersion: LATEST_VERSION, exportedAt: new Date().toISOString(), tables };
}

export function isBackup(data: unknown): data is Backup {
  return !!data && typeof data === 'object' && (data as Backup).format === BACKUP_FORMAT && typeof (data as Backup).tables === 'object';
}

/**
 * Restauration : l'état de la sauvegarde remplace INTÉGRALEMENT les données actuelles.
 * Les lignes actuelles sont supprimées (suppression douce, propagée aux autres appareils),
 * celles de la sauvegarde sont réécrites comme modifications récentes, à synchroniser.
 */
export async function restoreBackup(db: Database, backup: Backup, now = Date.now()): Promise<void> {
  if (!isBackup(backup)) throw new Error("Ce fichier n'est pas une sauvegarde Lexora.");
  if (backup.schemaVersion < 2) {
    throw new Error('Sauvegarde d’une ancienne version de Lexora : utilisez plutôt « Importer » avec un export CSV.');
  }
  if (backup.schemaVersion > LATEST_VERSION) {
    throw new Error('Sauvegarde créée par une version plus récente de Lexora : mettez l’application à jour.');
  }
  await db.transaction(async (tx) => {
    for (const t of TABLES) {
      if (t === 'settings') await tx.execute('DELETE FROM settings');
      else await tx.execute(`UPDATE ${t} SET deleted = 1, updated_at = ?, dirty = 1 WHERE deleted = 0`, [now]);
    }
    for (const t of TABLES) {
      for (const row of backup.tables[t] ?? []) {
        const data: Row = { ...row, updated_at: now + 1, dirty: 1 };
        if (t !== 'settings') data.deleted = 0;
        const cols = Object.keys(data);
        if (cols.some((c) => !/^[a-z_]+$/.test(c))) throw new Error(`Sauvegarde invalide (table ${t}).`);
        await tx.execute(
          `INSERT OR REPLACE INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => data[c] as string | number | null),
        );
      }
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Import de notes (collage, CSV, JSON simple) — fusion, doublons ignorés.   */
/* -------------------------------------------------------------------------- */

export interface ImportCandidate extends NoteInput {
  /** Noms de collections (créées si besoin). */
  collectionNames?: string[];
  createdAt?: number;
}

export interface ImportReport {
  imported: number;
  duplicates: number;
  invalid: { index: number; reason: string }[];
}

/** Importe dans un univers ; `existing` = notes de cet univers (détection des doublons). */
export async function importNotes(
  db: Database,
  candidates: ImportCandidate[],
  existing: Note[],
  target: NoteTarget,
  now = Date.now(),
): Promise<ImportReport> {
  const keys = new Set(existing.map((n) => n.expressionKey));
  const report: ImportReport = { imported: 0, duplicates: 0, invalid: [] };

  await db.transaction(async (tx) => {
    const collections = new Map<string, string>(
      (
        await tx.select<{ id: string; name: string }>('SELECT id, name FROM collections WHERE universe_id = ? AND deleted = 0', [target.universeId])
      ).map((c) => [c.name.toLowerCase(), c.id]),
    );
    const collectionId = async (name: string) => {
      const k = name.trim().toLowerCase();
      if (!k) return null;
      let id = collections.get(k);
      if (id === undefined) {
        id = await insertCollection(tx, target.universeId, name, '', now);
        collections.set(k, id);
      }
      return id;
    };

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      let v;
      try {
        v = validateNote(c);
      } catch (err) {
        report.invalid.push({ index: i, reason: err instanceof ValidationError ? err.message : String(err) });
        continue;
      }
      const key = expressionKey(v.expression, target.language);
      if (keys.has(key)) {
        report.duplicates++;
        continue;
      }
      keys.add(key);
      for (const name of c.collectionNames ?? []) {
        const id = await collectionId(name);
        if (id !== null) v.collectionIds.push(id);
      }
      const createdAt = c.createdAt && Number.isFinite(c.createdAt) && c.createdAt <= now ? c.createdAt : now;
      await insertNote(tx, v, target, now, createdAt);
      report.imported++;
    }
  });
  return report;
}

/* ------------------------------------ CSV ----------------------------------- */

const CSV_HEADERS = ['expression', 'traduction', 'prononciation', 'exemples', 'note', 'categorie', 'tags', 'collections', 'favori', 'maitrise', 'ajoute_le'];

const HEADER_ALIASES: Record<string, string[]> = {
  expression: ['expression', 'anglais', 'english', 'en', 'word', 'mot', 'front', 'term'],
  translation: ['traduction', 'francais', 'français', 'french', 'fr', 'translation', 'back', 'definition', 'sens'],
  pronunciation: ['prononciation', 'pronunciation', 'pinyin', 'reading', 'lecture', 'transcription', 'romanisation'],
  examples: ['exemples', 'exemple', 'examples', 'example', 'sentence', 'phrase'],
  comment: ['note', 'notes', 'comment', 'commentaire', 'remarque'],
  category: ['categorie', 'catégorie', 'category', 'type'],
  tags: ['tags', 'tag', 'etiquettes', 'étiquettes'],
  collections: ['collections', 'collection', 'listes', 'liste', 'deck'],
  favorite: ['favori', 'favorite', 'favourite', 'star'],
  createdAt: ['ajoute_le', 'ajouté_le', 'date', 'created_at', 'created'],
};

/** Séparateur interne des cellules multi-valeurs. */
const MULTI_SEP = ' | ';

export function exportCsv(notes: Note[], collections: Collection[], settings: Settings): string {
  const collName = new Map(collections.map((c) => [c.id, c.name]));
  const rows: (string | number)[][] = [CSV_HEADERS];
  for (const n of notes) {
    rows.push([
      n.expression,
      n.translation,
      n.pronunciation,
      n.examples.join(MULTI_SEP),
      n.comment,
      n.category,
      n.tags.join(', '),
      n.collectionIds.map((id) => collName.get(id) ?? '').filter(Boolean).join(MULTI_SEP),
      n.isFavorite ? 'oui' : '',
      MASTERY_LABEL[noteMastery(n, settings)],
      new Date(n.createdAt).toISOString().slice(0, 10),
    ]);
  }
  return toCsv(rows);
}

function splitMulti(v: string | undefined, sep: RegExp): string[] {
  return (v ?? '').split(sep).map((s) => s.trim()).filter(Boolean);
}

export function parseCsvNotes(text: string): ImportCandidate[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const index: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) index[field as keyof typeof HEADER_ALIASES] = i;
  }
  const hasHeader = index.expression !== undefined && index.translation !== undefined;
  const body = hasHeader ? rows.slice(1) : rows;
  const col = (r: string[], f: keyof typeof HEADER_ALIASES, fallback?: number) => {
    const i = hasHeader ? index[f] : fallback;
    return i === undefined ? undefined : r[i];
  };
  return body.map((r) => {
    const date = col(r, 'createdAt');
    const parsed = date ? Date.parse(date) : NaN;
    return {
      expression: col(r, 'expression', 0) ?? '',
      translation: col(r, 'translation', 1) ?? '',
      pronunciation: col(r, 'pronunciation') ?? '',
      examples: splitMulti(col(r, 'examples', 2), /\s\|\s|\n/),
      comment: col(r, 'comment') ?? '',
      category: col(r, 'category') ?? '',
      tags: splitMulti(col(r, 'tags'), /[,;]/),
      collectionNames: splitMulti(col(r, 'collections'), /\s\|\s/),
      isFavorite: /^(oui|yes|true|1|x|★)$/i.test((col(r, 'favorite') ?? '').trim()),
      createdAt: Number.isFinite(parsed) ? parsed : undefined,
    };
  });
}

/* ------------------------------ JSON (notes) -------------------------------- */

export interface NotesExport {
  format: 'lexora-notes';
  exportedAt: string;
  notes: {
    expression: string;
    translation: string;
    pronunciation: string;
    examples: string[];
    comment: string;
    category: string;
    tags: string[];
    collections: string[];
    favorite: boolean;
    createdAt: string;
  }[];
}

export function exportNotesJson(notes: Note[], collections: Collection[]): NotesExport {
  const collName = new Map(collections.map((c) => [c.id, c.name]));
  return {
    format: 'lexora-notes',
    exportedAt: new Date().toISOString(),
    notes: notes.map((n) => ({
      expression: n.expression,
      translation: n.translation,
      pronunciation: n.pronunciation,
      examples: n.examples,
      comment: n.comment,
      category: n.category,
      tags: n.tags,
      collections: n.collectionIds.map((id) => collName.get(id)).filter((x): x is string => !!x),
      favorite: n.isFavorite,
      createdAt: new Date(n.createdAt).toISOString(),
    })),
  };
}

/** Accepte l'export Lexora ou un tableau d'objets { expression|english|word, translation|french, example(s)… }. */
export function parseJsonNotes(data: unknown): ImportCandidate[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as NotesExport).notes)
      ? (data as NotesExport).notes
      : [];
  if (!list.length) throw new Error('Aucune note trouvée dans ce fichier JSON.');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(str) : typeof v === 'string' && v ? [v] : []);
  return list.map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const created = Date.parse(str(o.createdAt ?? o.created_at));
    return {
      expression: str(o.expression ?? o.english ?? o.word ?? o.en),
      translation: str(o.translation ?? o.french ?? o.fr ?? o.traduction),
      pronunciation: str(o.pronunciation ?? o.pinyin ?? o.prononciation),
      examples: arr(o.examples ?? o.example ?? o.exemple),
      comment: str(o.comment ?? o.note ?? o.notes),
      category: str(o.category ?? o.categorie),
      tags: arr(o.tags),
      collectionNames: arr(o.collections),
      isFavorite: o.favorite === true || o.isFavorite === true,
      createdAt: Number.isFinite(created) ? created : undefined,
    };
  });
}
