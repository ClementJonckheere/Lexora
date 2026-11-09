import { describe, expect, it } from 'vitest';
import { budgetHistory, DEFAULT_ANSWERS_PER_NEW, observedProfile, planBudget, shareNewCards, spentMinutes, upcomingDue } from './dailyBudget';

const DAY = 86_400_000;
const profile = { medianMs: 12_000, answersPerReview: 1.25, answersPerNew: 3 };
/** Fiches dont la révision prend `minutes` minutes avec ce profil. */
const cardsFor = (minutes: number) => (minutes * 60_000) / (profile.answersPerReview * profile.medianMs);

describe('budget quotidien en minutes', () => {
  it('environ 4 minutes de révisions sur 10 : plusieurs nouveaux mots ; 9 minutes : aucun ou presque ; plus de 10 : aucun', () => {
    const plan = (minutes: number) => planBudget({ budgetMinutes: 10, profile, todayCards: cardsFor(minutes), upcoming: [], bothDirections: false });
    expect(plan(4).allowedNew).toBeGreaterThanOrEqual(5);
    expect(plan(9).allowedNew).toBeLessThanOrEqual(1);
    expect(plan(12).allowedNew).toBe(0);
  });

  it('prudent : la semaine à venir compte autant que la journée', () => {
    const calmToday = planBudget({ budgetMinutes: 10, profile, todayCards: cardsFor(2), upcoming: new Array(7).fill(cardsFor(9)), bothDirections: false });
    expect(calmToday.reviewMinutes).toBeCloseTo(9);
    expect(calmToday.allowedNew).toBeLessThanOrEqual(1);
  });

  it('deux directions : chaque mot coûte deux fiches', () => {
    const one = planBudget({ budgetMinutes: 10, profile, todayCards: cardsFor(4), upcoming: [], bothDirections: false });
    const two = planBudget({ budgetMinutes: 10, profile, todayCards: cardsFor(4), upcoming: [], bothDirections: true });
    expect(two.minutesPerNew).toBeCloseTo(2 * one.minutesPerNew);
    expect(two.allowedNew).toBeLessThan(one.allowedNew);
  });

  it('profil observé : réponses par fiche et par jour, selon l’état à la première réponse ; valeurs par défaut sans recul', () => {
    const logs = [];
    for (let c = 0; c < 40; c++) {
      logs.push({ cardId: `r${c}`, at: c * 1000, state: 2 });
      if (c % 4 === 0) logs.push({ cardId: `r${c}`, at: c * 1000 + 500, state: 3 }); // oubli puis rappel
      for (let k = 0; k < 4; k++) logs.push({ cardId: `n${c}`, at: c * 1000 + k, state: k ? 1 : 0 });
    }
    const p = observedProfile(logs, 9_000, () => 'j');
    expect(p.answersPerReview).toBeCloseTo(1.25);
    expect(p.answersPerNew).toBe(4);
    expect(observedProfile(logs.slice(0, 10), 9_000, () => 'j').answersPerNew).toBe(DEFAULT_ANSWERS_PER_NEW);
  });

  it('échéances des 7 jours suivants', () => {
    const end = 10 * DAY;
    expect(upcomingDue([end - 1, end, end + 1, end + DAY + 5, end + 7 * DAY], end)).toEqual([2, 1, 0, 0, 0, 0, 0]);
  });

  it('répartition : la langue ouverte d’abord, plafonds respectés, mots déjà introduits comptés', () => {
    const us = [
      { id: 'en', cap: 10, introducedToday: 2 },
      { id: 'es', cap: 5, introducedToday: 0 },
    ];
    expect(shareNewCards(6, us, 'es')).toEqual({ es: 4, en: 2 });
    expect(shareNewCards(30, us, 'en')).toEqual({ en: 10, es: 5 });
    // Déjà plus que permis : on n'en retire pas, on n'en ajoute plus.
    expect(shareNewCards(1, us, 'en')).toEqual({ en: 2, es: 0 });
  });

  it('temps réellement passé : durées bornées à une minute par réponse', () => {
    expect(spentMinutes([30_000, 30_000, 600_000])).toBeCloseTo(2);
  });

  it('prévu et réel des jours passés, aujourd’hui exclu', () => {
    const dayOf = (t: number) => `d${Math.floor(t / DAY)}`;
    const logs = [
      { at: 1 * DAY + 5, durationMs: 30_000 },
      { at: 1 * DAY + 9, durationMs: 90_000 },
      { at: 3 * DAY, durationMs: 10_000 },
    ];
    expect(budgetHistory({ d2: 4, d1: 3, d3: 8 }, logs, dayOf, 'd3')).toEqual([
      { day: 'd1', predicted: 3, spent: 1.5 },
      { day: 'd2', predicted: 4, spent: 0 },
    ]);
  });
});
