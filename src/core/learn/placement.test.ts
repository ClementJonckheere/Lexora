import { describe, expect, it } from 'vitest';
import { PlacementModel, updatePlacementProbability, type PlacementAnswer, type PlacementQuestion, type PlacementTarget } from './placement';

const target = (id: string, requires: string[] = [], after: string[] = []): PlacementTarget => ({ id, kind: 'point', requires, after });
const bank = (ids: string[], mode: 'typed' | 'choice' = 'typed', n = 8): PlacementQuestion[] =>
  ids.flatMap((targetId) => Array.from({ length: n }, (_, i) => ({ id: `${targetId}:${i}`, targetId, mode, ...(mode === 'choice' ? { choices: 2 } : {}) })));
const answers = (id: string, pattern: boolean[]): PlacementAnswer[] => pattern.map((yes, i) => ({ questionId: `${id}:${i}`, response: yes ? 'correct' : 'incorrect' }));

describe('Bayes pour le placement', () => {
  it('calcule les vraisemblances et tient compte du hasard des choix', () => {
    expect(updatePlacementProbability(0.5, 'correct', 0.1, 0.05)).toBeCloseTo(0.9 / 0.95);
    expect(updatePlacementProbability(0.5, 'incorrect', 0.1, 0.05)).toBeCloseTo(0.1 / 1.05);
    expect(updatePlacementProbability(0.5, 'unknown', 0.1, 0.05)).toBe(updatePlacementProbability(0.5, 'incorrect', 0.1, 0.05));
    const typed = new PlacementModel([target('a')], bank(['a']));
    const choice = new PlacementModel([target('a')], bank(['a'], 'choice'));
    expect(typed.estimate(answers('a', [true, true]))[0].state).toBe('mastered');
    expect(choice.estimate(answers('a', [true, true]))[0].state).toBe('consolidate');
    expect(choice.estimate(answers('a', [true, true, true, true]))[0].state).toBe('mastered');
  });

  it('une seule réponse, meme juste, ne valide pas un point et ne se propage pas', () => {
    const m = new PlacementModel([target('a'), target('b', ['a'])], bank(['a', 'b']));
    expect(m.estimate(answers('b', [true])).map((x) => x.evidence)).toEqual(['unassessed', 'incomplete']);
    expect(m.estimate(answers('b', [true, true])).map((x) => x.state)).toEqual(['mastered', 'mastered']);
    expect(m.estimate(answers('b', [true, true]))[0].sources).toEqual(['b']);
  });

  it('rejoue les log-vraisemblances sans probabilité absorbante ni mutation', () => {
    const m = new PlacementModel([target('a')], bank(['a'], 'typed', 40));
    const a = answers('a', [...Array<boolean>(10).fill(true), ...Array<boolean>(30).fill(false)]);
    const before = structuredClone(a);
    const p = m.estimate(a)[0].probability;
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.15);
    expect(a).toEqual(before);
    expect(m.estimate(JSON.parse(JSON.stringify(a)))).toEqual(m.estimate(a));
  });
});

describe('déductions et contradictions', () => {
  const targets = [target('a'), target('b', ['a']), target('c', ['b']), target('independent', [], ['c'])];
  const m = new PlacementModel(targets, bank(targets.map((t) => t.id)));

  it('réussite vers les prérequis, échec vers les dependants, jamais l\'inverse ni via after', () => {
    expect(m.estimate(answers('c', [true, true])).map((x) => x.state)).toEqual(['mastered', 'mastered', 'mastered', 'consolidate']);
    expect(m.estimate(answers('a', [false, false])).map((x) => x.state)).toEqual(['learn', 'consolidate', 'consolidate', 'consolidate']);
    expect(m.estimate(answers('a', [false, false, false])).map((x) => x.state)).toEqual(['learn', 'learn', 'learn', 'consolidate']);
    expect(m.estimate(answers('a', [true, true])).map((x) => x.state)).toEqual(['mastered', 'consolidate', 'consolidate', 'consolidate']);
    expect(m.estimate(answers('c', [false, false])).map((x) => x.state)).toEqual(['consolidate', 'consolidate', 'learn', 'consolidate']);
    const changed = new PlacementModel(targets.map((t) => ({ ...t, after: ['unknown'] })), m.questions);
    expect(changed.estimate(answers('c', [true, true]))).toEqual(m.estimate(answers('c', [true, true])));
    expect(changed.next([])).toEqual(m.next([]));
  });

  it('ne multiplie pas deux preuves d\'un meme prérequis, meme dans un losange', () => {
    const t = [target('a'), target('b', ['a']), target('c', ['a']), target('d', ['b', 'c'])];
    const model = new PlacementModel(t, bank(t.map((x) => x.id)));
    const single = model.estimate(answers('d', [true, true]))[0].probability;
    const combined = model.estimate([...answers('d', [true, true]), ...answers('b', [true, true])])[0];
    expect(combined.probability).toBe(single);
    expect(combined.sources).toEqual(['b', 'd']);
  });

  it('suspend les sources contradictoires, puis recupere quand des réponses les departagent', () => {
    const history = [...answers('a', [false, false]), ...answers('c', [true, true])];
    const state = m.estimate(history);
    expect(state[0]).toMatchObject({ state: 'consolidate', evidence: 'conflict', sources: ['c'] });
    expect(state[2]).toMatchObject({ state: 'consolidate', evidence: 'conflict', sources: ['a'] });
    expect(state[1].evidence).toBe('unassessed');
    const recovered = m.estimate([...history, ...[2, 3, 4].map((i) => ({ questionId: `a:${i}`, response: 'correct' as const }))]);
    expect(recovered.slice(0, 3).every((e) => e.state === 'mastered')).toBe(true);
  });

  it('les pièges restent indépendants, y compris avec un point de grammaire connu', () => {
    const t: PlacementTarget[] = [target('be'), { id: 'be-age', kind: 'trap', requires: [], after: ['be'] }];
    const model = new PlacementModel(t, bank(t.map((x) => x.id)));
    expect(model.estimate(answers('be', [true, true]))[1].evidence).toBe('unassessed');
    expect(model.estimate(answers('be-age', [false, false]))[0].evidence).toBe('unassessed');
  });
});

