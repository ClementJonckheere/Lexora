import { describe, expect, it } from 'vitest';
import { dateDiffInDays, default_w, FSRSAlgorithm, forgetting_curve, generatorParameters, type FSRSState } from 'ts-fsrs';
import { fitParameters, isHoldout, metrics, MIN_FIT_REVIEWS, sequences, type ReviewRow } from './optimizer';

const DAY = 86_400_000;
const START = new Date(2025, 0, 6, 9).getTime();

/**
 * Apprenant simulé : sa vraie mémoire suit `truth` ; il révise aux échéances que lui donnent les paramètres par défaut
 * (retention 0,9), comme dans Lexora avant optimisation.
 */
function simulate(truth: readonly number[], cards: number, seed = 1): ReviewRow[] {
  let s = seed;
  const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const real = new FSRSAlgorithm(generatorParameters({ w: [...truth], enable_short_term: true }));
  const planner = new FSRSAlgorithm(generatorParameters({ w: [...default_w], enable_short_term: true }));
  const rows: ReviewRow[] = [];
  for (let c = 0; c < cards; c++) {
    let day = Math.floor(rand() * 30);
    let mine: FSRSState | null = null;
    let planned: FSRSState | null = null;
    let last = day;
    for (let i = 0; i < 7; i++) {
      const t = i ? day - last : 0;
      const recalled = !mine || rand() < forgetting_curve(truth, t, mine.stability);
      const g = !mine ? (rand() < 0.3 ? 1 : 3) : recalled ? (rand() < 0.15 ? 4 : rand() < 0.2 ? 2 : 3) : 1;
      rows.push({ cardId: `c${c}`, at: START + day * DAY, rating: g, state: i ? 2 : 0 });
      mine = real.next_state(mine, t, g);
      planned = planner.next_state(planned, t, g);
      last = day;
      day += Math.max(1, Math.round(planner.next_interval(planned.stability, t)));
    }
  }
  return rows;
}

describe('optimisation des paramètres FSRS', () => {
  it('historique trop court : rien', async () => {
    expect(await fitParameters(simulate(default_w, 20))).toBeNull();
  });

  it('ne garde que les historiques complets, partage stable entre apprentissage et contrôle', () => {
    const rows: ReviewRow[] = [
      { cardId: 'a', at: START, rating: 3, state: 0 },
      { cardId: 'a', at: START + 2 * DAY, rating: 1, state: 2 },
      { cardId: 'b', at: START, rating: 3, state: 2 },
      { cardId: 'b', at: START + 3 * DAY, rating: 3, state: 2 },
    ];
    expect(sequences(rows).map((s) => s.key)).toEqual(['a']);
    expect(isHoldout('card-42')).toBe(isHoldout('card-42'));
  });

  it('mémoire plus faible que prévu : les paramètres personnels prédisent mieux les révisions de contrôle', async () => {
    // Stabilités initiales divisées par 3, croissance après succès réduite : le défaut surestime la mémorisation.
    const truth = default_w.map((x, i) => (i <= 3 ? x / 3 : i === 8 ? x * 0.6 : x));
    const rows = simulate(truth, 500);
    const fit = await fitParameters(rows, { epochs: 4 });
    expect(fit).not.toBeNull();
    expect(fit!.reviews).toBeGreaterThan(MIN_FIT_REVIEWS);
    expect(fit!.after.logLoss).toBeLessThan(fit!.before.logLoss);
    expect(fit!.better).toBe(true);
    // Le modèle par défaut surestime le rappel ; les paramètres trouvés s'approchent de la vraie mémoire.
    const truthLoss = metrics(truth, sequences(rows).filter((s) => isHoldout(s.key))).logLoss;
    expect(fit!.after.logLoss - truthLoss).toBeLessThan(fit!.before.logLoss - truthLoss);
  }, 60_000);

  it('mémoire conforme au modèle par défaut : pas de changement sans gain mesuré', async () => {
    const fit = await fitParameters(simulate(default_w, 400, 7), { epochs: 3 });
    expect(fit?.better).toBe(false);
  }, 60_000);
});

describe('jours comptés comme le planificateur', () => {
  it('même convention que ts-fsrs (dates UTC), y compris autour de minuit UTC', () => {
    // À Paris (UTC+1) : 00 h 50 puis 01 h 10 le même jour local, mais de part et d'autre de minuit UTC.
    const pairs = [
      [Date.UTC(2026, 10, 1, 23, 50), Date.UTC(2026, 10, 2, 0, 10)],
      [Date.UTC(2026, 10, 1, 0, 10), Date.UTC(2026, 10, 1, 23, 50)],
      [Date.UTC(2026, 2, 28, 22, 30), Date.UTC(2026, 2, 30, 0, 30)],
    ];
    for (const [a, b] of pairs) {
      const [seq] = sequences([
        { cardId: 'x', at: a, rating: 3, state: 0 },
        { cardId: 'x', at: b, rating: 3, state: 2 },
        { cardId: 'x', at: b + 3 * DAY, rating: 3, state: 2 },
      ]);
      expect(seq.steps[1].t).toBe(dateDiffInDays(new Date(a), new Date(b)));
    }
  });
});
