import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { CardRecord, Direction, Note } from '../domain/types';
import { isEvaluationSentence } from '../learn/evaluationSplit';
import {
  acceptedVariants,
  checkReuseSentence,
  checkReuseTyped,
  pickReuseNotes,
  reuseItem,
  stageOf,
  usableSentences,
  type ReuseAnswer,
  type ReuseStage,
} from './reuse';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 12);

const card = (noteId: string, direction: Direction, patch: Partial<CardRecord> = {}): CardRecord => ({
  id: `${noteId}-${direction}`,
  noteId,
  direction,
  state: State.Review,
  due: NOW + 5 * DAY,
  stability: 10,
  difficulty: 5,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 3,
  lapses: 0,
  lastReview: NOW - 5 * DAY,
  ...patch,
});

function note(id: string, expression = 'to tackle an issue', patch: Partial<Note> = {}, fr: Partial<CardRecord> = {}): Note {
  return {
    id,
    universeId: 'en',
    expression,
    translation: "s'attaquer à un problème",
    expressionKey: expression,
    pronunciation: '',
    comment: '',
    category: '',
    categoryAuto: true,
    isFavorite: false,
    suspended: false,
    createdAt: 0,
    updatedAt: 0,
    examples: ['We need to tackle this issue before it gets worse.'],
    tags: [],
    collectionIds: [],
    cards: { fr_en: card(id, 'fr_en', fr), en_fr: card(id, 'en_fr') },
    ...patch,
  };
}

let seq = 0;
const answer = (noteId: string, stage: ReuseStage, rating: 1 | 2 | 3, createdAt: number, extra: Partial<ReuseAnswer> = {}): ReuseAnswer => ({
  id: String(seq++),
  universeId: 'en',
  noteId,
  stage,
  sentenceId: 0,
  given: '',
  verdict: 'present',
  rating,
  createdAt,
  ...extra,
});

/** Premiers identifiants d'entraînement et d'évaluation (séparation permanente par phrase). */
const training = (n: number) => {
  const ids: number[] = [];
  for (let i = 1000; ids.length < n; i++) if (!isEvaluationSentence(i)) ids.push(i);
  return ids;
};
const evaluationId = (() => {
  for (let i = 1000; ; i++) if (isEvaluationSentence(i)) return i;
})();

describe('réutiliser : progression par étapes', () => {
  it('étape suivante seulement après une réponse juste ; un échec ne fait pas reculer', () => {
    expect(stageOf([])).toEqual({ stage: 1, done: false });
    expect(stageOf([answer('a', 1, 2, 1)])).toEqual({ stage: 1, done: false });
    expect(stageOf([answer('a', 1, 3, 1)])).toEqual({ stage: 2, done: false });
    expect(stageOf([answer('a', 1, 3, 1), answer('a', 2, 3, 2), answer('a', 3, 1, 3)])).toEqual({ stage: 3, done: false });
    expect(stageOf([answer('a', 1, 3, 1), answer('a', 2, 3, 2), answer('a', 3, 3, 3)])).toEqual({ stage: 3, done: true });
    // C'est la dernière réponse de chaque étape qui compte.
    expect(stageOf([answer('a', 1, 3, 1), answer('a', 1, 1, 5)])).toEqual({ stage: 1, done: false });
  });

  it('choix des notes : fiches en révision seulement, parcours en cours d’abord, deux jours entre deux séances', () => {
    const notes = [
      note('new', 'to figure out', {}, { state: State.New }),
      note('suspended', 'to take for granted', { suspended: true }),
      note('fresh', 'to come up with'),
      note('started', 'to look forward to'),
      note('recent', 'to give up'),
      note('done', 'to get rid of'),
    ];
    const answers = [
      answer('started', 1, 3, NOW - 10 * DAY),
      answer('recent', 1, 3, NOW - DAY),
      ...([1, 2, 3] as const).map((s) => answer('done', s, 3, NOW - 20 * DAY + s)),
    ];
    const picked = pickReuseNotes(notes, answers, DEFAULT_SETTINGS, NOW);
    expect(picked.map((p) => [p.note.id, p.stage, p.done])).toEqual([
      ['started', 2, false],
      ['fresh', 1, false],
      ['done', 3, true],
    ]);
    expect(pickReuseNotes(notes, answers, DEFAULT_SETTINGS, NOW, 1)).toHaveLength(1);
  });
});

