import { describe, expect, it } from 'vitest';
import { computeStreak, shiftDay } from './streak';

const today = '2026-11-01';
/** Les `n` jours finissant `end` jours avant aujourd'hui (0 : aujourd'hui compris). */
const run = (n: number, end = 0) => Array.from({ length: n }, (_, i) => shiftDay(today, -end - i));
const streak = (active: string[], shielded: string[] = []) => computeStreak(new Set(active), new Set(shielded), today);

describe('série et boucliers', () => {
  it('jours consécutifs, aujourd’hui compris ; à risque tant que rien aujourd’hui', () => {
    expect(streak(run(3))).toMatchObject({ streak: 3, doneToday: true, atRisk: false });
    expect(streak(run(3, 1))).toMatchObject({ streak: 3, doneToday: false, atRisk: true, missed: [] });
  });

  it('un bouclier tous les 6 jours travaillés d’affilée, gardé même si la série casse', () => {
    expect(streak(run(5))).toMatchObject({ shields: 0, nextShieldIn: 1 });
    expect(streak(run(6))).toMatchObject({ shields: 1, nextShieldIn: 6 });
    expect(streak(run(13))).toMatchObject({ shields: 2, nextShieldIn: 5 });
    // 6 jours il y a longtemps, puis une pause : le bouclier reste.
    expect(streak([...run(6, 20), ...run(2)])).toMatchObject({ streak: 2, shields: 1 });
  });

  it('jour manqué hier : la série perdue est proposée au rattrapage', () => {
    const s = streak(run(7, 2));
    expect(s).toMatchObject({ streak: 0, shields: 1, lost: 7, missed: [shiftDay(today, -1)] });
    // Révision faite aujourd'hui : la série repart à 1, mais le trou peut encore être couvert.
    expect(streak([...run(7, 2), today])).toMatchObject({ streak: 1, lost: 7, missed: [shiftDay(today, -1)] });
  });

  it('le jour couvert par un bouclier prolonge la série sans compter', () => {
    const s = streak([...run(7, 2), today], [shiftDay(today, -1)]);
    expect(s).toMatchObject({ streak: 8, used: 1, shields: 0, missed: [], lost: 0 });
  });

  it('rien à sauver sans série avant le trou', () => {
    expect(streak([])).toMatchObject({ streak: 0, missed: [], lost: 0, shields: 0 });
    expect(streak(run(1, 3))).toMatchObject({ missed: [shiftDay(today, -2), shiftDay(today, -1)], lost: 1 });
  });

  it('passage d’un mois à l’autre', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});
