import { describe, expect, it } from 'vitest';
import { baseOf, buildExercise, ingOf, isCorrect, normalizeAnswer, pastOf, participleOf, withBlank, type SourceSentence } from './exercises';

const s = (en: string, id = 1): SourceSentence => ({ id, en, fr: 'traduction' });
const ex = (lesson: string, en: string, id = 1) => buildExercise(lesson, s(en, id));

describe('verbes', () => {
  it('base, prétérit, participe, -ing', () => {
    expect(baseOf('went')).toBe('go');
    expect(baseOf('written')).toBe('write');
    expect(baseOf('stopped')).toBe('stop');
    expect(baseOf('studied')).toBe('study');
    expect(baseOf('played')).toBe('play');
    expect(baseOf('liked', (w) => w === 'like')).toBe('like');
    expect(pastOf('go')).toBe('went');
    expect(pastOf('study')).toBe('studied');
    expect(participleOf('write')).toBe('written');
    expect([ingOf('go'), ingOf('make'), ingOf('stop'), ingOf('lie'), ingOf('see')]).toEqual(['going', 'making', 'stopping', 'lying', 'seeing']);
  });

  it('réponses : contractions acceptées dans les deux sens', () => {
    expect(normalizeAnswer("I've seen")).toBe('i have seen');
    const e = ex('present-perfect', "I've lost my keys.")!;
    expect(e.answer).toBe('have lost');
    expect(isCorrect(e, 'have lost')).toBe(true);
    expect(isCorrect(e, "'ve lost")).toBe(true);
    expect(isCorrect(e, 'lost')).toBe(false);
  });
});

describe('exercices par leçon', () => {
  it('present perfect : forme à taper, verbe en indice, trou net', () => {
    const e = ex('present-perfect', 'She has written three books.')!;
    expect(withBlank(e)).toBe('She ___ three books.');
    expect(e).toMatchObject({ answer: 'has written', hint: 'write' });
    expect(ex('present-perfect', 'She has never written a book.')).toBeNull(); // adverbe au milieu
  });

  it('present perfect ou prétérit : deux formes du même verbe', () => {
    const a = ex('perfect-vs-past', 'I saw him yesterday.')!;
    expect(withBlank(a)).toBe('I ___ him yesterday.');
    expect(a.answer).toBe('saw');
    expect(a.choices?.sort()).toEqual(['have seen', 'saw']);
    const b = ex('perfect-vs-past', 'Have you ever been to Rome? She has never eaten sushi.');
    expect(b).toBeNull(); // pas de forme nette
    const c = ex('perfect-vs-past', 'He has already left.');
    expect(c).toBeNull(); // adverbe entre les deux
  });

  it('for / since', () => {
    const e = ex('for-since', "I haven't slept for three days!")!;
    expect(withBlank(e)).toBe("I haven't slept ___ three days!");
    expect(e.choices?.sort()).toEqual(['for', 'since']);
  });

  it('plus-que-parfait', () => {
    expect(ex('past-perfect', 'For a moment, I thought he had gone mad.')).toMatchObject({ answer: 'had gone', hint: 'go' });
  });

  it('used to : « used to go » ou « was used to going »', () => {
    const e = ex('used-to', 'I used to play tennis when I was a student.')!;
    expect(e.answer).toBe('used to play');
    expect(e.choices?.sort()).toEqual(['used to play', 'was used to playing']);
  });

  it('conditionnels et propositions de temps : présent ou will, prétérit ou would', () => {
    const a = ex('first-conditional', 'If it rains, we will stay home.')!;
    expect(withBlank(a)).toBe('If it ___, we will stay home.');
    expect(a.choices?.sort()).toEqual(['rains', 'will rain']);
    const b = ex('second-conditional', 'If I had more time, I would travel.')!;
    expect(b.choices?.sort()).toEqual(['had', 'would have']);
    const c = ex('time-clauses', "I'll call them tomorrow when I come back.")!;
    expect(c.choices?.sort()).toEqual(['come', 'will come']);
  });

  it('passif', () => {
    expect(ex('passive', 'The bridge was built in 1890.')).toMatchObject({ answer: 'was built', hint: 'build' });
  });

  it('say / tell', () => {
    const e = ex('say-tell', 'I told them to send me another ticket.')!;
    expect(e.answer).toBe('told');
    expect(e.choices?.sort()).toEqual(['said', 'told']);
  });

  it('phrases écartées : trop longues, citations, sans traduction', () => {
    expect(ex('passive', `${'Very long sentence '.repeat(10)} was built.`)).toBeNull();
    expect(ex('passive', '"It was built," he said.')).toBeNull();
    expect(buildExercise('passive', { id: 1, en: 'The bridge was built in 1890.', fr: '' })).toBeNull();
  });
});

describe('cas relevés dans les banques générées', () => {
  const known = (w: string) => ['sign', 'signe', 'chang', 'change', 'die', 'dy', 'discuss', 'discus', 'us', 'use'].includes(w);

  it('bases : la règle passe avant la liste de mots (qui contient des mots étrangers)', () => {
    expect(['signed', 'changed', 'died', 'discussed', 'used'].map((w) => baseOf(w, known))).toEqual(['sign', 'change', 'die', 'discuss', 'use']);
    expect([baseOf('added'), baseOf('agreed'), baseOf('naked'), baseOf('need')]).toEqual(['add', 'agree', null, null]);
  });

  it("« don't », adverbes, contexte passé : pas d'exercice de subordonnée", () => {
    expect(ex('first-conditional', "You will miss the train if you don't hurry.")).toBeNull();
    expect(ex('time-clauses', 'I remember the night when I first saw the Milky Way.')).toBeNull();
    expect(ex('time-clauses', 'Tom was there for me when I needed someone.')).toBeNull();
  });

  it('present perfect : espace après le sujet contracté, pas de modal', () => {
    expect(ex('present-perfect', "I've drunk way too much coffee today.")).toMatchObject({ before: 'I ', answer: 'have drunk' });
    expect(ex('present-perfect', "We should've set off earlier.")).toBeNull();
    expect(ex('present-perfect', "I'd have won if I hadn't tripped.")).toBeNull();
  });

  it('used to : pas de « be used to », accord de « was / were », pas d’indice qui donne la réponse', () => {
    expect(ex('used-to', "I'm not used to hard work.")).toBeNull();
    const e = ex('used-to', 'They used to play on the beach.', 1)!;
    expect(e.hint).toBeUndefined();
    expect(e.choices).toContain('were used to playing');
  });

  it("perfect-vs-past : « had already gone » n'est pas un prétérit", () => {
    expect(ex('perfect-vs-past', 'She had already gone to bed when I called her yesterday.')).toBeNull();
  });
});
