import type { Database, Queryable } from '../db/types';
import type { ParsedBook } from '../reading/gutenberg';
import type { CatalogBook } from '../reading/gutendex';
import { isLevel, type Level, type LevelEstimate } from '../reading/level';

/** Livre ajouté par l'utilisateur, avec sa position de lecture (synchronisée). */
export interface Book {
  key: string;
  universeId: string;
  title: string;
  authors: string[];
  language: string;
  coverUrl: string;
  textUrl: string;
  level: Level | null;
  chapter: number;
  block: number;
  progress: number;
  addedAt: number;
  lastReadAt: number | null;
  updatedAt: number;
}

interface BookRow {
  book_key: string;
  universe_id: string;
  title: string;
  authors: string;
  language: string;
  cover_url: string;
  text_url: string;
  level: string;
  chapter: number;
  block: number;
  progress: number;
  added_at: number;
  last_read_at: number | null;
  updated_at: number;
}

function parseList(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function mapBook(r: BookRow): Book {
  return {
    key: r.book_key,
    universeId: r.universe_id,
    title: r.title,
    authors: parseList(r.authors),
    language: r.language,
    coverUrl: r.cover_url,
    textUrl: r.text_url,
    level: isLevel(r.level) ? r.level : null,
    chapter: Number(r.chapter),
    block: Number(r.block),
    progress: Number(r.progress),
    addedAt: Number(r.added_at),
    lastReadAt: r.last_read_at == null ? null : Number(r.last_read_at),
    updatedAt: Number(r.updated_at),
  };
}

/** Livres de tous les univers, les plus récemment lus d'abord. */
export async function loadBooks(db: Queryable): Promise<Book[]> {
  const rows = await db.select<BookRow>('SELECT * FROM books WHERE deleted = 0 ORDER BY coalesce(last_read_at, added_at) DESC');
  return rows.map(mapBook);
}

/**
 * Ajoute un livre du catalogue (ou le réactive s'il avait été retiré), avec son texte mis en forme.
 * La position de lecture d'un livre déjà présent est conservée.
 */
export async function saveBook(
  db: Database,
  book: CatalogBook,
  universeId: string,
  level: Level | null,
  content: ParsedBook,
  cover: string,
  now = Date.now(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO books (book_key, universe_id, title, authors, language, cover_url, text_url, level, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_key) DO UPDATE SET universe_id = excluded.universe_id, title = excluded.title, authors = excluded.authors,
         cover_url = excluded.cover_url, text_url = excluded.text_url, level = excluded.level,
         added_at = CASE WHEN books.deleted = 1 THEN excluded.added_at ELSE books.added_at END,
         deleted = 0, updated_at = excluded.updated_at, dirty = 1`,
      [book.key, universeId, book.title, JSON.stringify(book.authors), book.language, book.coverUrl ?? '', book.textUrl, level ?? '', now, now],
    );
    await saveBookText(tx, book.key, content, cover, now);
  });
}

/** Texte téléchargé sur cet appareil (null : à télécharger, par ex. livre ajouté sur un autre appareil). */
export async function loadBookText(db: Queryable, key: string): Promise<ParsedBook | null> {
  const rows = await db.select<{ content: string }>('SELECT content FROM book_texts WHERE book_key = ?', [key]);
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].content) as ParsedBook;
  } catch {
    return null;
  }
}

export async function saveBookText(db: Queryable, key: string, content: ParsedBook, cover: string, now = Date.now()): Promise<void> {
  await db.execute(
    `INSERT INTO book_texts (book_key, content, cover, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_key) DO UPDATE SET content = excluded.content, cover = excluded.cover, fetched_at = excluded.fetched_at`,
    [key, JSON.stringify(content), cover, now],
  );
}

/** Couvertures enregistrées localement (affichage hors ligne). */
export async function loadCovers(db: Queryable): Promise<Map<string, string>> {
  const rows = await db.select<{ book_key: string; cover: string }>("SELECT book_key, cover FROM book_texts WHERE cover != ''");
  return new Map(rows.map((r) => [r.book_key, r.cover]));
}

export async function saveProgress(db: Queryable, key: string, chapter: number, block: number, progress: number, now = Date.now()): Promise<void> {
  await db.execute('UPDATE books SET chapter = ?, block = ?, progress = ?, last_read_at = ?, updated_at = ?, dirty = 1 WHERE book_key = ?', [
    chapter,
    block,
    Math.max(0, Math.min(1, progress)),
    now,
    now,
    key,
  ]);
}

/** Retire un livre de la liste (le texte local est effacé, la suppression se propage). */
export async function removeBook(db: Database, key: string, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute('UPDATE books SET deleted = 1, updated_at = ?, dirty = 1 WHERE book_key = ?', [now, key]);
    await tx.execute('DELETE FROM book_texts WHERE book_key = ?', [key]);
  });
}

export interface CachedLevel {
  level: Level;
  vocabRank: number;
  sentenceLength: number;
}

export async function loadLevels(db: Queryable): Promise<Map<string, CachedLevel>> {
  const rows = await db.select<{ book_key: string; level: string; vocab_rank: number; sentence_length: number }>('SELECT * FROM book_levels');
  const out = new Map<string, CachedLevel>();
  for (const r of rows) {
    if (isLevel(r.level)) out.set(r.book_key, { level: r.level, vocabRank: Number(r.vocab_rank), sentenceLength: Number(r.sentence_length) });
  }
  return out;
}

export async function saveLevel(db: Queryable, key: string, estimate: LevelEstimate, now = Date.now()): Promise<void> {
  await db.execute(
    `INSERT INTO book_levels (book_key, level, vocab_rank, sentence_length, computed_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(book_key) DO UPDATE SET level = excluded.level, vocab_rank = excluded.vocab_rank,
       sentence_length = excluded.sentence_length, computed_at = excluded.computed_at`,
    [key, estimate.level, estimate.vocabRank, estimate.sentenceLength, now],
  );
}
