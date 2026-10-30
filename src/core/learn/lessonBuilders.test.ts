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

describe('B2', () => {
  it('conditionnels : would ou would have selon la traduction (mixtes compris)', () => {
    expect(shown('mixed-conditionals', 'If I had studied harder, I would be a doctor now.', 'Si j’avais étudié davantage, je serais médecin aujourd’hui.')).toBe(
      'If I had studied harder, I [would be {would be | would have been}] a doctor now.',
    );
    expect(shown('mixed-conditionals', 'If you had asked me, I would have helped you.', 'Si tu me l’avais demandé, je t’aurais aidé.')).toBe(
      'If you had asked me, I [would have helped {would have helped | would help}] you.',
    );
    expect(shown('mixed-conditionals', 'I would be happy to help.', 'Je serais ravi d’aider.')).toBeNull();
  });
  it('passif avec modal, have something done', () => {
    expect(shown('passive-modals', 'This work must be finished today.', 'Ce travail doit être fini aujourd’hui.')).toBe('This work must [be finished {be finished | been finished | finish}] today.');
    expect(shown('have-something-done', 'I had my car repaired last week.', 'J’ai fait réparer ma voiture la semaine dernière.')).toBe(
      'I had my car [repaired {repaired | repair | repairing}] last week.',
    );
    expect(shown('have-something-done', 'She has a son named Tom.', 'Elle a un fils qui s’appelle Tom.')).toBeNull();
    expect(shown('have-something-done', 'How much has the plan been changed?', 'Dans quelle mesure le plan a-t-il changé ?')).toBeNull();
  });
  it('relatives explicatives : who, which, whose, jamais that', () => {
    expect(shown('relatives-non-defining', 'My brother, who lives in Paris, is a chef.', 'Mon frère, qui vit à Paris, est chef.')).toBe(
      'My brother, [who {who | which | that}] lives in Paris, is a chef.',
    );
    expect(shown('relatives-non-defining', 'The car, which was very old, broke down.', 'La voiture, qui était très vieille, est tombée en panne.')).toBe(
      'The car, [which {which | who | that}] was very old, broke down.',
    );
    expect(shown('relatives-non-defining', 'If you could take one book, which one would you choose?', 'Si tu pouvais prendre un livre, lequel choisirais-tu ?')).toBeNull();
  });
  it('déduction au passé : la traduction donne la nuance', () => {
    expect(shown('deduction-past', 'He must have missed the train.', 'Il a dû rater le train.')).toBe("He [must have {must have | can't have | might have}] missed the train.");
    expect(shown('deduction-past', 'She might have forgotten.', 'Elle a peut-être oublié.')).toBe("She [might have {might have | must have | can't have}] forgotten.");
    expect(shown('deduction-past', 'He must have missed the train.', 'Il a peut-être dû rater le train.')).toBeNull();
  });
  it('questions et ordres rapportés', () => {
    expect(shown('reported-questions', 'She asked me where I lived.', 'Elle m’a demandé où j’habitais.')).toBe('She asked me where [I lived {I lived | did I live}].');
    expect(shown('reported-questions', 'He asked if she was ready.', 'Il a demandé si elle était prête.')).toBe('He asked if [she was {she was | was she}] ready.');
    expect(shown('reported-questions', 'The doctor told me to rest.', 'Le médecin m’a dit de me reposer.')).toBe('The doctor told me [to rest {to rest | rest | resting}].');
  });
  it('futur continu, futur antérieur, be used to', () => {
    expect(shown('future-continuous', 'This time tomorrow I will be working at home.', 'Demain à la même heure, je travaillerai chez moi.')).toBe(
      'This time tomorrow I will [be working {be working | working | be work}] at home.',
    );
    expect(shown('future-perfect', 'I will have finished the report by six.', 'J’aurai fini le rapport à six heures.')).toBe(
      'I will [have finished {have finished | has finished | have finish}] the report by six.',
    );
    expect(shown('be-used-to', 'I am used to getting up early.', 'J’ai l’habitude de me lever tôt.')).toBe('I am used to [getting {getting | get | to get}] up early.');
  });
});

