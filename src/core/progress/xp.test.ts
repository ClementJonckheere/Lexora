import { describe, expect, it } from 'vitest';
import { computeXp, levelFor, rankFor, seniority, xpToNext, type XpEvent } from './xp';

const T0 = new Date(2026, 9, 29, 9, 0, 0).getTime();
const MIN = 60_000;
const review = (at: number, cardId: string, opts: Partial<Extract<XpEvent, { kind: 'review' }>> = {}): XpEvent => ({
  kind: 'review',
  at,
  cardId,
  rating: 3,
  elapsedDays: 0,
  typed: false,
  ...opts,
});

describe('XP', () => {
  it('révision : tapée 4, boutons 2, oubli 1 ; l’ancienneté multiplie jusqu’à ×2', () => {
    expect(computeXp([review(T0, 'a', { typed: true })], T0).total).toBe(4);
    expect(computeXp([review(T0, 'a')], T0).total).toBe(2);
    expect(computeXp([review(T0, 'a', { rating: 1, typed: true })], T0).total).toBe(1);
    expect(seniority(0)).toBe(1);
    expect(seniority(180)).toBeCloseTo(2);
    expect(seniority(5000)).toBe(2);
    expect(computeXp([review(T0, 'a', { typed: true, elapsedDays: 180 })], T0).total).toBe(8);
  });

  it('concentration : ×1,25 après 10 min sans pause, ×1,5 après 25 ; une pause de plus de 2 min remet à zéro', () => {
    const steady = Array.from({ length: 31 }, (_, i) => review(T0 + i * MIN, `c${i}`)); // une révision par minute, 30 min
    const s = computeXp(steady, T0 + 30 * MIN);
    // 10 premières minutes ×1 (10 fiches), 10 → 24 ×1,25 (15), 25 → 30 ×1,5 (6)
    expect(s.total).toBe(Math.floor(10 * 2 + 15 * 2.5 + 6 * 3));
    expect(s.todayFocusMinutes).toBe(30);
    const broken = steady.map((e, i) => ({ ...e, at: e.at + (i >= 15 ? 3 * MIN : 0) })); // pause de 4 min à la 15e
    expect(computeXp(broken, T0 + 40 * MIN).total).toBeLessThan(s.total);
  });

  it('anti-abus : la même fiche le même jour rapporte moitié moins à chaque fois ; le lendemain, plein tarif', () => {
    const same = [review(T0, 'a'), review(T0 + 5 * MIN, 'a'), review(T0 + 10 * MIN, 'a')];
    expect(computeXp(same, T0 + 20 * MIN).total).toBe(Math.floor(2 + 1 + 0.5));
    const nextDay = [review(T0, 'a'), review(T0 + 24 * 60 * MIN, 'a')];
    expect(computeXp(nextDay, T0 + 25 * 60 * MIN).total).toBe(4);
  });

  it('mots ajoutés : 3 avec exemple, 1 sans, 30 par jour au plus', () => {
    const notes: XpEvent[] = Array.from({ length: 15 }, (_, i) => ({ kind: 'note', at: T0 + i * 1000, withExample: true }));
    expect(computeXp(notes, T0).total).toBe(30);
    expect(computeXp([{ kind: 'note', at: T0, withExample: false }], T0).bySource.words).toBe(1);
  });

  it('grammaire et leçons : tapée 5, choix 2, erreur 1 ; leçon acquise 60, révision réussie 25', () => {
    const g: XpEvent[] = [
      { kind: 'grammar', at: T0, itemId: 'x:1', correct: true, typed: true },
      { kind: 'grammar', at: T0 + 1000, itemId: 'x:2', correct: true, typed: false },
      { kind: 'grammar', at: T0 + 2000, itemId: 'x:3', correct: false, typed: true },
      { kind: 'lesson-mastered', at: T0 + 3000, lessonId: 'x' },
      { kind: 'lesson-review', at: T0 + 4000, lessonId: 'x', passed: true },
      { kind: 'lesson-review', at: T0 + 5000, lessonId: 'x', passed: false },
    ];
    const s = computeXp(g, T0);
    expect(s.bySource).toMatchObject({ grammar: 8, lessons: 85 });
  });

  it('niveaux et rangs', () => {
    expect([xpToNext(1), xpToNext(2), xpToNext(10)]).toEqual([120, 317, 3014]);
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 120 });
    expect(levelFor(120 + 317 + 10)).toMatchObject({ level: 3, into: 10 });
    expect([1, 4, 5, 12, 15, 29, 30, 49, 50, 80].map((l) => rankFor(l).name)).toEqual([
      'Fer', 'Fer', 'Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Émeraude', 'Maître', 'Grand Maître',
    ]);
  });

  it('bilan du jour : XP d’aujourd’hui et part gagnée en concentration', () => {
    const yesterday = review(T0 - 24 * 60 * MIN, 'old');
    const today = Array.from({ length: 16 }, (_, i) => review(T0 + i * MIN, `t${i}`));
    const s = computeXp([yesterday, ...today], T0 + 20 * MIN);
    expect(s.today).toBe(Math.round(10 * 2 + 6 * 2.5));
    expect(s.todayFocusShare).toBeCloseTo(15 / 35);
  });
});