describe('sélection adaptative et arrêt', () => {
  it('adapte le point suivant aux réponses plutot que de suivre un ordre fixe', () => {
    const t = [target('a'), target('b', ['a']), target('c', ['b']), target('d', ['c']), target('x')];
    const m = new PlacementModel(t, bank(t.map((x) => x.id)));
    const q = m.next([]).question!;
    let right: PlacementAnswer[] = [];
    let wrong: PlacementAnswer[] = [];
    for (let i = 0; i < 3; i++) {
      right = m.answer(right, m.next(right).question!.id, 'correct');
      wrong = m.answer(wrong, m.next(wrong).question!.id, 'unknown');
    }
    expect(q).toBeDefined();
    expect(m.next(right).question?.targetId).not.toBe(m.next(wrong).question?.targetId);
  });

  it('une modification d\'un historique déjà consulté ne reutilise pas une ancienne decision', () => {
    const m = new PlacementModel([target('a')], bank(['a']));
    const a: PlacementAnswer[] = [];
    const first = m.next(a).question!;
    a.push({ questionId: first.id, response: 'correct' });
    expect(m.next(a).question?.id).not.toBe(first.id);
  });

  it('termine le minimum de questions commence et respecte le plafond', () => {
    const t = Array.from({ length: 30 }, (_, i) => target(`p${i}`));
    const m = new PlacementModel(t, bank(t.map((x) => x.id)));
    let a: PlacementAnswer[] = [];
    while (true) {
      const q = m.next(a).question;
      if (!q) break;
      const copy = structuredClone(a);
      a = m.answer(a, q.id, 'correct');
      expect(copy).toHaveLength(a.length - 1);
      if (a.length % 2) expect(m.next(a).question?.targetId).toBe(q.targetId);
    }
    expect(a).toHaveLength(40);
    expect(m.next(a).reason).toBe('budget');
    expect(m.estimate(a).filter((x) => x.state === 'mastered')).toHaveLength(20);
    expect(m.estimate(a).filter((x) => x.evidence === 'unassessed')).toHaveLength(10);
    expect(() => m.answer(a, 'p25:0', 'correct')).toThrow();
  });

  it('reserve deux places avant un nouveau point et distingue une banque insuffisante', () => {
    const t = [target('a'), target('b')];
    const m = new PlacementModel(t, bank(['a', 'b']), { maxQuestions: 3 });
    let a: PlacementAnswer[] = [];
    for (let i = 0; i < 2; i++) a = m.answer(a, m.next(a).question!.id, 'correct');
    expect(m.next(a)).toEqual({ question: null, reason: 'budget' });
    const limited = new PlacementModel(t, bank(['a'], 'typed', 1));
    expect(limited.next([])).toEqual({ question: null, reason: 'bank-exhausted' });
  });

  it('ne compte jamais deux questions sur la meme phrase et signale une fin complete', () => {
    const q = bank(['a']);
    q[1].evidenceId = q[0].id;
    const m = new PlacementModel([target('a')], q);
    let a = m.answer([], q[0].id, 'correct');
    expect(m.next(a).question?.id).toBe(q[2].id);
    a = m.answer(a, q[2].id, 'correct');
    expect(m.next(a)).toEqual({ question: null, reason: 'complete' });
    expect(() => m.estimate([{ questionId: q[0].id, response: 'correct' }, { questionId: q[1].id, response: 'correct' }])).toThrow();
    expect(() => m.answer([], q[7].id, 'correct')).toThrow();
  });
});

describe('entrées invalides', () => {
  it('rejette les cycles, les liens de pièges et les doublons', () => {
    expect(() => new PlacementModel([], [])).toThrow();
    expect(() => new PlacementModel([target('a', ['b']), target('b', ['a'])], [])).toThrow();
    expect(() => new PlacementModel([target('a', ['missing'])], [])).toThrow();
    expect(() => new PlacementModel([target('a'), target('a')], [])).toThrow();
    expect(() => new PlacementModel([{ id: 'trap', kind: 'trap', requires: ['a'] }, target('a')], [])).toThrow();
    expect(() => new PlacementModel([target('a', ['trap']), { id: 'trap', kind: 'trap', requires: [] }], [])).toThrow();
  });

  it('rejette les probabilités, budgets et questions invalides', () => {
    for (const config of [{ confidence: NaN }, { deductionConfidence: 0.8 }, { prior: 1 }, { slip: 0 }, { typedChance: 0.99 }, { maxQuestions: 41 }, { minQuestions: 1 }]) {
      expect(() => new PlacementModel([target('a')], [], config)).toThrow();
    }
    expect(() => new PlacementModel([target('a')], [{ id: 'x', targetId: 'a', mode: 'choice', choices: 1 }])).toThrow();
    expect(() => new PlacementModel([target('a')], bank(['missing']))).toThrow();
    expect(() => new PlacementModel([target('a')], [bank(['a'])[0], bank(['a'])[0]])).toThrow();
    expect(() => updatePlacementProbability(0.5, 'correct', 0.1, 0.95)).toThrow();
  });
});
