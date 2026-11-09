import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Exercise } from './exercises';
import { isEvaluationSentence, tatoebaSentenceId } from './evaluationSplit';
import { explanation, groupReady, MIN_ANSWERS, MIX_GROUPS, mixedOptions, mixedSession, mixLessonId, startedLessons } from './mixedPractice';
import type { GrammarAnswer } from './progress';

const ex = (o: Partial<Exercise>): Exercise => ({ id: 'x:1', en: '', fr: '', before: '', after: '', answer: '', ...o });
const answers = (lessonId: string, n: number, extra: Partial<GrammarAnswer> = {}): GrammarAnswer[] =>
  Array.from({ length: n }, (_, i) => ({ lessonId, itemId: `${lessonId}:${i}`, correct: true, reported: false, createdAt: i, ...extra }));

describe('propositions du mélange', () => {
  it('conditionnels : will / would / would have pour la principale, au même degré de négation', () => {
    expect(mixedOptions('first-conditional', ex({ before: 'If you eat that, you ', answer: 'will die', choices: ['will die', 'die'] }))).toEqual([
      'will die',
      'would die',
      'would have died',
    ]);
    expect(mixedOptions('mixed-conditionals', ex({ before: 'If you had taken my advice, you ', answer: "wouldn't be", choices: [] }))).toEqual([
      "won't be",
      "wouldn't be",
      "wouldn't have been",
    ]);
  });

  it('conditionnels : présent / prétérit / plus-que-parfait après if, accordés au sujet', () => {
    expect(mixedOptions('third-conditional', ex({ before: 'If she ', answer: 'had trusted', choices: ['trusted', 'had trusted'] }))).toEqual([
      'trusts',
      'trusted',
      'had trusted',
    ]);
    expect(mixedOptions('second-conditional', ex({ before: "I'd shut up if I ", answer: 'were', choices: ['were', 'would be'] }))).toEqual(['am', 'were', 'had been']);
  });

  it('temps : la forme d’un temps que la traduction exclut', () => {
    expect(mixedOptions('simple-vs-continuous', ex({ answer: 'is writing', choices: ['is writing', 'writes'] }))).toEqual(['is writing', 'writes', 'wrote']);
    expect(mixedOptions('perfect-vs-past', ex({ answer: 'went', choices: ['went', 'have gone'] }))).toEqual(['went', 'have gone', 'go']);
    expect(mixedOptions('perfect-vs-past', ex({ answer: 'has taken', choices: ['has taken', 'took'] }))).toEqual(['has taken', 'took', 'takes']);
  });

  it('pas de forme inventée ni de faux conditionnel : propositions de la leçon, ou exercice écarté', () => {
    // « mistake », « overtake » se conjuguent comme « take » : pas de « mistaked », rien d'ajouté.
    expect(mixedOptions('simple-vs-continuous', ex({ answer: 'mistake', choices: ['mistake', 'are mistaking'] }))).toEqual(['mistake', 'are mistaking']);
    expect(mixedOptions('simple-vs-continuous', ex({ answer: 'overtakes', choices: ['overtakes', 'is overtaking'] }))).toEqual(['overtakes', 'is overtaking']);
    // « would like » : formule de politesse.
    expect(mixedOptions('second-conditional', ex({ answer: 'would like', choices: ['would like', 'liked'] }))).toBeNull();
  });

  it('une explication pour chaque nature de réponse des leçons mélangées', () => {
    for (const g of MIX_GROUPS)
      for (const id of g.lessons) {
        const forms = new Set((JSON.parse(readFileSync(`public/grammar/en/exercises/${id}.json`, 'utf8')).items as Exercise[]).map((e) => e.form));
        for (const f of forms) expect(explanation(id, f), `${id} / ${f}`).toBeTruthy();
      }
  });
});

