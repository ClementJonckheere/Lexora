import { describe, expect, it } from 'vitest';
import { buildIndex, filterNotes, type NoteFilters } from './search';
import type { Mastery, Note } from './types';

const base: NoteFilters = {
  query: '',
  category: '',
  tag: '',
  collectionId: null,
  mastery: 'all',
  date: 'all',
  favoritesOnly: false,
  sort: 'recent',
};
const NOW = new Date(2026, 9, 23, 12).getTime();
const DAY = 86_400_000;

function n(id: number, expression: string, translation: string, extra: Partial<Note> = {}): Note {
  return {
    id: String(id),
    universeId: 'u',
    pronunciation: '',
    expression,
    translation,
    expressionKey: expression.toLowerCase(),
    comment: '',
    category: '',
    categoryAuto: true,
    isFavorite: false,
    createdAt: NOW - id * DAY,
    updatedAt: NOW,
    examples: [],
    tags: [],
    collectionIds: [],
    cards: {},
    ...extra,
  };
}

const notes = [
  n(1, 'To tackle an issue', "S'attaquer à un problème", { tags: ['work'], examples: ['We need to tackle this issue.'] }),
  n(2, 'To figure out', 'Comprendre / trouver', { isFavorite: true, category: 'Phrasal verb', collectionIds: ['7'] }),
  n(3, 'To take for granted', 'Considérer comme acquis'),
  n(40, 'Issue', 'Problème, question'),
];
const index = buildIndex(notes);
const mastery: Record<number, Mastery> = { 1: 'new', 2: 'learning', 3: 'mastered', 40: 'new' };
const run = (f: Partial<NoteFilters>) => filterNotes(notes, index, { ...base, ...f }, (x) => mastery[Number(x.id)], NOW).map((x) => Number(x.id));

describe('bibliothèque : recherche et filtres', () => {
  it('cherche en anglais et en français, sans accents, par pertinence', () => {
    expect(run({ query: 'issue' })).toEqual([40, 1]);
    expect(run({ query: 'probleme' })).toEqual([40, 1]);
    expect(run({ query: 'figure' })).toEqual([2]);
    expect(run({ query: 'tackle this' })).toEqual([1]); // trouvé dans l'exemple
    expect(run({ query: 'zzz' })).toEqual([]);
  });

  it('combine les filtres', () => {
    expect(run({ favoritesOnly: true })).toEqual([2]);
    expect(run({ category: 'Phrasal verb' })).toEqual([2]);
    expect(run({ tag: 'WORK' })).toEqual([1]);
    expect(run({ collectionId: '7' })).toEqual([2]);
    expect(run({ mastery: 'not_mastered' })).toEqual([1, 2, 40]);
    expect(run({ mastery: 'new', date: '7d' })).toEqual([1]);
  });

  it('trie par ordre alphabétique en ignorant « to »', () => {
    expect(run({ sort: 'az' })).toEqual([2, 40, 1, 3]);
    expect(run({ sort: 'oldest' })).toEqual([40, 3, 2, 1]);
  });
});