describe('C1 et A2', () => {
  it('inversion après un adverbe négatif', () => {
    expect(shown('inversion', 'Never have I seen such a beautiful sunset.', "Je n'ai jamais vu un si beau coucher de soleil.")).toBe(
      'Never [have I {have I | I have}] seen such a beautiful sunset.',
    );
    expect(shown('inversion', 'Rarely do we see such talent.', 'Nous voyons rarement un tel talent.')).toBe('Rarely [do we see {do we see | we see}] such talent.');
    expect(shown('inversion', 'Not only did he break the window, he also lied.', 'Non seulement il a cassé la vitre, mais il a aussi menti.')).toBe(
      'Not only [did he break {did he break | he broke}] the window, he also lied.',
    );
  });
  it('phrase clivée, proposition participiale', () => {
    expect(shown('cleft-sentences', 'What I need is a long holiday.', "Ce dont j'ai besoin, c'est de longues vacances.")).toBe('[What {What | That | Which}] I need is a long holiday.');
    expect(shown('participle-clauses', 'Having finished her work, she went home.', 'Après avoir fini son travail, elle est rentrée.')).toBe(
      '[Having finished {Having finished | Have finished | Had finished}] her work, she went home.',
    );
    expect(shown('participle-clauses', 'Built in 1890, the house needs a lot of work.', 'Construite en 1890, la maison demande beaucoup de travaux.')).toBe(
      '[Built {Built | Building | Build}] in 1890, the house needs a lot of work.',
    );
  });
  it('subjonctif, do d’insistance', () => {
    expect(shown('subjunctive', 'I suggest that he be told the truth.', 'Je suggère qu’on lui dise la vérité.')).toBe('I suggest that he [be {be | is}] told the truth.');
    expect(shown('subjunctive', 'She insisted that Tom leave at once.', 'Elle a insisté pour que Tom parte immédiatement.')).toBe('She insisted that Tom [leave {leave | leaves}] at once.');
    expect(shown('emphatic-do', 'I did call you, but you were out.', "Je t'ai bien appelé, mais tu étais sorti.")).toBe('I [did call {did call | did called}] you, but you were out.');
    expect(shown('emphatic-do', 'Do sit down, please.', 'Asseyez-vous donc, je vous en prie.')).toBe('[Do sit {Do sit | Do sitting | Do to sit}] down, please.');
    expect(shown('emphatic-do', 'Where do you live?', 'Où habites-tu ?')).toBeNull();
  });
  it('adjectif avant le nom et invariable', () => {
    expect(shown('adjectives', 'She bought a beautiful dress for the party.', 'Elle a acheté une belle robe pour la fête.')).toBe(
      'She bought a [beautiful dress {beautiful dress | dress beautiful}] for the party.',
    );
    expect(shown('adjectives', 'We have many different ideas.', 'Nous avons beaucoup d’idées différentes.')).toBe(
      'We have many [different ideas {different ideas | ideas different | differents ideas}].',
    );
    expect(shown('adjectives', 'He is a student.', 'Il est étudiant.')).toBeNull();
    expect(shown('adjectives', 'Had you come a little earlier, you could have met her.', 'Si vous étiez arrivé un peu plus tôt, vous l’auriez vue.')).toBeNull();
    expect(shown('adjectives', 'I have some good news for you.', 'J’ai de bonnes nouvelles pour toi.')).toBe('I have some [good news {good news | news good}] for you.');
  });
  it('présent simple ou continu, selon le repère', () => {
    expect(shown('simple-vs-continuous', 'Be quiet, the baby is sleeping now.', 'Silence, le bébé dort.')).toBeNull(); // sujet nom : pas couvert
    expect(shown('simple-vs-continuous', 'Look, it is raining again.', 'Regarde, il pleut encore.')).toBe('Look, it [is raining {is raining | rains}] again.');
    expect(shown('simple-vs-continuous', 'She usually walks to work.', 'Elle va généralement au travail à pied.')).toBe('She usually [walks {walks | is walking}] to work.');
    expect(shown('simple-vs-continuous', 'I usually walked to work.', 'J’allais à pied au travail.')).toBeNull();
    expect(shown('simple-vs-continuous', 'How often do you usually take a bath?', 'Tu prends un bain combien de fois ?')).toBeNull();
  });
});

describe('C2', () => {
  it('inversion conditionnelle', () => {
    expect(shown('conditional-inversion', 'Had I known, I would have come earlier.', 'Si j’avais su, je serais venu plus tôt.')).toBe(
      '[Had I {Had I | If had I | Have I}] known, I would have come earlier.',
    );
    expect(shown('conditional-inversion', 'Should you need anything, call me.', 'Si tu as besoin de quoi que ce soit, appelle-moi.')).toBe(
      '[Should you {Should you | If should you | Would you}] need anything, call me.',
    );
    expect(shown('conditional-inversion', 'Had you seen it, you know.', 'Tu l’avais vu, tu sais.')).toBeNull();
  });
  it('passif impersonnel', () => {
    expect(shown('impersonal-passive', 'He is said to have left the country.', 'Il aurait quitté le pays.')).toBe(
      'He is said [to have left {to have left | to leave | having left}] the country.',
    );
    expect(shown('impersonal-passive', 'She is believed to be very rich.', 'On la dit très riche.')).toBe('She is believed [to be {to be | to have been | being}] very rich.');
  });
  it('passé irréel', () => {
    expect(shown('unreal-past', "It's time we went home.", 'Il est temps que nous rentrions.')).toBe("It's time we [went {went | go}] home.");
    expect(shown('unreal-past', "I'd rather you didn't smoke here.", 'Je préférerais que tu ne fumes pas ici.')).toBe(
      "I'd rather you [didn't {didn't | don't | won't}] smoke here.",
    );
    expect(shown('unreal-past', "It's time to go home.", 'Il est temps de rentrer.')).toBeNull();
  });
  it('modaux au passé : la traduction donne la nuance', () => {
    expect(shown('past-modals', 'You should have told me.', 'Tu aurais dû me le dire.')).toBe("You [should have {should have | could have | needn't have}] told me.");
    expect(shown('past-modals', 'You could have been killed.', 'Tu aurais pu être tué.')).toBe("You [could have {could have | should have | needn't have}] been killed.");
    expect(shown('past-modals', "You needn't have bought it.", "Tu n'avais pas besoin de l'acheter.")).toBe(
      "You [needn't have {needn't have | should have | could have}] bought it.",
    );
  });
  it('whatever, whoever, wherever, whenever', () => {
    expect(shown('wh-ever', "Whatever you do, don't panic.", 'Quoi que tu fasses, ne panique pas.')).toBe(
      "[Whatever {Whatever | Whoever | Wherever | Whenever}] you do, don't panic.",
    );
    expect(shown('wh-ever', 'I will follow you wherever you go.', 'Je te suivrai où que tu ailles.')).toBe(
      'I will follow you [wherever {whatever | whoever | wherever | whenever}] you go.',
    );
  });
});
