import { describe, expect, it } from 'vitest';
import type { Note } from '../domain/types';
import { hasScope, scopeIds, scopeNotes } from './scope';
import { classifyWords } from '../reading/level';

const note = (id: string, category: string, tags: string[], collectionIds: string[] = []) => ({ id, category, tags, collectionIds }) as unknown as Note;
const notes = [note('a', 'Phrasal verb', ['work', 'Travel']), note('b', 'Mot', ['travel'], ['c1']), note('c', 'Phrasal verb', [], ['c1'])];

describe('sous-ensemble révisé (collection, catégorie, tag)', () => {
  it('filtres combinables, tag sans tenir compte de la casse', () => {
    expect(scopeNotes(notes, { category: 'Phrasal verb' }).map((n) => n.id)).toEqual(['a', 'c']);
    expect(scopeNotes(notes, { tag: 'TRAVEL' }).map((n) => n.id)).toEqual(['a', 'b']);
    expect(scopeNotes(notes, { tag: 'travel', collectionId: 'c1' }).map((n) => n.id)).toEqual(['b']);
    expect(scopeNotes(notes, { category: 'Phrasal verb', collectionId: 'c1' }).map((n) => n.id)).toEqual(['c']);
  });
  it('sans filtre : toutes les notes', () => {
    expect(hasScope({})).toBe(false);
    expect(hasScope({ collectionId: null, category: null, tag: null })).toBe(false);
    expect(scopeIds(notes, {})).toBeNull();
    expect([...scopeIds(notes, { tag: 'work' })!]).toEqual(['a']);
  });
});

describe('étalonnage du niveau par langue', () => {
  it('un roman espagnol moderne n’est plus classé C2 d’office', () => {
    // Niebla (Unamuno) : rang 13 768 sans facteur ; facteur espagnol ≈ 2,4.
    expect(classifyWords(13768, 9.7, 10000, 1)).toBe('C2');
    expect(classifyWords(13768, 9.7, 10000, 2.4)).toBe('C1');
    expect(classifyWords(29754, 38.8, 10000, 2.4)).toBe('C2'); // Don Quichotte
  });
});
