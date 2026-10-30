import { describe, expect, it } from 'vitest';
import { FocusMeter, type XpEvent } from './xp';

const MIN = 60_000;
const T = new Date(2026, 9, 29, 9, 0).getTime();
const review = (at: number, cardId = `c${at}`): XpEvent => ({ kind: 'review', at, cardId, rating: 3, elapsedDays: 0, typed: false });

describe('compteur de concentration', () => {
  it('suit les paliers, la pause de plus de 2 minutes et la même fiche répétée', () => {
    const m = new FocusMeter();
    for (let i = 0; i <= 12; i++) m.add(review(T + i * MIN));
    expect(m.state(T + 12 * MIN)).toEqual({ minutes: 12, multiplier: 1.25, gained: Math.round(10 * 2 + 3 * 2.5) });
    expect(m.state(T + 15 * MIN)).toMatchObject({ minutes: 0, multiplier: 1 });
    const before = m.gained;
    m.add(review(T + 20 * MIN, 'x'));
    m.add(review(T + 21 * MIN, 'x'));
    expect(m.gained - before).toBe(2 + 1);
  });
});