describe('banques livrées : toutes les propositions du mélange', () => {
  for (const g of MIX_GROUPS)
    for (const id of g.lessons) {
      it(id, () => {
        const items = JSON.parse(readFileSync(`public/grammar/en/exercises/${id}.json`, 'utf8')).items as Exercise[];
        const bad: string[] = [];
        for (const e of items) {
          const o = mixedOptions(id, e);
          if (!o) continue;
          if (!o.includes(e.answer)) bad.push(`${e.id} : réponse absente (${o.join(' | ')})`);
          if (new Set(o.map((x) => x.toLowerCase())).size !== o.length) bad.push(`${e.id} : doublon (${o.join(' | ')})`);
          if (o.some((x) => !/^[a-z' ]+$/i.test(x))) bad.push(`${e.id} : forme suspecte (${o.join(' | ')})`);
        }
        expect(bad.slice(0, 10)).toEqual([]);
      });
    }
});

describe('séance mélangée (simulation permanente de la sélection)', () => {
  const group = MIX_GROUPS.find((g) => g.id === 'conditionals')!;
  const banks = Object.fromEntries(group.lessons.map((id) => [id, JSON.parse(readFileSync(`public/grammar/en/exercises/${id}.json`, 'utf8')).items as Exercise[]]));
  const history = group.lessons.flatMap((id) => answers(id, MIN_ANSWERS));

  it('une leçon n’entre dans le mélange qu’après MIN_ANSWERS réponses ; deux leçons au moins', () => {
    expect(startedLessons(group, [...answers('first-conditional', MIN_ANSWERS), ...answers('second-conditional', MIN_ANSWERS - 1)])).toEqual(['first-conditional']);
    expect(groupReady(group, answers('first-conditional', 50))).toBe(false);
    expect(groupReady(group, history)).toBe(true);
  });

  it('300 séances : 10 exercices distincts, leçons alternées et équilibrées, phrases d’entraînement seulement', () => {
    let seed = 11;
    const rng = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const perLesson = new Map<string, number>();
    for (let n = 0; n < 300; n++) {
      const session = mixedSession(banks, group.lessons, history, rng);
      expect(session).toHaveLength(10);
      expect(new Set(session.map((s) => s.ex.id)).size).toBe(10);
      for (let i = 1; i < session.length; i++) expect(session[i].lessonId).not.toBe(session[i - 1].lessonId);
      for (const s of session) {
        expect(s.ex.choices).toContain(s.ex.answer);
        const sentence = tatoebaSentenceId(s.ex.id);
        if (sentence !== null) expect(isEvaluationSentence(sentence)).toBe(false);
        perLesson.set(s.lessonId, (perLesson.get(s.lessonId) ?? 0) + 1);
      }
    }
    // Quatre leçons, 3 000 exercices : chacune entre 20 et 30 %.
    for (const id of group.lessons) expect((perLesson.get(id) ?? 0) / 3000).toBeGreaterThan(0.2);
  });

  it('exercices signalés écartés ; réussis récemment dans le mélange servis en dernier', () => {
    const reported = banks['first-conditional'].slice(0, 200).map((e) => ({ lessonId: 'first-conditional', itemId: e.id, correct: false, reported: true, createdAt: 1 }));
    const recent = banks['second-conditional'].slice(0, 200).map((e, i) => ({ lessonId: mixLessonId('conditionals'), itemId: e.id, correct: true, reported: false, createdAt: 10 + i }));
    const session = mixedSession(banks, ['first-conditional', 'second-conditional'], [...history, ...reported, ...recent], () => 0.42);
    const ids = new Set(session.map((s) => s.ex.id));
    for (const r of reported) expect(ids.has(r.itemId)).toBe(false);
    // Les 80 dernières réussites du mélange (les plus récentes) ne reviennent pas tant qu'il reste d'autres exercices.
    const last80 = new Set([...recent].sort((a, b) => b.createdAt - a.createdAt).slice(0, 80).map((r) => r.itemId));
    expect(session.filter((s) => s.lessonId === 'second-conditional').every((s) => !last80.has(s.ex.id))).toBe(true);
  });
});
