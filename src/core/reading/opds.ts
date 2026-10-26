import { bookKey, displayName, shortTitle, type CatalogBook } from './gutendex';

/**
 * Catalogue de secours : le flux OPDS (Atom) de recherche de gutenberg.org,
 * utilisé quand Gutendex ne répond pas. Seuls le numéro, le titre et l'auteur sont lus :
 * les adresses du texte et de la couverture suivent le schéma fixe de Project Gutenberg.
 */

export const GUTENBERG = 'https://www.gutenberg.org';

/** Recherche par langue (« l.en ») et mots-clés, par nombre de téléchargements. */
export function opdsUrl(language: string, search = ''): string {
  const query = [`l.${language}`, search.trim()].filter(Boolean).join(' ');
  return `${GUTENBERG}/ebooks/search.opds/?${new URLSearchParams({ query, sort_order: 'downloads' })}`;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decode(m[1]) : null;
}

function attrs(el: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of el.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = decode(m[2]);
  return out;
}

function absolute(href: string): string {
  return href.startsWith('http') ? href : `${GUTENBERG}${href.startsWith('/') ? '' : '/'}${href}`;
}

export function parseOpds(xml: string, language: string): { books: CatalogBook[]; next: string | null } {
  const books: CatalogBook[] = [];
  const seen = new Set<number>();
  for (const [, entry] of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const idText = tag(entry, 'id') ?? '';
    const links = [...entry.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
    const idMatch = /\/ebooks\/(\d+)/.exec(idText) ?? links.map((l) => /\/ebooks\/(\d+)/.exec(l.href ?? '')).find(Boolean);
    if (!idMatch) continue; // entrées de navigation (« trier par… »)
    const id = Number(idMatch[1]);
    if (seen.has(id)) continue;
    seen.add(id);
    const title = tag(entry, 'title');
    if (!title) continue;
    const authorName = tag(entry, 'name') ?? tag(entry, 'content') ?? '';
    const content = tag(entry, 'content') ?? '';
    const downloads = Number(/(\d[\d,.]*)\s+downloads?/i.exec(content)?.[1].replace(/[,.]/g, '') ?? 0);
    books.push({
      key: bookKey(id),
      gutenbergId: id,
      title: shortTitle(title),
      authors: authorName && !/downloads?/i.test(authorName) ? authorName.split(/\s*;\s*/).map(displayName) : [],
      language,
      coverUrl: `${GUTENBERG}/cache/epub/${id}/pg${id}.cover.medium.jpg`,
      textUrl: `${GUTENBERG}/ebooks/${id}.txt.utf-8`,
      subjects: [],
      downloads,
      children: false,
    });
  }
  const nextLink = [...xml.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0])).find((l) => l.rel === 'next' && l.href);
  return { books, next: nextLink ? absolute(nextLink.href) : null };
}
