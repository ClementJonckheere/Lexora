import { describe, expect, it } from 'vitest';
import { countedReadingMinutes, READING_IDLE_MS, ReadingClock } from './readingTime';

const MIN = 60_000;

describe('temps de lecture', () => {
  it('compte les écarts courts entre deux gestes, perd une absence entière', () => {
    const c = new ReadingClock();
    c.activity(0);
    c.pageTurn(2 * MIN);
    c.pageTurn(4 * MIN);
    c.activity(4 * MIN + READING_IDLE_MS + 1); // parti plus de 5 minutes : rien
    c.pageTurn(4 * MIN + READING_IDLE_MS + 1 + 3 * MIN);
    expect(c.activeMs).toBe(7 * MIN);
    expect(c.pages).toBe(3);
  });

  it('fenêtre masquée : l’écart jusqu’au retour ne compte pas', () => {
    const c = new ReadingClock();
    c.activity(0);
    c.pause();
    c.activity(MIN);
    c.pageTurn(2 * MIN);
    expect(c.activeMs).toBe(MIN);
  });

  it('au plus 5 minutes par page tournée : un livre ouvert sans avancer ne compte pas', () => {
    expect(countedReadingMinutes(30 * MIN, 0)).toBe(0);
    expect(countedReadingMinutes(30 * MIN, 2)).toBe(10);
    expect(countedReadingMinutes(6 * MIN, 10)).toBe(6);
  });
});
