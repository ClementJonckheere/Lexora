import { buildCloze, clozeKeywords, inflections } from '../domain/cloze';
import { languageInfo } from '../domain/languages';
import { normalizeSearch } from '../domain/text';
import type { Note } from '../domain/types';

/**
 * Repère, dans le texte d'un livre, les expressions déjà enregistrées (formes fléchies comprises :
 * « tackled » pour « tackle », « took it for granted » pour « take for granted »).
 */

export interface KnownRange {
  start: number;
  end: number;
  noteId: string;
}

export interface KnownIndex {
  language: string;
  noSpaces: boolean;
  /** Notes candidates par début de mot (3 premières lettres), pour ne tester que les plausibles. */
  byPrefix: Map<string, Note[]>;
  /** Écritures sans espaces : toutes les notes (recherche de sous-chaîne). */
  all: Note[];
  /** Nombre de mots-clés de chaque note (une correspondance doit les trouver tous). */
  keywordCount: Map<string, number>;
}

const PREFIX = 3;
const prefixOf = (w: string) => normalizeSearch(w).slice(0, PREFIX);

export function buildKnownIndex(notes: Note[], language: string): KnownIndex {
  const noSpaces = !!languageInfo(language).noSpaces;
  const byPrefix = new Map<string, Note[]>();
  const keywordCount = new Map<string, number>();
  const all: Note[] = [];
  for (const n of notes) {
    if (!n.expression.trim()) continue;
    if (noSpaces) {
      all.push(n);
      continue;
    }
    const keywords = clozeKeywords(n.expression, language);
    if (!keywords.length) continue;
    keywordCount.set(n.id, keywords.length);
    // Formes irrégulières (anglais) : « went » doit retrouver « go ».
    const forms = language === 'en' ? [keywords[0], ...inflections(keywords[0])] : [keywords[0]];
    for (const p of new Set(forms.map(prefixOf))) {
      const list = byPrefix.get(p) ?? [];
      list.push(n);
      byPrefix.set(p, list);
    }
  }
  return { language, noSpaces, byPrefix, all, keywordCount };
}

/** Plages (non chevauchantes) des expressions connues dans le texte d'un paragraphe. */
export function findKnown(text: string, index: KnownIndex, maxPerNote = 5): KnownRange[] {
  const ranges: KnownRange[] = [];
  const overlaps = (a: number, b: number) => ranges.some((r) => a < r.end && b > r.start);
  const add = (start: number, end: number, noteId: string) => {
    if (end > start && !overlaps(start, end)) ranges.push({ start, end, noteId });
  };

  if (index.noSpaces) {
    // Expressions les plus longues d'abord : « 学生 » ne masque pas « 大学生 ».
    for (const n of [...index.all].sort((a, b) => b.expression.length - a.expression.length)) {
      const expr = n.expression.trim();
      let from = 0;
      for (let k = 0; k < maxPerNote; k++) {
        const i = text.indexOf(expr, from);
        if (i < 0) break;
        add(i, i + expr.length, n.id);
        from = i + expr.length;
      }
    }
    return ranges.sort((a, b) => a.start - b.start);
  }

  const candidates = new Set<Note>();
  for (const m of text.matchAll(/[\p{L}\p{M}]+/gu)) for (const n of index.byPrefix.get(prefixOf(m[0])) ?? []) candidates.add(n);
  // Expressions de plusieurs mots d'abord : « take for granted » plutôt que « take ».
  const sorted = [...candidates].sort((a, b) => (index.keywordCount.get(b.id) ?? 0) - (index.keywordCount.get(a.id) ?? 0));
  for (const n of sorted) {
    const needed = index.keywordCount.get(n.id) ?? 1;
    let offset = 0;
    for (let k = 0; k < maxPerNote && offset < text.length; k++) {
      const rest = text.slice(offset);
      const cloze = buildCloze(n.expression, rest, index.language);
      // Tous les mots-clés doivent être présents (pas seulement le mot principal).
      if (!cloze || cloze.keywords.length < needed) break;
      let pos = offset;
      let first = -1;
      let last = -1;
      for (const part of cloze.parts) {
        if (part.blank) {
          if (first < 0) first = pos;
          last = pos + part.text.length;
        }
        pos += part.text.length;
      }
      if (first < 0) break;
      add(first, last, n.id);
      offset = last;
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** Découpe un texte en segments, connus ou non, pour l'affichage. */
export function segments(text: string, ranges: KnownRange[]): { text: string; noteId?: string }[] {
  const out: { text: string; noteId?: string }[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) out.push({ text: text.slice(cursor, r.start) });
    out.push({ text: text.slice(r.start, r.end), noteId: r.noteId });
    cursor = r.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}
