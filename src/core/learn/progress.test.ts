import { describe, expect, it } from 'vitest';
import { lessonProgress, MASTERY_TARGET, pickSession, type GrammarAnswer } from './progress';

const answers = (pattern: boolean[], lessonId = 'passive'): GrammarAnswer[] =>
  pattern.map((correct, i) => ({ lessonId, itemId: `i${i}`, correct, reported: false, createdAt: 1000 + i }));

describe('progression d’une leçon', () => {
  it('acquise à 90 % sur les 20 dernières, pas avant 20 réponses', () => {
    expect(lessonProgress([]).state).toBe('new');
    expect(lessonProgress(answers(Array(10).fill(true))).state).toBe('learning');
    expect(lessonProgress(answers([...Array(18).fill(true), false, false])).state).toBe('mastered');
    expect(lessonProgress(answers([...Array(17).fill(true), false, false, false])).state).toBe('learning');
    expect(MASTERY_TARGET).toBe(18);
  });

  it('seules les 20 dernières comptent : des erreurs anciennes ne bloquent pas', () => {
    const p = lessonProgress(answers([...Array(10).fill(false), ...Array(20).fill(true)]));
    expect(p).toMatchObject({ window: 20, correct: 20, state: 'mastered', total: 30 });
  });

  it('une phrase signalée ne compte pas', () => {
    const list = answers(Array(20).fill(true));
    list[19] = { ...list[19], correct: false, reported: true };
    expect(lessonProgress(list)).toMatchObject({ window: 19, correct: 19, state: 'learning' });
  });
});

describe('séance', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}` }));
  it('10 exercices au hasard, sans les phrases signalées, nouvelles phrases d’abord', () => {
    const past: GrammarAnswer[] = [
      { lessonId: 'x', itemId: 'i0', correct: true, reported: false, createdAt: 1 },
      { lessonId: 'x', itemId: 'i1', correct: false, reported: true, createdAt: 2 },
    ];
    const s = pickSession(items, past, () => 0.5);
    expect(s).toHaveLength(10);
    expect(s.map((x) => x.id)).not.toContain('i1');
    expect(s.map((x) => x.id)).not.toContain('i0');
    expect(new Set(s.map((x) => x.id)).size).toBe(10);
  });
  it('tirages différents : « Nouvelles phrases »', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    expect(pickSession(items, [], rng).map((x) => x.id)).not.toEqual(pickSession(items, [], rng).map((x) => x.id));
  });
});
