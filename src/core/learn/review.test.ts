import { describe, expect, it } from 'vitest';
import type { GrammarAnswer } from './progress';
import { dueLabel, lessonReview, REVIEW_INTERVALS } from './review';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1, 9);

/** Une séance : réponses espacées de 30 secondes à partir de `start`. */
const session = (start: number, results: boolean[], prefix = 's'): GrammarAnswer[] =>
  results.map((correct, i) => ({ lessonId: 'passive', itemId: `${prefix}${start}-${i}`, correct, reported: false, createdAt: start + i * 30_000 }));

const ok = (n: number) => Array<boolean>(n).fill(true);

describe('révision espacée des leçons', () => {
  it('rien à réviser tant que la leçon n’est pas acquise', () => {
    const r = lessonReview(session(T0, [...ok(15), false, false, false, false, false]), T0 + 30 * DAY);
    expect(r).toMatchObject({ scheduled: false, due: false, dueAt: null });
  });

  it('acquise : première révision 3 jours plus tard', () => {
    const answers = [...session(T0, ok(10)), ...session(T0 + DAY, ok(10))];
    const acquiredAt = answers[19].createdAt;
    const r = lessonReview(answers, acquiredAt + DAY);
    expect(r).toMatchObject({ scheduled: true, due: false, step: 0 });
    expect(r.dueAt).toBe(acquiredAt + 3 * DAY);
    expect(lessonReview(answers, acquiredAt + 3 * DAY).due).toBe(true);
  });

  it('révisions réussies : intervalles croissants ; s’entraîner avant l’échéance ne change rien', () => {
    let answers = [...session(T0, ok(20))];
    let due = lessonReview(answers).dueAt!;
    // Entraînement libre avant l'échéance : pas une révision.
    answers = [...answers, ...session(due - DAY, [false, false, false, false, false], 'x')];
    expect(lessonReview(answers).dueAt).toBe(due);
    for (let k = 1; k <= 3; k++) {
      answers = [...answers, ...session(due + DAY, [true, true, false, true, true])]; // 4 sur 5 : réussie
      const r = lessonReview(answers, due + DAY);
      expect(r).toMatchObject({ step: k, streak: k, lapsed: false, due: false });
      expect(r.dueAt).toBe(answers[answers.length - 1].createdAt + REVIEW_INTERVALS[k] * DAY);
      due = r.dueAt!;
    }
  });

  it('révision manquée : la leçon revient le lendemain, puis l’intervalle repart à 3 jours', () => {
    let answers = session(T0, ok(20));
    const due = lessonReview(answers).dueAt!;
    answers = [...answers, ...session(due, [true, false, true, false, true])]; // 3 sur 5
    const lapsed = lessonReview(answers, due + 1000);
    expect(lapsed).toMatchObject({ lapsed: true, step: 0, streak: 0, due: false });
    expect(lapsed.dueAt).toBe(answers[answers.length - 1].createdAt + DAY);
    answers = [...answers, ...session(lapsed.dueAt!, ok(5))];
    const back = lessonReview(answers, lapsed.dueAt! + 1000);
    expect(back).toMatchObject({ lapsed: false, step: 0, streak: 1 });
    expect(back.dueAt).toBe(answers[answers.length - 1].createdAt + 3 * DAY);
  });

  it('séance de moins de 5 réponses à l’échéance : la révision reste à faire', () => {
    let answers = session(T0, ok(20));
    const due = lessonReview(answers).dueAt!;
    answers = [...answers, ...session(due, ok(3))];
    expect(lessonReview(answers, due + DAY)).toMatchObject({ due: true, step: 0 });
  });

  it('échéance lisible', () => {
    expect([dueLabel(T0, T0), dueLabel(T0 + DAY, T0), dueLabel(T0 + 3 * DAY, T0), dueLabel(T0 + 21 * DAY, T0), dueLabel(T0 + 90 * DAY, T0)]).toEqual([
      "aujourd'hui",
      'demain',
      'dans 3 jours',
      'dans 3 semaines',
      'dans 3 mois',
    ]);
  });
});
