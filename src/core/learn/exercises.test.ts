import { describe, expect, it } from 'vitest';
import {
  baseOf,
  baseOfIng,
  buildExercise,
  ingOf,
  isCorrect,
  normalizeAnswer,
  pastOf,
  participleOf,
  presentOf,
  withBlank,
  type SourceSentence,
} from './exercises';

const s = (en: string, id = 1, fr = 'traduction'): SourceSentence => ({ id, en, fr });
const ex = (lesson: string, en: string, id = 1, fr?: string) => buildExercise(lesson, s(en, id, fr));

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
    expect(ex('past-perfect', 'For a moment, I thought he had gone mad.', 1, "Un instant, j'ai cru qu'il était devenu fou.")).toMatchObject({
      answer: 'had gone',
      hint: 'go',
    });
    // « I had shut up if I were you » (pour I'd shut up) : la traduction n'a pas de plus-que-parfait.
    expect(ex('past-perfect', 'I had shut up if I were you.', 1, 'Je la fermerais si j’étais toi.')).toBeNull();
  });

  it('used to : « used to go » ou « was used to going »', () => {
    const e = ex('used-to', 'I used to play tennis when I was a student.')!;
    expect(e.answer).toBe('used to play');
    expect(e.choices?.sort()).toEqual(['used to play', 'was used to playing']);
  });

  it('conditionnels et propositions de temps : présent ou will, prétérit ou would', () => {
    // Selon la phrase (son identifiant), le trou est dans la subordonnée ou dans la principale.
    const a = ex('first-conditional', 'If it rains, we will stay home.', 2)!;
    expect(withBlank(a)).toBe('If it ___, we will stay home.');
    expect(a).toMatchObject({ form: 'present' });
    expect(a.choices?.sort()).toEqual(['rains', 'will rain']);
    const fr = "Si j'avais plus de temps, je voyagerais.";
    const b = ex('second-conditional', 'If I had more time, I would travel.', 2, fr)!;
    expect(b.choices?.sort()).toEqual(['had', 'would have']);
    const c = ex('time-clauses', "I'll call them tomorrow when I come back.", 2)!;
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
    // Seule la principale fait un exercice : « don » n'est pas un verbe.
    expect(ex('first-conditional', "You will miss the train if you don't hurry.", 2)).toMatchObject({ answer: 'will miss', form: 'will' });
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

describe('équilibre des réponses : will, would, prétérit ne sont pas toujours faux (ou toujours justes)', () => {
  it('trou dans la principale : will + base contre le présent, would + base contre le prétérit', () => {
    const a = ex('first-conditional', "If it rains, we'll stay home.", 1)!;
    expect(withBlank(a)).toBe('If it rains, we ___ home.');
    expect(a).toMatchObject({ answer: 'will stay', form: 'will', hint: 'stay' });
    expect(a.choices?.sort()).toEqual(['stay', 'will stay']);
    expect(isCorrect(a, 'will stay')).toBe(true);
    expect(ex('first-conditional', 'If you ask him, Tom will help you.', 1)!.choices).toContain('helps');
    expect(ex('first-conditional', 'The children will wake up if you make noise.', 1)!.choices).toContain('wake');
    const b = ex('second-conditional', 'If I had a dog, I would call it Rex.', 1, "Si j'avais un chien, je l'appellerais Rex.")!;
    expect(b).toMatchObject({ answer: 'would call', form: 'would' });
    expect(b.choices?.sort()).toEqual(['called', 'would call']);
  });

  it('pas de 3e conditionnel ni de préposition dans la principale', () => {
    expect(ex('second-conditional', 'If I had known it, I would have told you.', 1, "Si je l'avais su, je vous l'aurais dit.")?.answer).not.toBe('would have');
    expect(ex('time-clauses', 'You will feel better after a bath.', 1)).toBeNull();
  });

  it('2e conditionnel : la traduction doit être au conditionnel', () => {
    expect(ex('second-conditional', 'If I won, I would buy it.', 1, "Si je gagnais, je l'achèterai.")).toBeNull();
    expect(ex('second-conditional', 'If I won, I would buy it.', 1, "Si je gagnais, je l'achèterais.")).not.toBeNull();
  });

  it('propositions de temps : principale au futur ou à l’impératif, pas de vérité générale', () => {
    expect(ex('time-clauses', 'When I kiss you, I forget the world.', 2)).toBeNull();
    expect(ex('time-clauses', 'We close the windows when it rains.', 2)).toBeNull();
    expect(ex('time-clauses', 'Phone me when you get there.', 2)).toMatchObject({ answer: 'get', form: 'present' });
    expect(ex('time-clauses', 'When you see him, tell him to call me.', 2)).toMatchObject({ answer: 'see' });
    expect(ex('time-clauses', "When I get my first salary, I'll buy a car.", 1)).toMatchObject({ answer: 'will buy', form: 'will' });
  });

  it('les cas où will est juste après when : question, question indirecte', () => {
    const q = ex('time-clauses', 'When will you arrive?', 1)!;
    expect(q).toMatchObject({ before: 'When ', answer: 'will you arrive', after: '?', form: 'will' });
    expect(q.choices?.sort()).toEqual(['will you arrive', 'you arrive']);
    const i = ex('time-clauses', "I don't know when he'll arrive.", 1, 'Je ne sais pas quand il arrivera.')!;
    expect(i).toMatchObject({ before: "I don't know when he ", answer: 'will arrive', after: '.' });
    expect(i.choices?.sort()).toEqual(['arrives', 'will arrive']);
    // Sans futur dans la traduction, la question indirecte n'est pas sûre.
    expect(ex('time-clauses', "I don't know when he'll arrive.", 1, 'Je ne sais pas.')).toBeNull();
  });

  it('used to contre be used to + -ing et contre le prétérit daté', () => {
    expect(ex('used-to', 'I used to often go there.', 1)).toMatchObject({
      answer: 'used to often go',
      choices: expect.arrayContaining(['was used to often going']),
    });
    const b = ex('used-to', "I'm used to working at night.", 1)!;
    expect(b).toMatchObject({ before: "I'm ", answer: 'used to working', form: 'be-used-to' });
    expect(b.choices?.sort()).toEqual(['used to work', 'used to working']);
    const c = ex('used-to', 'I went to Rome last year.', 1)!;
    expect(c).toMatchObject({ answer: 'went', form: 'past' });
    expect(c.choices?.sort()).toEqual(['used to go', 'went']);
    expect(ex('used-to', 'We used to live in the city.', 1)).toMatchObject({ answer: 'used to live' });
    expect(ex('used-to', 'I usually went there every summer last year.', 1)).toBeNull(); // habitude : pas un prétérit « daté »
  });

  it('distracteurs bien écrits : consonne doublée', () => {
    const known = (w: string) => ['committed', 'stopped', 'visited'].includes(w);
    expect([pastOf('stop'), pastOf('commit', known), pastOf('visit', known), pastOf('open'), pastOf('play')]).toEqual([
      'stopped',
      'committed',
      'visited',
      'opened',
      'played',
    ]);
    expect(participleOf('stop')).toBe('stopped');
    expect(ex('perfect-vs-past', 'He stopped smoking two years ago.', 1)!.choices).toContain('has stopped');
    expect([presentOf('go', 'he'), presentOf('be', 'I'), presentOf('be', 'they'), presentOf('study', 'Tom'), presentOf('watch', 'it')]).toEqual([
      'goes',
      'am',
      'are',
      'studies',
      'watches',
    ]);
    expect([baseOfIng('working'), baseOfIng('hoping'), baseOfIng('getting'), baseOfIng('being'), baseOfIng('dying')]).toEqual([
      'work',
      'hope',
      'get',
      'be',
      'die',
    ]);
  });

  it('passif : une action subie, pas un état', () => {
    expect(ex('passive', 'We were hurt.')).toBeNull();
    expect(ex('passive', 'Everything is closed.')).toBeNull();
    expect(ex('passive', 'Ziri is shocked.')).toBeNull();
    expect(ex('passive', 'This house is made of wood.')).toBeNull();
    expect(ex('passive', 'The road was closed by the police.')).toMatchObject({ answer: 'was closed' });
  });

  it('plus-que-parfait : après after / before + sujet, le prétérit est juste aussi', () => {
    const e = ex('past-perfect', 'He had lit the torch before he entered the cave.', 1, "Il avait allumé la torche avant d'entrer dans la grotte.")!;
    expect(e.accept).toEqual(['lit']);
    expect([isCorrect(e, 'had lit'), isCorrect(e, "'d lit"), isCorrect(e, 'lit'), isCorrect(e, 'lighted')]).toEqual([true, true, true, false]);
    const f = ex('past-perfect', 'I had met him once before.', 1, "Je l'avais déjà rencontré une fois.")!;
    expect(f.accept).toBeUndefined(); // « before » adverbe : le plus-que-parfait reste nécessaire
  });
});
