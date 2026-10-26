/**
 * Catalogue de Project Gutenberg via l'API Gutendex (https://gutendex.com), sans clé.
 * Format d'une réponse : { count, next, previous, results: [{ id, title, authors, languages, formats, … }] }.
 */

export const GUTENDEX = 'https://gutendex.com/books/';

export interface GutendexPerson {
  name: string;
  birth_year: number | null;
  death_year: number | null;
}

export interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexPerson[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean | null;
  media_type: string;
  formats: Record<string, string>;
  download_count: number;
}

export interface GutendexPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
}

/** Livre du catalogue, tel qu'affiché. */
export interface CatalogBook {
  /** Identifiant stable : « gutenberg:11 ». */
  key: string;
  gutenbergId: number;
  title: string;
  authors: string[];
  language: string;
  coverUrl: string | null;
  textUrl: string;
  subjects: string[];
  downloads: number;
  /** Rayonnage jeunesse. */
  children: boolean;
}

export function bookKey(gutenbergId: number): string {
  return `gutenberg:${gutenbergId}`;
}

/** « Carroll, Lewis » → « Lewis Carroll ». */
export function displayName(name: string): string {
  const m = /^([^,]+),\s*(.+)$/.exec(name.trim());
  if (!m) return name.trim();
  // « Doyle, Arthur Conan, Sir » → « Arthur Conan Doyle »
  const first = m[2].replace(/,?\s*\b(Sir|Lord|Lady|Baron|Count|Graf|Mrs\.?|Mr\.?)\b\.?/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return `${first} ${m[1]}`.replace(/\s+/g, ' ').trim();
}

/** Titre sans sous-titre interminable : « Pride and Prejudice », pas « …; Or, … ». */
export function shortTitle(title: string): string {
  const main = title.split(/\r?\n|\s*[:;]\s+(?=[A-ZÀ-ÖØ-Þ])/)[0].trim();
  return main.length > 3 ? main : title.trim();
}

const CHILDREN = /children|juvenile|picture books|fairy tales|nursery|enfant|jeunesse|kinder|infantil/i;

/** Meilleur fichier texte : UTF-8 de préférence, jamais une archive. */
export function textFormat(formats: Record<string, string>): string | null {
  const entries = Object.entries(formats).filter(([mime, url]) => mime.startsWith('text/plain') && !url.endsWith('.zip'));
  const utf8 = entries.find(([mime]) => /utf-8/i.test(mime));
  return (utf8 ?? entries.find(([mime]) => /us-ascii/i.test(mime)) ?? entries[0])?.[1] ?? null;
}

export function toCatalogBook(b: GutendexBook, language: string): CatalogBook | null {
  const textUrl = textFormat(b.formats);
  if (!textUrl || b.media_type !== 'Text') return null;
  const cover = b.formats['image/jpeg'] ?? null;
  return {
    key: bookKey(b.id),
    gutenbergId: b.id,
    title: shortTitle(b.title),
    authors: b.authors.map((a) => displayName(a.name)),
    language: b.languages.includes(language) ? language : (b.languages[0] ?? language),
    // Couverture en taille moyenne (la plus nette à cette taille d'affichage).
    coverUrl: cover ? cover.replace(/\.cover\.small\.jpg$/, '.cover.medium.jpg') : null,
    textUrl,
    subjects: b.subjects,
    downloads: b.download_count,
    children: [...b.bookshelves, ...b.subjects].some((s) => CHILDREN.test(s)),
  };
}

/** Adresse de recherche : livres dans la langue, avec un fichier texte, par popularité. */
export function catalogUrl(language: string, search = ''): string {
  const params = new URLSearchParams({ languages: language, mime_type: 'text/plain', copyright: 'false' });
  if (search.trim()) params.set('search', search.trim());
  return `${GUTENDEX}?${params}`;
}

export function parseCatalogPage(page: GutendexPage, language: string): { books: CatalogBook[]; next: string | null; count: number } {
  const books = page.results.map((b) => toCatalogBook(b, language)).filter((b): b is CatalogBook => b !== null);
  return { books, next: page.next, count: page.count };
}
