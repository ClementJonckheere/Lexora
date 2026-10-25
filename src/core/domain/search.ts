import { normalizeSearch } from './text';
import type { Mastery, Note } from './types';
import { DAY, startOfLocalDay } from './dates';

export interface NoteFilters {
  query: string;
  category: string;
  tag: string;
  collectionId: string | null;
  mastery: Mastery | 'not_mastered' | 'all';
  date: 'all' | 'today' | '7d' | '30d' | '90d';
  favoritesOnly: boolean;
  sort: 'recent' | 'oldest' | 'az' | 'za' | 'mastery';
}

/** Index de recherche par note (calculé une fois par chargement de la bibliothèque). */
export interface SearchIndex {
  en: string;
  fr: string;
  rest: string;
}

export function buildIndex(notes: Note[]): Map<string, SearchIndex> {
  return new Map(
    notes.map((n) => [
      n.id,
      {
        en: normalizeSearch(n.expression),
        fr: normalizeSearch(n.translation),
        rest: normalizeSearch([n.pronunciation, ...n.examples, n.comment, ...n.tags, n.category].join(' ')),
      },
    ]),
  );
}

/**
 * Score de pertinence (0 = pas de correspondance). Tous les mots de la requête doivent être trouvés.
 * Priorité : début de l'expression anglaise > anglais > français > exemples, notes, tags.
 */
export function scoreMatch(idx: SearchIndex, query: string): number {
  const q = normalizeSearch(query);
  if (!q) return 1;
  const terms = q.split(' ');
  const all = `${idx.en} ${idx.fr} ${idx.rest}`;
  if (!terms.every((t) => all.includes(t))) return 0;
  const enCore = idx.en.replace(/^to /, '');
  if (idx.en === q || enCore === q) return 100;
  if (idx.en.startsWith(q) || enCore.startsWith(q)) return 80;
  if (idx.fr === q) return 75;
  if (idx.en.includes(q)) return 60;
  if (idx.fr.startsWith(q)) return 55;
  if (idx.fr.includes(q)) return 45;
  if (terms.every((t) => idx.en.includes(t) || idx.fr.includes(t))) return 30;
  return 10;
}

const MASTERY_ORDER: Record<Mastery, number> = { new: 0, learning: 1, mastered: 2 };

export function filterNotes(
  notes: Note[],
  index: Map<string, SearchIndex>,
  f: NoteFilters,
  masteryOf: (n: Note) => Mastery,
  now = Date.now(),
): Note[] {
  const since =
    f.date === 'all'
      ? 0
      : f.date === 'today'
        ? startOfLocalDay(now)
        : now - { '7d': 7, '30d': 30, '90d': 90 }[f.date] * DAY;
  const tag = f.tag.toLowerCase();
  const scores = new Map<string, number>();

  const out = notes.filter((n) => {
    if (f.favoritesOnly && !n.isFavorite) return false;
    if (f.category && n.category !== f.category) return false;
    if (tag && !n.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (f.collectionId != null && !n.collectionIds.includes(f.collectionId)) return false;
    if (n.createdAt < since) return false;
    if (f.mastery !== 'all') {
      const m = masteryOf(n);
      if (f.mastery === 'not_mastered' ? m === 'mastered' : m !== f.mastery) return false;
    }
    if (f.query.trim()) {
      const idx = index.get(n.id);
      const s = idx ? scoreMatch(idx, f.query) : 0;
      if (!s) return false;
      scores.set(n.id, s);
    }
    return true;
  });

  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const alpha = (a: Note, b: Note) => collator.compare(a.expression.replace(/^to\s+/i, ''), b.expression.replace(/^to\s+/i, ''));
  const sorters: Record<NoteFilters['sort'], (a: Note, b: Note) => number> = {
    recent: (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
    oldest: (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    az: alpha,
    za: (a, b) => alpha(b, a),
    mastery: (a, b) => MASTERY_ORDER[masteryOf(a)] - MASTERY_ORDER[masteryOf(b)] || alpha(a, b),
  };
  const sorter = sorters[f.sort];
  // Avec une recherche active : la pertinence prime, puis le tri choisi.
  return out.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || sorter(a, b));
}
