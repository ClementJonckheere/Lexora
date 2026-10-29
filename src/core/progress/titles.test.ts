import { describe, expect, it } from 'vitest';
import { lessonReview } from '../learn/review';
import { computeTitles, displayedTitle, sessionsOf, type TitleData } from './titles';
import type { XpEvent } from './xp';

const DAY = 86_400_000;
const MIN = 60_000;
const NOW = new Date(2026, 9, 29, 12, 0).getTime();

const base = (over: Partial<TitleData> = {}): TitleData => ({
  now: NOW,
  events: [],
  reviews: [],
  books: [],
  chapterDecisions: [],
  lessons: [],
  grammarCorrect: 0,
  entries: [],
  levels: [1],
  ...over,
});
const get = (d: TitleData, id: string) => computeTitles(d).find((t) => t.id === id)!;
const review = (at: number, typed = true): XpEvent => ({ kind: 'review', at, cardId: `c${at}`, rating: 3, elapsedDays: 0, typed });

describe('titres', () => {
  it('lecture : livre fini à 98 %, niveaux distincts des livres finis', () => {
    const books = [
      { progress: 1, level: 'A2' },
      { progress: 0.99, level: 'B1' },
      { progress: 0.98, level: 'B1' },
      { progress: 0.5, level: 'C1' },
    ];
    expect(get(base({ books }), 'tourne-page').earned).toBe(true);
    expect(get(base({ books }), 'collectionneur')).toMatchObject({ earned: false, progress: '2 / 4' });
    expect(get(base({ books }), 'grand-lecteur').progress).toBe('3 / 10');
  });

  it('chapitres : décisions groupées par moments de lecture (au moins 3 par chapitre)', () => {
    const at = (chapter: number, i: number) => NOW - DAY + chapter * 30 * MIN + i * 10_000;
    const decisions = [...[0, 1, 2].flatMap((c) => [0, 1, 2, 3].map((i) => at(c, i))), at(3, 0)];
    expect(get(base({ chapterDecisions: decisions }), 'pilleur').progress).toBe('3 / 20');
  });

  it('séances : coupées par une pause de plus de 2 minutes ; « au clavier » à 95 % de réponses tapées', () => {
    const one = Array.from({ length: 20 }, (_, i) => review(NOW + i * MIN));
    const two = Array.from({ length: 20 }, (_, i) => review(NOW + 60 * MIN + i * MIN, i !== 0 && i !== 1));
    expect(sessionsOf([...one, ...two])).toHaveLength(2);
    expect(get(base({ events: [...one, ...two] }), 'dactylographe').progress).toBe('1 / 30');
  });

  it('archiviste : médiane du jour sous 5 s, 7 jours de suite', () => {
    const entries = Array.from({ length: 7 }, (_, d) => [
      { at: NOW - d * DAY, durationMs: 3000 },
      { at: NOW - d * DAY + 1000, durationMs: d === 3 ? 9000 : 4000 },
      { at: NOW - d * DAY + 2000, durationMs: d === 3 ? 9000 : 4000 },
    ]).flat();
    expect(get(base({ entries }), 'archiviste').progress).toBe('3 / 7 jours');
    const fast = entries.map((e) => ({ ...e, durationMs: 2000 }));
    expect(get(base({ entries: fast }), 'archiviste').earned).toBe(true);
  });

  it('mémorisation : fiche oubliée puis retrouvée un autre jour ; mots retrouvés après 3 mois', () => {
    const reviews = [
      { cardId: 'a', noteId: 'n1', rating: 1, elapsedDays: 3, at: NOW - 3 * DAY, due: NOW - 3 * DAY },
      { cardId: 'a', noteId: 'n1', rating: 3, elapsedDays: 0, at: NOW - 3 * DAY + MIN, due: NOW - 3 * DAY + MIN }, // même jour
      { cardId: 'b', noteId: 'n2', rating: 1, elapsedDays: 3, at: NOW - 3 * DAY, due: NOW - 3 * DAY },
      { cardId: 'b', noteId: 'n2', rating: 3, elapsedDays: 1, at: NOW - 2 * DAY, due: NOW - 2 * DAY },
      { cardId: 'c', noteId: 'n3', rating: 3, elapsedDays: 120, at: NOW, due: NOW },
    ];
    expect(get(base({ reviews }), 'resilient').progress).toBe('1 / 50');
    expect(get(base({ reviews }), 'memoire-longue').progress).toBe('1 / 500');
  });

  it('stratège : la période repart à chaque fiche en retard de plus de 2 jours, et quand on cesse de réviser', () => {
    const daily = Array.from({ length: 100 }, (_, i) => ({ cardId: `c${i}`, noteId: 'n', rating: 3, elapsedDays: 1, at: NOW - (99 - i) * DAY, due: NOW - (99 - i) * DAY }));
    expect(get(base({ reviews: daily }), 'stratege').earned).toBe(true);
    const late = daily.map((r, i) => (i === 50 ? { ...r, due: r.at - 3 * DAY } : r));
    expect(get(base({ reviews: late }), 'stratege').progress).toBe('50 / 90 jours');
    const gap = daily.filter((_, i) => i < 40 || i > 45);
    expect(get(base({ reviews: gap }), 'stratege').earned).toBe(false);
  });

  it('concentration : 30 jours sur 40, séances de 45 min, deux langues au rang Argent', () => {
    const days = Array.from({ length: 30 }, (_, i) => review(NOW - i * DAY));
    expect(get(base({ events: days }), 'constant').earned).toBe(true);
    const spread = Array.from({ length: 30 }, (_, i) => review(NOW - i * 2 * DAY));
    expect(get(base({ events: spread }), 'constant').earned).toBe(false);
    const long = Array.from({ length: 47 }, (_, i) => review(NOW + i * MIN));
    expect(get(base({ events: long }), 'plongeur').progress).toBe('1 / 10');
    expect(get(base({ levels: [12, 3, 10] }), 'polyglotte').earned).toBe(true);
  });

  it('grammaire : leçons acquises et révisions réussies trois fois de suite', () => {
    const answers = Array.from({ length: 20 }, (_, i) => ({ lessonId: 'x', itemId: `x:${i}`, correct: true, reported: false, createdAt: NOW - 100 * DAY + i * MIN }));
    const lesson = lessonReview(answers, NOW);
    expect(get(base({ lessons: [lesson], grammarCorrect: 20 }), 'architecte').progress).toBe('1 / 10 leçons · 20 / 500');
    const held = { ...lesson, reviews: [{ at: 1, passed: true }, { at: 2, passed: false }, { at: 3, passed: true }, { at: 4, passed: true }, { at: 5, passed: true }] };
    expect(get(base({ lessons: Array(10).fill(held) }), 'gardien').earned).toBe(true);
  });

  it('titre affiché : celui choisi s’il est gagné, sinon le premier gagné ; « aucun » possible', () => {
    const titles = computeTitles(base({ books: [{ progress: 1, level: 'B1' }], levels: [10, 10] }));
    expect(displayedTitle(titles, undefined)?.id).toBe('tourne-page');
    expect(displayedTitle(titles, 'polyglotte')?.id).toBe('polyglotte');
    expect(displayedTitle(titles, 'plongeur')?.id).toBe('tourne-page');
    expect(displayedTitle(titles, 'none')).toBeNull();
  });
});
