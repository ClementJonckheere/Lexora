import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { CardRecord, Direction, Note } from '../domain/types';
import { isEvaluationSentence } from '../learn/evaluationSplit';
import { audioUrl, compatibleLicense, dictationDiff, parseBank, pickListening, type ListeningAnswer, type ListeningBankFile } from './listening';

const training = (() => {
  const ids: number[] = [];
  for (let i = 5000; ids.length < 40; i++) if (!isEvaluationSentence(i)) ids.push(i);
  return ids;
})();
const evaluationId = (() => {
  for (let i = 5000; ; i++) if (isEvaluationSentence(i)) return i;
})();

const card = (noteId: string, direction: Direction, state: State): CardRecord => ({
  id: `${noteId}-${direction}`,
  noteId,
  direction,
  state,
  due: 0,
  stability: 10,
  difficulty: 5,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 3,
  lapses: 0,
  lastReview: 0,
});
const note = (id: string, expression: string, state = State.Review, examples: string[] = []): Note => ({
  id,
  universeId: 'en',
  expression,
  translation: '',
  expressionKey: expression,
  pronunciation: '',
  comment: '',
  category: '',
  categoryAuto: true,
  isFavorite: false,
  suspended: false,
  createdAt: 0,
  updatedAt: 0,
  examples,
  tags: [],
  collectionIds: [],
  cards: { fr_en: card(id, 'fr_en', state), en_fr: card(id, 'en_fr', state) },
});

const file: ListeningBankFile = {
  language: 'en',
  authors: ['CK', 'Someone'],
  licenses: ['CC BY 2.0 FR', 'For Tatoeba only', 'CC BY-NC-ND 3.0'],
  items: [
    [training[0], 'We finally figured out the problem.', 'Nous avons enfin trouvé le problème.', 101, 0, 0],
    [training[1], 'She took it for granted.', 'Elle l’a considéré comme acquis.', 102, 0, 2],
    [training[2], 'He gave up smoking last year.', 'Il a arrêté de fumer l’an dernier.', 103, 1, 1],
    [evaluationId, 'I figured out the answer.', 'J’ai trouvé la réponse.', 104, 0, 0],
    ...training.slice(3, 30).map((id, i) => [id, `This is an ordinary sentence number ${i}.`, `Phrase ${i}.`, 200 + i, 0, 0] as [number, string, string, number, number, number]),
  ],
};
const bank = parseBank(file, 'eng');

describe('écoute : banque', () => {
  it('licences : Creative Commons et domaine public, jamais « pour Tatoeba seulement »', () => {
    expect(['CC BY 2.0 FR', 'CC BY-NC 4.0', 'CC0 1.0', 'CC BY-NC-ND 3.0', 'Public domain'].every(compatibleLicense)).toBe(true);
    expect(['For Tatoeba only', '', 'Licensing issue'].some(compatibleLicense)).toBe(false);
  });

  it('lecture : adresse de l’enregistrement, licence incompatible et phrases d’évaluation écartées', () => {
    expect(bank.map((s) => s.id)).not.toContain(training[2]);
    expect(bank.map((s) => s.id)).not.toContain(evaluationId);
    expect(bank[0]).toEqual({ id: training[0], text: 'We finally figured out the problem.', fr: 'Nous avons enfin trouvé le problème.', audioUrl: 'https://tatoeba.org/audio/download/101', author: 'CK', license: 'CC BY 2.0 FR' });
    expect(audioUrl(0, 42, 'eng')).toBe('https://audio.tatoeba.org/sentences/eng/42.mp3');
  });
});

describe('écoute : séance', () => {
  const rng = () => 0.3;
  const notes = [note('fig', 'to figure out'), note('gr', 'to take for granted'), note('new', 'to give up', State.New)];

  it('phrases avec une expression retenue (formes conjuguées), puis phrases du quotidien ; cinq en tout', () => {
    const items = pickListening(bank, notes, [], DEFAULT_SETTINGS, 'en', 5, rng);
    expect(items).toHaveLength(5);
    const withNote = items.filter((i) => i.note).map((i) => [i.note!.id, i.sentence.id]);
    expect(withNote.sort()).toEqual([
      ['fig', training[0]],
      ['gr', training[1]],
    ]);
    expect(new Set(items.map((i) => i.sentence.id)).size).toBe(5);
  });

  it('jamais une phrase déjà entendue ni un exemple de la note tant qu’il en reste d’autres', () => {
    const heard: ListeningAnswer[] = [training[0], ...training.slice(3, 10)].map((sentenceId, i) => ({
      id: String(i),
      universeId: 'en',
      sentenceId,
      noteId: '',
      comprehension: 3,
      dictation: '',
      dictationScore: -1,
      shadowed: 1,
      reformulated: false,
      createdAt: i,
    }));
    const withExample = [note('fig', 'to figure out'), note('gr', 'to take for granted', State.Review, ['She took it for granted.'])];
    const items = pickListening(bank, withExample, heard, DEFAULT_SETTINGS, 'en', 5, rng);
    const ids = items.map((i) => i.sentence.id);
    expect(ids.some((id) => heard.some((h) => h.sentenceId === id))).toBe(false);
    expect(items.every((i) => i.note === null)).toBe(true);
  });
});

describe('écoute : dictée', () => {
  it('mots retrouvés, ponctuation et casse ignorées, mots oubliés signalés', () => {
    const d = dictationDiff("We finally figured out the problem.", 'we figured out the problem');
    expect(d.score).toBe(83);
    expect(d.words.filter((w) => !w.heard).map((w) => w.text)).toEqual(['finally']);
    expect(dictationDiff('Hello, world!', 'hello world').score).toBe(100);
    expect(dictationDiff('Hello, world!', '').score).toBe(0);
    // Un mot en trop ne fait pas perdre les suivants.
    expect(dictationDiff('I am going home', 'I am really going home').score).toBe(100);
  });
});
