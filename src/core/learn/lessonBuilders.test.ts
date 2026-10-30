import { describe, expect, it } from 'vitest';
import { buildLessonExercise } from './lessonBuilders';

let id = 1000;
/** Exercice affiché : [réponse {propositions}] dans la phrase. */
const shown = (lesson: string, en: string, fr: string) => {
  const ex = buildLessonExercise(lesson, { id: id++ * 2, en, fr });
  return ex && `${ex.before}[${ex.answer}${ex.choices ? ` {${ex.choices.join(' | ')}}` : ''}]${ex.after}`;
};

describe('discours rapporté', () => {
  it('concordance des temps quand la traduction recule aussi', () => {
    expect(shown('reported-statements', 'She said she was tired.', 'Elle a dit qu’elle était fatiguée.')).toBe('She said she [was {was | is}] tired.');
    expect(shown('reported-statements', 'He told me he would come.', 'Il m’a dit qu’il viendrait.')).toBe('He told me he [would {would | will}] come.');
    expect(shown('reported-statements', 'Tom said that he had lost his keys.', 'Tom a dit qu’il avait perdu ses clés.')).toBe('Tom said that he [had {had | has}] lost his keys.');
    expect(shown('reported-statements', 'She said she lived in Paris.', 'Elle a dit qu’elle habitait à Paris.')).toBe('She said she [lived {lived | lives}] in Paris.');
  });
  it('écarte un présent voulu, un verbe de parole au présent', () => {
    expect(shown('reported-statements', 'She said she is tired.', 'Elle a dit qu’elle est fatiguée.')).toBeNull();
    expect(shown('reported-statements', 'She said she was tired.', 'Elle a dit qu’elle est fatiguée.')).toBeNull();
    expect(shown('reported-statements', 'He says he was tired.', 'Il dit qu’il était fatigué.')).toBeNull();
  });
});

describe('questions sur le sujet', () => {
  it('sujet sans did, complément avec did', () => {
    expect(shown('subject-questions', 'Who called you?', 'Qui t’a appelé ?')).toBe('Who [called {called | did call}] you?');
    expect(shown('subject-questions', 'What happened?', 'Que s’est-il passé ?')).toBe('What [happened {happened | did happen}]?');
    expect(shown('subject-questions', 'Who wants some tea?', 'Qui veut du thé ?')).toBe('Who [wants {wants | does want}] some tea?');
    expect(shown('subject-questions', 'Who did you see?', 'Qui as-tu vu ?')).toBe('Who [did you see {did you see | you saw}]?');
  });
  it('écarte be, les modaux et les affirmations', () => {
    expect(shown('subject-questions', 'Who is that man?', 'Qui est cet homme ?')).toBeNull();
    expect(shown('subject-questions', 'Who can help me?', 'Qui peut m’aider ?')).toBeNull();
    expect(shown('subject-questions', 'Who called you.', 'Qui t’a appelé.')).toBeNull();
  });
});

describe('but : to', () => {
  it('to + base après un verbe d’action, « pour » dans la traduction', () => {
    expect(shown('purpose-to', 'I went to the shop to buy some milk.', 'Je suis allé au magasin pour acheter du lait.')).toBe(
      'I went to the shop [to buy {to buy | for buy | for to buy}] some milk.',
    );
    expect(shown('purpose-to', 'She called to ask about the meeting.', 'Elle a appelé pour demander des nouvelles de la réunion.')).toBe(
      'She called [to ask {to ask | for ask | for to ask}] about the meeting.',
    );
  });
  it('écarte to complément (want to, try to) et l’absence de « pour »', () => {
    expect(shown('purpose-to', 'I went home because I wanted to sleep.', 'Je suis rentré pour dormir.')).toBeNull();
    expect(shown('purpose-to', 'I went out to walk the dog.', 'Je suis sorti promener le chien.')).toBeNull();
    expect(shown('purpose-to', "We've come too far to turn back now.", 'Nous sommes allés trop loin pour faire demi-tour maintenant.')).toBeNull();
    expect(shown('purpose-to', 'It took four hours to get the truck out.', 'Ça a pris quatre heures pour sortir le camion.')).toBeNull();
  });
});

describe('préposition + -ing', () => {
  it('before / after / without + -ing, et après un adjectif à préposition', () => {
    expect(shown('preposition-ing', 'Wash your hands before eating.', 'Lave-toi les mains avant de manger.')).toBe('Wash your hands before [eating {eating | to eat | eat}].');
    expect(shown('preposition-ing', 'He left without saying goodbye.', 'Il est parti sans dire au revoir.')).toBe('He left without [saying {saying | to say | say}] goodbye.');
    expect(shown('preposition-ing', 'She is good at drawing.', 'Elle est douée pour le dessin.')).toBe('She is good at [drawing {drawing | to draw | draw}].');
  });
  it('écarte un nom en -ing et un in / at sans repère', () => {
    expect(shown('preposition-ing', 'I read it in the morning.', 'Je l’ai lu le matin.')).toBeNull();
    expect(shown('preposition-ing', 'They are in training.', 'Ils sont en formation.')).toBeNull();
  });
});

describe('make / let', () => {
  it('base sans to ; le verbe quand la traduction dit faire ou laisser', () => {
    const a = buildLessonExercise('make-let', { id: 2, en: 'She made me cry.', fr: 'Elle m’a fait pleurer.' });
    const b = buildLessonExercise('make-let', { id: 3, en: 'She made me cry.', fr: 'Elle m’a fait pleurer.' });
    const all = [a, b].map((ex) => `${ex?.answer} {${ex?.choices?.join(' | ')}}`).sort();
    expect(all).toEqual(['cry {cry | to cry | crying}', 'made {made | let}']);
    expect(String(shown('make-let', 'Let me go home now, please.', 'Laisse-moi rentrer maintenant, s’il te plaît.'))).toMatch(/\[(?:go \{go \| to go \| going\}|Let \{Let \| Make\})\]/);
  });
  it('écarte let’s et un adjectif après le complément', () => {
    expect(shown('make-let', "Let's go home.", 'Rentrons.')).toBeNull();
    expect(shown('make-let', 'You make me happy.', 'Tu me rends heureux.')).toBeNull();
  });
});

describe('phrasal verbs', () => {
  it('pronom entre le verbe et la particule', () => {
    expect(shown('phrasal-verbs', 'Please turn it off.', 'Éteins-le, s’il te plaît.')).toBe('Please [turn it off {turn it off | turn off it}].');
    expect(shown('phrasal-verbs', 'I picked them up at the station.', 'Je les ai pris à la gare.')).toBe('I [picked them up {picked them up | picked up them}] at the station.');
  });
  it('écarte une particule suivie d’un complément (préposition)', () => {
    expect(shown('phrasal-verbs', 'Put it on the table.', 'Pose-le sur la table.')).toBeNull();
  });
});