describe('réutiliser : phrases', () => {
  const n = note('a');
  const [t1, t2, t3] = training(3);
  const candidates = [
    { id: t1, text: 'The government must tackle the issue of homelessness.', translation: 'Le gouvernement doit s’attaquer au problème des sans-abri.' },
    { id: t2, text: 'We need to tackle this issue before it gets worse.', translation: 'Nous devons nous attaquer à ce problème.' },
    { id: evaluationId, text: 'They tackled the issue head-on.', translation: 'Ils se sont attaqués au problème de front.' },
    { id: t3, text: 'Nobody knows what happened.', translation: 'Personne ne sait ce qui est arrivé.' },
  ];

  it('phrases jamais vues dans la note, contenant l’expression, réservées à l’entraînement ; déjà travaillées en dernier', () => {
    expect(usableSentences(n, candidates, 'en').map((s) => s.id)).toEqual([t1]);
    const more = [...candidates, { id: training(4)[3], text: 'Tackling an issue early saves time.', translation: 'S’attaquer tôt à un problème fait gagner du temps.' }];
    expect(usableSentences(n, more, 'en', new Set([t1])).map((s) => s.id)).toEqual([training(4)[3], t1]);
  });

  it('sans phrase disponible (hors ligne, rien trouvé), la note passe à la phrase personnelle', () => {
    expect(reuseItem(n, 1, []).stage).toBe(3);
    const s = usableSentences(n, candidates, 'en');
    expect(reuseItem(n, 2, s)).toMatchObject({ stage: 2, sentence: { id: t1 } });
    expect(reuseItem(n, 3, s).sentence).toBeNull();
  });

  it('étape 1 : forme de la phrase acceptée, forme approchée, erreur', () => {
    const item = reuseItem(n, 1, usableSentences(n, candidates, 'en'));
    // Deux trous (« tackle » … « issue ») : les mots des trous, ou l'expression elle-même.
    expect(checkReuseTyped(item, 'tackle issue', 'en')).toEqual({ verdict: 'exact', rating: 3 });
    expect(checkReuseTyped(item, 'tackle an issue', 'en').rating).toBe(3);
    expect(checkReuseTyped(item, 'tacke an issue', 'en').rating).toBe(2);
    expect(checkReuseTyped(item, 'solve the problem', 'en')).toEqual({ verdict: 'wrong', rating: 1 });
  });

  it('étapes 2 et 3 : référence ou variante acceptée reconnues, sinon présence de l’expression et autoévaluation', () => {
    const s = usableSentences(n, candidates, 'en')[0];
    const variant = 'The government has to tackle the issue of homelessness.';
    const accepted = acceptedVariants(s, [answer('a', 2, 3, 1, { sentenceId: s.id, given: variant }), answer('a', 2, 1, 2, { sentenceId: s.id, given: 'wrong one' })]);
    expect(accepted).toEqual([s.text, variant]);
    expect(checkReuseSentence(n, 'the government must tackle the issue of homelessness', 'en', accepted)).toEqual({ verdict: 'reference', suggested: 3 });
    expect(checkReuseSentence(n, variant, 'en', accepted).verdict).toBe('reference');
    expect(checkReuseSentence(n, 'My manager tackled the issue yesterday.', 'en', accepted)).toEqual({ verdict: 'present', suggested: null });
    expect(checkReuseSentence(n, 'My manager solved the problem.', 'en', accepted)).toEqual({ verdict: 'absent', suggested: null });
    expect(checkReuseSentence(n, '  ', 'en').verdict).toBe('absent');
  });
});
