import { describe, expect, it } from 'vitest';
import { calibrationReport, MIN_EXPOSURES, refineBands, wilsonLower, type Observation } from './calibration';
import type { TestAnswer } from './vocabTest';
import { BAND_EDGES } from './coverage';

// Tranches : …250, …500, …1000, …2000, …3000, …5000, …8000, …12000, …20000, …30000, …50000
const testBands = [1, 1, 1, 0.95, 0.9, 0.8, 0.6, 0.3, 0.1, 0, 0];
const answers: TestAnswer[] = BAND_EDGES.flatMap((edge, band) =>
  Array.from({ length: 8 }, (_, i) => ({ word: `w${band}-${i}`, real: true, band, rank: edge - i, yes: true, ms: 1500 })),
);
const obs = (source: Observation['source'], word: string, rank: number, known: boolean): Observation => ({ source, word, rank, known });

describe('recalage par la lecture', () => {
  it('sans observation : les tranches du test', () => {
    expect(refineBands(testBands, answers, []).bands).toEqual(testBands);
  });

  it('les décisions « Mots du chapitre » comptent comme des réponses de test', () => {
    // Tranche 8 000 → 12 000 : le test dit 30 % ; 24 « Je connais » sur 24 décisions.
    const decisions = Array.from({ length: 24 }, (_, i) => obs('chapter', `d${i}`, 9000 + i, true));
    const r = refineBands(testBands, answers, decisions);
    // (0,3 × 8 + 24) / 32 = 82,5 %, au-dessus de la tranche plus courante (60 %) : le lissage fusionne les deux.
    const pooled = (0.6 * 8 + ((0.3 * 8 + 24) / 32) * 32) / 40;
    expect(r.bands[6]).toBeCloseTo(pooled, 2);
    expect(r.bands[7]).toBeCloseTo(pooled, 2);
    expect(r.decisions).toBe(24);
  });

  it('les clics plafonnent une tranche, les mots non cliqués ne la font pas monter', () => {
    // Tranche 3 000 → 5 000 : le test dit 80 % ; 100 mots rencontrés, 40 sélectionnés comme inconnus.
    const exposed = Array.from({ length: 100 }, (_, i) => obs('exposure', `e${i}`, 4000 + i, true));
    const clicks = Array.from({ length: 40 }, (_, i) => obs('select', `e${i}`, 4000 + i, false));
    const capped = refineBands(testBands, answers, [...exposed, ...clicks]);
    expect(capped.bands[5]).toBeLessThan(0.7);
    expect(capped.bands[5]).toBeCloseTo(1 - wilsonLower(40, 100), 2);
    // Aucun clic : la tranche reste celle du test (elle ne monte pas).
    expect(refineBands(testBands, answers, exposed).bands[5]).toBe(0.8);
    // Trop peu de mots rencontrés : pas de plafond.
    const few = exposed.slice(0, MIN_EXPOSURES - 1);
    expect(refineBands(testBands, answers, [...few, ...clicks]).bands[5]).toBe(0.8);
  });

  it("« Je connais » dans la bulle annule le clic", () => {
    const exposed = Array.from({ length: 50 }, (_, i) => obs('exposure', `e${i}`, 4000 + i, true));
    const clicks = Array.from({ length: 30 }, (_, i) => obs('select', `e${i}`, 4000 + i, i >= 20));
    expect(refineBands(testBands, answers, [...exposed, ...clicks]).clicks).toBe(20);
  });

  it('un test sans réponses brutes (ancienne version) reste utilisable', () => {
    expect(refineBands(testBands, [], []).bands).toEqual(testBands);
  });

  it('rapport de calibration : prédit contre observé, score de Brier', () => {
    const decisions = [obs('chapter', 'a', 9000, true), obs('chapter', 'b', 9001, false), obs('chapter', 'c', 9002, true)];
    const { rows, brier } = calibrationReport(testBands, answers, decisions);
    expect(rows[7]).toMatchObject({ predicted: 0.3, decisions: 3, observedKnown: 2 / 3 });
    expect(brier).toBeCloseTo((0.7 ** 2 + 0.3 ** 2 + 0.7 ** 2) / 3, 5);
  });
});

describe('Wilson', () => {
  it('borne basse prudente', () => {
    expect(wilsonLower(0, 50)).toBe(0);
    expect(wilsonLower(5, 10)).toBeLessThan(0.5);
    expect(wilsonLower(50, 100)).toBeGreaterThan(wilsonLower(5, 10));
  });
});
