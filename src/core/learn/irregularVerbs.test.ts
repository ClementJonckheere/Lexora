import { describe, expect, it } from 'vitest';
import { checkVerb, formOk, IRREGULAR_VERBS, masteredVerbs, pickVerbs, verbState, VERB_NEW_PER_SESSION, type VerbAnswer } from './irregularVerbs';

const DAY = 86_400_000;
const T = new Date(2026, 9, 30, 9, 0).getTime();
const verb = (base: string) => IRREGULAR_VERBS.find((v) => v.base === base)!;
const ok = (v: string, at: number): VerbAnswer => ({ verb: v, at, pastOk: true, participleOk: true });
const ko = (v: string, at: number): VerbAnswer => ({ verb: v, at, pastOk: true, participleOk: false });

describe('verbes irréguliers : données', () => {
  it('144 verbes traduits, trois niveaux de fréquence, les plus courants en premier', () => {
    expect(IRREGULAR_VERBS).toHaveLength(144);
    expect(IRREGULAR_VERBS.every((v) => v.fr && [1, 2, 3].includes(v.tier))).toBe(true);
    expect(verb('go').tier).toBe(1);
  });
});

describe('verbes irréguliers : réponses', () => {
  it('variantes admises, casse et espaces ignorés, une forme fausse suffit à rater', () => {
    expect(formOk(' Burnt ', ['burnt', 'burned'])).toBe(true);
    expect(formOk('burnt/burned', ['burnt', 'burned'])).toBe(true);
    expect(formOk('was or were', ['was', 'were'])).toBe(true);
    expect(formOk('was / wen', ['was', 'were'])).toBe(false);
    expect(formOk('', ['went'])).toBe(false);
    expect(checkVerb(verb('go'), 'went', 'goed')).toEqual({ pastOk: true, participleOk: false });
    expect(checkVerb(verb('get'), 'got', 'gotten')).toEqual({ pastOk: true, participleOk: true });
  });

  it('répétition espacée : 1, 3, 7 jours après des réponses justes ; tout de suite après une erreur', () => {
    expect(verbState('go', []).due).toBeNull();
    expect(verbState('go', [ok('go', T)]).due).toBe(T + DAY);
    expect(verbState('go', [ok('go', T), ok('go', T + DAY)]).due).toBe(T + 4 * DAY);
    expect(verbState('go', [ok('go', T), ok('go', T + DAY), ko('go', T + 4 * DAY)]).due).toBe(T + 4 * DAY);
  });

  it('maîtrisé : 3 réponses justes de suite sur 3 jours différents', () => {
    expect(verbState('go', [ok('go', T), ok('go', T + 1000), ok('go', T + 2000)]).mastered).toBe(false);
    const three = [ok('go', T), ok('go', T + DAY), ok('go', T + 4 * DAY)];
    expect(verbState('go', three).mastered).toBe(true);
    expect(verbState('go', [...three, ko('go', T + 11 * DAY)]).mastered).toBe(false);
    expect(masteredVerbs(three)).toBe(1);
  });

  it('séance : verbes à revoir d’abord, puis 6 nouveaux au plus, les plus courants', () => {
    const fresh = pickVerbs([], T);
    expect(fresh).toHaveLength(10);
    expect(fresh.every((v) => v.tier === 1)).toBe(true);
    const answers = [ok('go', T - 2 * DAY), ko('take', T - 3 * DAY), ok('make', T)];
    const s = pickVerbs(answers, T);
    expect(s.slice(0, 2).map((v) => v.base)).toEqual(['take', 'go']); // le plus en retard d'abord ; make pas encore dû
    expect(s.filter((v) => !['take', 'go'].includes(v.base))).toHaveLength(VERB_NEW_PER_SESSION);
    expect(s.some((v) => v.base === 'make')).toBe(false);
  });
});
