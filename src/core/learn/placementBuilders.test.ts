import { describe, expect, it } from 'vitest';
import { buildPlacementExercise } from './placementBuilders';

// Liste de mots simulée : tout est connu sauf les formes que la vraie liste n'a pas (« lowe », « answerred »).
const known = (w: string) => !/^(?:lowe|answerred)$/.test(w);
const ex = (point: string, en: string, fr: string, id = 2) => buildPlacementExercise(point, { id, en, fr }, known);
const shown = (point: string, en: string, fr: string) => {
  const e = ex(point, en, fr);
  return e && `${e.before}[${e.answer}${e.hint ? ` (${e.hint})` : ''}${e.choices ? ` {${[...e.choices].sort().join('|')}}` : ''}]${e.after}`;
};

describe('questions du placement (A1, A2)', () => {
  it('be et was / were : trois propositions, le passé confirmé par la traduction', () => {
    expect(shown('be', 'I know where you are.', 'Je sais où tu es.')).toBe('I know where you [are {am|are|is}].');
    expect(shown('was-were', 'They were very tired.', 'Ils étaient très fatigués.')).toBe('They [were {are|was|were}] very tired.');
    expect(ex('was-were', 'They were very tired.', 'Ils sont très fatigués.')).toBeNull();
    expect(ex('be', 'If you are ready, we will go.', 'Si tu es prêt, nous irons.')).toBeNull();
  });

  it('pronoms et possessifs : la traduction donne le possesseur ; pas de pronom après than', () => {
    expect(shown('subject-object-pronouns', 'Please call me tomorrow.', 'Appelle-moi demain, stp.')).toBe('Please call [me {I|me|my}] tomorrow.');
    expect(ex('subject-object-pronouns', 'She is taller than me.', 'Elle est plus grande que moi.')).toBeNull();
    expect(shown('possessive-adjectives', 'My room is a mess.', 'Ma chambre est en désordre.')).toBe('[My {Me|Mine|My}] room is a mess.');
    expect(ex('possessive-adjectives', 'My room is next to your room.', 'Ma chambre est à côté de ta chambre.')).toBeNull();
  });

  it('articles, pluriels, démonstratifs', () => {
    expect(shown('articles', 'It must be a dream.', 'Ça doit être un rêve.')).toBe('It must be [a {a|an}] dream.');
    expect(ex('articles', 'He waited for an hour.', 'Il a attendu une heure.')).toBeNull();
    expect(shown('plural-forms', 'The children are asleep.', 'Les enfants dorment.')).toBe('The [children (child)] are asleep.');
    expect(shown('plural-forms', 'There are many cities in Japan.', 'Il y a beaucoup de villes au Japon.')).toBe('There are many [cities (city)] in Japan.');
    expect(ex('plural-forms', 'He tries to help.', 'Il essaie d’aider.')).toBeNull();
    expect(shown('this-that', 'Open these boxes, please.', 'Ouvre ces boîtes, s’il te plaît.')).toBe('Open [these {these|this}] boxes, please.');
    expect(ex('this-that', 'This can be true.', 'Ça peut être vrai.')).toBeNull();
  });

  it('présent simple et continu, à taper', () => {
    expect(shown('present-simple', 'She works in a bank.', 'Elle travaille dans une banque.')).toBe('She [works (work)] in a bank.');
    expect(ex('present-simple', 'She works tomorrow.', 'Elle travaille demain.')).toBeNull();
    expect(shown('present-continuous', 'I am reading a book.', 'Je suis en train de lire un livre.')).toBe('I [am reading (read)] a book.');
    expect(ex('present-continuous', 'I am reading a book.', 'Je lis un livre.')).toBeNull(); // « je lis » : I read conviendrait aussi
  });

  it('questions : do / does selon le sujet, mot interrogatif donné par la traduction', () => {
    expect(shown('do-questions', 'Does she speak French?', 'Parle-t-elle français ?')).toBe('[Does {Do|Does}] she speak French?');
    expect(shown('wh-questions', 'Where do you live?', 'Où habites-tu ?')).toMatch(/^\[Where \{.*Where.*\}\] do you live\?$/);
    expect(ex('wh-questions', 'How much is it?', 'Combien ça coûte ?')).toBeNull();
    expect(ex('wh-questions', 'Why do you ask where I live?', 'Pourquoi demandes-tu où j’habite ?')).toBeNull(); // deux mots interrogatifs
  });

  it('there is, can, impératif, prépositions de temps, adverbes de fréquence', () => {
    expect(shown('there-is', 'There is a little water in the glass.', 'Il y a un peu d’eau dans le verre.')).toBe('[There is {It has|There are|There is}] a little water in the glass.');
    expect(shown('can', 'I can swim very well.', 'Je sais très bien nager.')).toBe('I [can swim {can swim|can swimming|can to swim}] very well.');
    expect(shown('imperative', "Don't forget your keys.", "N'oublie pas tes clés.")).toBe("[Don't {Don't|No|Not}] forget your keys.");
    expect(shown('prepositions-time-place', 'Our house was built in 2013.', 'Notre maison a été construite en 2013.')).toBe('Our house was built [in {at|in|on}] 2013.');
    expect(ex('prepositions-time-place', 'I saw him at Monday.', 'Je l’ai vu lundi.')).toBeNull();
    expect(shown('frequency-adverbs', 'They never stop talking.', 'Ils ne s’arrêtent jamais de parler.')).toBe('They [never stop {never stop|stop never}] talking.');
  });

  it('prétérit : régulier, irrégulier, participe, négation ; la traduction au passé confirme', () => {
    expect(shown('past-simple-regular', 'I lived in Germany for three years.', "J'ai vécu trois ans en Allemagne.")).toBe('I [lived (live)] in Germany for three years.');
    expect(shown('past-simple-irregular', 'We went there for a week.', 'Nous y sommes allés une semaine.')).toBe('We [went (go)] there for a week.');
    expect(ex('past-simple-irregular', 'I put it on the table.', "Je l'ai mis sur la table.")).toBeNull(); // put : rien à trouver
    expect(shown('past-participle', 'I have written three letters.', "J'ai écrit trois lettres.")).toBe('I have [written (write)] three letters.');
    expect(ex('past-participle', 'What has become of him?', 'Qu’est-il devenu ?')).toBeNull();
    expect(shown('past-questions', "You didn't answer the phone.", "Tu n'as pas répondu au téléphone.")).toBe("You [didn't answer {didn't answer|didn't answered|don't answer}] the phone.");
    expect(shown('past-continuous', 'She was talking about you.', 'Elle était en train de parler de toi.')).toBe('She [was talking (talk)] about you.');
  });

  it('noms, comparatifs, génitif', () => {
    expect(shown('uncountables', 'Thanks for the advice.', 'Merci du conseil.')).toBe('Thanks for the [advice {advice|advices}].');
    expect(ex('uncountables', 'We got stuck in a traffic jam.', 'Nous étions coincés dans un embouteillage.')).toBeNull();
    expect(shown('countables', 'He lived abroad for many years.', 'Il a vécu à l’étranger pendant de nombreuses années.')).toBe('He lived abroad for [many {a lot|many|much}] years.');
    expect(ex('countables', 'How much will it cost?', 'Combien cela coûtera-t-il ?')).toBeNull();
    expect(shown('comparatives', 'The price was lower than I thought.', 'Le prix était plus bas que je ne pensais.')).toBe('The price was [lower (low)] than I thought.');
    expect(ex('comparatives', 'There were more people than I expected.', "Il y avait plus de monde que prévu.")).toBeNull();
    expect(shown('possessive-s', "Tom's friends tried to help.", 'Les amis de Tom ont essayé d’aider.')).toBe("[Tom's {Tom|Tom's|Toms}] friends tried to help.");
  });

  it('futur, obligation, conseil, adverbes de manière, verbe + -ing ou to', () => {
    expect(shown('going-to', "I'm going to stop smoking.", 'Je vais arrêter de fumer.')).toBe("I'm [going to stop {go to stop|going stop|going to stop}] smoking.");
    expect(shown('will', 'Tom will die if he does that.', 'Tom mourra s’il fait ça.')).toBe('Tom [will die {will die|will dying|will to die}] if he does that.');
    expect(shown('must-have-to', 'She has to stop smoking.', 'Il lui faut arrêter de fumer.')).toBe('She [has to {has to|have to|must to}] stop smoking.');
    expect(shown('should', 'You should stop smoking.', 'Tu devrais arrêter de fumer.')).toBe('You [should stop {should stop|should stopping|should to stop}] smoking.');
    expect(shown('adverbs-manner', 'The car has been acting strangely.', 'La voiture se comporte bizarrement.')).toBe('The car has been acting [strangely {strange|strangely}].');
    expect(ex('adverbs-manner', 'She looks lovely.', 'Elle est ravissante.')).toBeNull();
    expect(shown('verb-patterns', 'If he keeps drinking, he will be sick.', 'S’il continue à boire, il sera malade.')).toBe('If he keeps [drinking {drink|drinking|to drink}], he will be sick.');
    expect(shown('verb-patterns', 'I decided to stay home.', 'J’ai décidé de rester à la maison.')).toBe('I decided [to stay {stay|staying|to stay}] home.');
  });
});

describe('repères de la traduction', () => {
  it('« français », « jamais » ne sont pas des imparfaits ; « j’ai fait » est un passé', () => {
    expect(ex('do-questions', 'Do you speak French?', 'Parles-tu français ?')).not.toBeNull();
    expect(ex('past-simple-irregular', 'I made a cake.', "J'ai fait un gâteau.")).not.toBeNull();
  });
});
