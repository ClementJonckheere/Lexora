import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { Note } from '../domain/types';
import { buildClozePractice, buildDifficultPractice, buildRandomPractice, clozeCandidates } from './practice';

function n(id: number, expression: string, examples: string[] = []): Note {
  return {
    id: String(id),
    universeId: 'u',
    pronunciation: '',
    expression,
    translation: 't',
    expressionKey: expression,
    comment: '',
    category: '',
    categoryAuto: true,
    isFavorite: false,
    createdAt: 0,
    updatedAt: 0,
    examples,
    tags: [],
    collectionIds: [],
    cards: {},
  };
}

const notes = [
  n(1, 'To tackle an issue', ['We need to tackle this issue before it gets worse.']),
  n(2, 'To figure out', ['Unrelated sentence.']),
  n(3, 'To take for granted', ['Never take your health for granted.', 'He took it for granted.']),
  n(4, 'Serendipity'),
];

describe('entraînement libre', () => {
  it('phrases à trous : uniquement les exemples de l’utilisateur contenant l’expression', () => {
    expect(clozeCandidates(notes).map((c) => Number(c[0].noteId))).toEqual([1, 3]);
    const items = buildClozePractice(notes, null);
    expect(items.map((i) => Number(i.noteId)).sort()).toEqual([1, 3]);
    for (const it of items) expect(notes.find((x) => x.id === it.noteId)!.examples).toContain(it.sentence);
  });

  it('aléatoire : toute la bibliothèque, limite respectée', () => {
    expect(buildRandomPractice(notes, DEFAULT_SETTINGS, 2)).toHaveLength(2);
    expect(new Set(buildRandomPractice(notes, DEFAULT_SETTINGS, null).map((i) => i.noteId)).size).toBe(4);
    expect(buildRandomPractice(notes, DEFAULT_SETTINGS, null, 'en_fr').every((i) => i.direction === 'en_fr')).toBe(true);
  });

  it('difficiles : au moins 2 oublis, les plus oubliés en priorité', () => {
    const counts = new Map([
      ['1', 5],
      ['2', 1],
      ['3', 2],
    ]);
    expect(buildDifficultPractice(notes, counts, null).map((i) => Number(i.noteId)).sort()).toEqual([1, 3]);
    expect(buildDifficultPractice(notes, counts, 1).map((i) => Number(i.noteId))).toEqual([1]);
  });
});
