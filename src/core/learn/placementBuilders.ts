import {
  baseOf,
  baseOfIng,
  baseOfPresent,
  ingOf,
  isAdjective,
  isIrregularBase,
  pastForms,
  pastOf,
  participleOf,
  plausibleBase,
  presentOf,
  usable,
  type Builder,
  type Candidate,
  type Exercise,
  type Known,
  type SourceSentence,
} from './exercises';

/**
 * Questions du placement pour les points A1 et A2 qui n'ont pas de leçon (étape 2) : mêmes phrases Tatoeba traduites,
 * mêmes règles de découpage que les exercices des leçons. Chaque générateur ne garde que les phrases où la réponse est
 * certaine : la traduction française tranche (où / quand, passé / présent), ou les autres propositions sont
 * sûrement fausses (« can to swim », « advices », « didn't went »). Une forme à taper (verbe en indice) prouve plus
 * qu'un choix : elle est préférée quand c'est possible.
 */

const SUBJECTS = '(?:I|you|he|she|it|we|they|You|He|She|It|We|They)';
/** Sujet suivi d'un mot : « She | works ». */
const SUBJECT_WORD = new RegExp(`(?:^|[\\s,])(${SUBJECTS})\\s+([a-z]+)\\b`, 'g');

/** Majuscule quand le trou ouvre la phrase. */
const cap = (w: string, atStart: boolean) => (atStart ? w.charAt(0).toUpperCase() + w.slice(1) : w);
/** Une seule occurrence d'un motif dans la phrase (sinon le trou serait ambigu). */
function only(re: RegExp, text: string): RegExpExecArray | null {
  const all = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))];
  return all.length === 1 ? (all[0] as RegExpExecArray) : null;
}
/** Trou sur `span` (position `at`), réponse et propositions. */
function blank(s: SourceSentence, at: number, span: string, answer: string, rest: Partial<Candidate>): Candidate {
  return { before: s.en.slice(0, at), after: s.en.slice(at + span.length), answer, ...rest };
}

/* ------------------------------------------------- repères de la traduction --- */

/** Passé dans la traduction : passé composé, imparfait, passé simple (voir `frPast`). */
const FR_PAST_FORMS =
  /\b(?:ai|as|a|avons|avez|ont|suis|es|est|sommes|êtes|sont)\s+(?:(?:pas|jamais|déjà|bien|toujours|tout|beaucoup|vraiment|trop)\s+)?[a-zàâçéèêëîïôûù]+(?:é|ée|és|ées|i|is|ie|ies|it|u|ue|us|ues|ert|erte|ort|eint|aint)\b|\b[a-zàâçéèêëîïôûù]{2,}(?:ais|ait|aient|âmes|âtes|èrent|irent|urent)\b/i;
/** Mots en -ais / -ait qui ne sont pas des imparfaits (français, jamais, mais, lait…). */
const FR_NOT_IMPERFECT =
  /(?<![a-zà-ÿ])(?:français|française|anglais|anglaise|japonais|japonaise|irlandais|écossais|portugais|jamais|mais|désormais|frais|palais|mauvais|épais|marais|relais|lait|souhait|portrait|parfait|trait|bienfait|attrait|extrait|laid|vrai|essai|délai|balai|quai|gai|mai)(?![a-zà-ÿ])/gi;
const FR_PAST = { test: (fr: string) => FR_PAST_FORMS.test(fr.replace(FR_NOT_IMPERFECT, ' ')) };
const FR_FUTURE_OR_COND = /\b[a-zàâçéèêëîïôûù]{2,}r(?:ai|as|a|ons|ez|ont|ais|ait|ions|iez|aient)\b|\b(?:vais|vas|va|allons|allez|vont)\s+[a-zàâçéèêëîïôûù]+(?:er|ir|re)\b/i;
/** Repères qui changent le temps attendu : la phrase ne teste plus seulement le présent. */
const EN_NOT_PRESENT = /\b(?:will|would|'ll|'d|yesterday|ago|tomorrow|last|next|tonight|soon|when|if|since|already|yet|ever|never)\b/i;

/* ------------------------------------------------------------------- A1 --- */

/** be au présent : am / is / are après un pronom sujet (3 propositions). */
const be: Builder = (s) => {
  const m = only(new RegExp(`(?:^|[\\s,])(${SUBJECTS})\\s+(am|is|are)\\b`), s.en);
  if (!m) return [];
  const verb = m[2];
  const at = m.index + m[0].length - verb.length;
  if (/\b(?:was|were|been|be)\b/i.test(s.en) || EN_NOT_PRESENT.test(s.en)) return [];
  return [blank(s, at, verb, verb, { choices: ['am', 'is', 'are'], form: verb })];
};

/** be au passé : was / were, la traduction au passé exclut am / is / are. */
const FR_BE_PAST = /(?<![a-zà-ÿ])(?:étai[st]|était|étions|étiez|étaient|ai été|as été|a été|avons été|avez été|ont été|fus|fut|furent)(?![a-zà-ÿ])/i;
const wasWere: Builder = (s) => {
  const m = only(new RegExp(`(?:^|[\\s,])(${SUBJECTS})\\s+(was|were)\\b`), s.en);
  if (!m || !FR_BE_PAST.test(s.fr) || /\b(?:if|wish|as though|as if)\b/i.test(s.en)) return [];
  const verb = m[2];
  const at = m.index + m[0].length - verb.length;
  const present = presentOf('be', m[1]);
  return [blank(s, at, verb, verb, { choices: ['was', 'were', present], form: verb })];
};

/** Pronom complément en fin de groupe (après le verbe ou une préposition) : me / I / my. */
const OBJECT_TRIO: Record<string, [string, string]> = { me: ['I', 'my'], him: ['he', 'his'], us: ['we', 'our'], them: ['they', 'their'] };
const objectPronouns: Builder = (s) => {
  const m = only(/\b(me|him|us|them)\b(?=\s*(?:[.,!?]|$|\s+(?:to|with|for|about|at|in|on|from|and|now|today|again|too|tomorrow|yesterday|later)\b))/, s.en);
  if (!m) return [];
  const before = s.en.slice(0, m.index).trim().split(/\s+/).at(-1)?.toLowerCase() ?? '';
  // Après « than » ou « as », le pronom sujet se dit aussi (taller than I) ; « let us » est une tournure.
  if (!before || /^(?:than|as|let|like|but|and|or)$/.test(before)) return [];
  const [subject, possessive] = OBJECT_TRIO[m[1]];
  return [blank(s, m.index, m[1], m[1], { choices: [m[1], subject, possessive], form: m[1] })];
};

/** Adjectif possessif devant un nom : la traduction donne le possesseur (mon, notre, leur). */
const POSSESSIVE: Record<string, { fr: RegExp; others: [string, string] }> = {
  my: { fr: /\b(?:mon|ma|mes)\b/i, others: ['me', 'mine'] },
  our: { fr: /\b(?:notre|nos)\b/i, others: ['us', 'ours'] },
  their: { fr: /\b(?:leur|leurs)\b/i, others: ['them', 'theirs'] },
};
const possessives: Builder = (s) => {
  const m = only(/(?:^|\s)(My|my|Our|our|Their|their)\s+(?=[a-z]{3,}\b)/, s.en);
  if (!m) return [];
  const word = m[1].toLowerCase();
  const p = POSSESSIVE[word];
  // Un seul possessif dans la phrase et dans la traduction : le possesseur est sans ambiguïté.
  if (!p.fr.test(s.fr) || /\b(?:my|our|their|your|his|her|its)\b/gi.test(s.en.replace(m[1], '')) || (s.fr.match(/\b(?:mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\b/gi) ?? []).length !== 1)
    return [];
  const at = m.index + m[0].indexOf(m[1]);
  const start = at === 0;
  return [blank(s, at, m[1], cap(word, start), { choices: [word, ...p.others].map((c) => cap(c, start)), form: word })];
};

/** a / an devant un mot dont la prononciation est sûre (consonne simple, ou voyelle hors u et « one »). */
const articles: Builder = (s) => {
  const m = only(/(?:^|\s)(an?|An?)\s+([a-z]+)\b/, s.en);
  if (!m) return [];
  const article = m[1].toLowerCase();
  const next = m[2];
  const vowel = /^[aeio]/.test(next) && !/^(?:one|once|eu|ewe)/.test(next);
  const consonant = /^[bcdfgjklmnpqrstvwxyz]/.test(next) && !/^(?:hour|honest|honou?r|heir|x)/.test(next);
  if ((article === 'an' && !vowel) || (article === 'a' && !consonant)) return [];
  const at = m.index + m[0].indexOf(m[1]);
  const start = at === 0;
  return [blank(s, at, m[1], cap(article, start), { choices: ['a', 'an'].map((c) => cap(c, start)), form: article })];
};

/** Pluriel à taper, le singulier en indice : child → children, city → cities. */
const IRREGULAR_PLURAL: Record<string, string> = { children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth', mice: 'mouse' };
const PLURAL_CUE = /^(?:the|my|your|his|her|our|their|these|those|many|some|all|few|several|two|three|four|five|six|ten|other|most|both)$/i;
const plurals: Builder = (s, known) => {
  const m = only(/\b(children|men|women|feet|teeth|mice|[a-z]{3,}ies)\b(?!')/, s.en);
  if (!m) return [];
  const word = m[1];
  let singular = IRREGULAR_PLURAL[word];
  if (!singular) {
    // -ies : un nom seulement après un déterminant (« he tries » est un verbe).
    const prev = s.en.slice(0, m.index).trim().split(/\s+/).at(-1) ?? '';
    if (!PLURAL_CUE.test(prev)) return [];
    singular = `${word.slice(0, -3)}y`;
    if (known && !known(singular)) return [];
  }
  return [blank(s, m.index, word, word, { hint: singular, form: IRREGULAR_PLURAL[word] ? 'irregular' : 'ies' })];
};

/** this / these selon le nombre du nom qui suit (that / those : la distance ne se lit pas dans « ce »). */
const demonstratives: Builder = (s) => {
  const m = only(/(?:^|\s)(this|these|This|These)\s+([a-z]{3,})\b/, s.en);
  if (!m) return [];
  const word = m[1].toLowerCase();
  const noun = m[2];
  const plural = /[^s]s$/.test(noun) || noun in IRREGULAR_PLURAL || noun === 'people';
  // Un nom doit suivre (« This book »), pas un verbe : « This can't be » se dirait aussi « These can't be ».
  if (
    (word === 'these') !== plural ||
    /^(?:is|was|has|does|did|can|cannot|could|must|will|would|should|may|might|seems|looks|makes|means|sounds|one|time|morning|evening|afternoon|week|year|month|way|kind|sort)$/.test(noun) ||
    /(?:ed|ly)$/.test(noun) ||
    /^(?:now|again|here|there|too|very|and|but|with|for|into|from|about|all|yet|then|once|anymore|either|instead|before|after)$/.test(noun)
  )
    return [];
  const at = m.index + m[0].indexOf(m[1]);
  const start = at === 0;
  return [blank(s, at, m[1], cap(word, start), { choices: ['this', 'these'].map((c) => cap(c, start)), form: word })];
};

/** Présent simple à la 3e personne, à taper : he (work) → works. */
const presentSimple: Builder = (s, known) => {
  if (EN_NOT_PRESENT.test(s.en) || FR_PAST.test(s.fr) || FR_FUTURE_OR_COND.test(s.fr)) return [];
  const hits = [...s.en.matchAll(SUBJECT_WORD)].filter((h) => /^(?:he|she|it)$/i.test(h[1]));
  if (hits.length !== 1) return [];
  const h = hits[0];
  const form = h[2];
  if (!/[^s]s$|ies$|(?:sh|ch|x|o)es$/.test(form) || /^(?:is|has|does|was|always|also|just|thus|less|unless|yes)$/.test(form)) return [];
  const base = baseOfPresent(form);
  if (!plausibleBase(base, known) || presentOf(base, 'he') !== form) return [];
  const at = h.index + h[0].length - form.length;
  return [blank(s, at, form, form, { hint: base, form: 'third-person' })];
};

/** do / does en tête de question, selon le sujet. */
const doQuestions: Builder = (s) => {
  const m = /^(Do|Does)\s+(I|you|he|she|it|we|they|[A-Z][a-z]+)\s+[a-z]+/.exec(s.en);
  if (!m || !s.en.trim().endsWith('?') || FR_PAST.test(s.fr)) return [];
  const third = /^(?:he|she|it)$/i.test(m[2]) || (/^[A-Z][a-z]+$/.test(m[2]) && !/^(?:I|You|We|They)$/.test(m[2]));
  if ((m[1] === 'Does') !== third) return [];
  return [blank(s, 0, m[1], m[1], { choices: ['Do', 'Does'], form: m[1].toLowerCase() })];
};

/** Mot interrogatif, donné par la traduction (où, quand, pourquoi, qui, comment). */
const WH_FR: Record<string, RegExp> = {
  where: /(?:^|[^a-zà-ÿ])où(?![a-zà-ÿ])/i,
  when: /(?:^|[^a-zà-ÿ])quand(?![a-zà-ÿ])/i,
  why: /(?:^|[^a-zà-ÿ])pourquoi(?![a-zà-ÿ])/i,
  who: /(?:^|[^a-zà-ÿ])qui(?![a-zà-ÿ])/i,
  how: /(?:^|[^a-zà-ÿ])comment(?![a-zà-ÿ])/i,
};
const whQuestions: Builder = (s) => {
  const m = /^(Where|When|Why|Who|How)\s+(?!much|many|long|old|far|often|about)[a-z']+/.exec(s.en);
  if (!m || !s.en.trim().endsWith('?')) return [];
  const word = m[1].toLowerCase();
  // La traduction contient ce mot interrogatif, et aucun autre.
  const present = Object.entries(WH_FR).filter(([, re]) => re.test(s.fr)).map(([w]) => w);
  if (present.length !== 1 || present[0] !== word) return [];
  const others = Object.keys(WH_FR).filter((w) => w !== word);
  const pick = [others[s.id % others.length], others[(s.id + 1) % others.length], others[(s.id + 2) % others.length]];
  return [blank(s, 0, m[1], m[1], { choices: [word, ...pick].map((c) => cap(c, true)), form: word })];
};

/** There is / there are, contre le calque « it has » (il y a). */
const thereIs: Builder = (s) => {
  const m = only(/(?:^|\s)(There|there)\s+(is|are)\s+([a-z]+)/, s.en);
  if (!m || /\?/.test(s.en)) return [];
  const verb = m[2];
  const next = m[3];
  // Le nombre se lit sur le mot suivant : a / an / one / much → is ; deux, many, some + pluriel → are.
  const singular = /^(?:a|an|one|no|much|nothing|something|someone|somebody|nobody|little)$/.test(next);
  const plural = /^(?:many|two|three|four|five|several|lots|few|plenty)$/.test(next);
  if (!(verb === 'is' ? singular : plural)) return [];
  const at = m.index + m[0].indexOf(m[1]);
  const start = at === 0;
  const span = `${m[1]} ${verb}`;
  const answer = cap(`there ${verb}`, start);
  return [blank(s, at, span, answer, { choices: [`there ${verb}`, `there ${verb === 'is' ? 'are' : 'is'}`, 'it has'].map((c) => cap(c, start)), form: verb })];
};

/** have got / has got selon le sujet, contre « is got ». */
const haveGot: Builder = (s) => {
  const m = only(new RegExp(`(?:^|[\\s,])(${SUBJECTS})\\s+(have|has)\\s+got\\b`), s.en);
  if (!m || FR_PAST.test(s.fr)) return [];
  const third = /^(?:he|she|it)$/i.test(m[1]);
  if ((m[2] === 'has') !== third) return [];
  const span = `${m[2]} got`;
  const at = m.index + m[0].length - span.length;
  return [blank(s, at, span, span, { choices: ['has got', 'have got', 'is got'], form: m[2] })];
};

/** can + base verbale, contre « can to » et « can + -ing ». */
const can: Builder = (s, known) => {
  const m = only(/\b(can)\s+([a-z]+)\b/, s.en);
  if (!m) return [];
  const verb = m[2];
  if (verb === 'be' || !plausibleBase(verb, known) || /^(?:not|you|i|he|she|it|we|they)$/.test(verb)) return [];
  const span = `can ${verb}`;
  return [blank(s, m.index, span, span, { choices: [span, `can to ${verb}`, `can ${ingOf(verb)}`], form: 'can' })];
};

/** Impératif négatif : Don't + verbe, contre « Not » et « No ». */
const imperative: Builder = (s, known) => {
  const m = /^(Don't)\s+([a-z]+)\b/.exec(s.en.replace(/’/g, "'"));
  if (!m || s.en.trim().endsWith('?') || !plausibleBase(m[2], known)) return [];
  return [blank(s, 0, m[1], "Don't", { choices: ["Don't", 'Not', 'No'], form: 'negative' })];
};

/** in / on / at du temps : jour → on, mois et années → in, heure → at. */
const DAYS = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const timePrepositions: Builder = (s) => {
  const m = only(new RegExp(`\\b(in|on|at)\\s+(${DAYS}|${MONTHS}|(?:19|20)\\d\\d|\\d{1,2}(?::\\d\\d)?\\s*(?:o'clock|a\\.m\\.|p\\.m\\.)|noon|midnight)\\b`), s.en);
  if (!m) return [];
  const [prep, what] = [m[1], m[2]];
  const expected = new RegExp(`^(?:${DAYS})$`).test(what) ? 'on' : /^(?:\d{1,2}|noon|midnight)/.test(what) && !/^(?:19|20)\d\d$/.test(what) ? 'at' : 'in';
  if (prep !== expected) return [];
  return [blank(s, m.index, prep, prep, { choices: ['in', 'on', 'at'], form: prep })];
};

/** Place de l'adverbe de fréquence : devant le verbe (I always get up), après be. */
const FREQUENCY = 'always|usually|often|sometimes|rarely|seldom|never';
const frequencyAdverbs: Builder = (s, known) => {
  const m = only(new RegExp(`(?:^|[\\s,])(?:${SUBJECTS})\\s+(${FREQUENCY})\\s+([a-z]+)\\b`), s.en);
  if (!m) return [];
  const [adverb, verb] = [m[1], m[2]];
  // Verbe au présent (base ou 3e personne), pas be ni un auxiliaire : « always is » serait aussi faux, mais autrement.
  if (/^(?:is|are|am|was|were|be|do|does|did|have|has|had|can|will|would|should|must|could)$/.test(verb)) return [];
  const base = verb.endsWith('s') ? baseOfPresent(verb) : verb;
  if (!plausibleBase(base, known)) return [];
  const span = `${adverb} ${verb}`;
  const at = m.index + m[0].length - span.length;
  return [blank(s, at, span, span, { choices: [span, `${verb} ${adverb}`], form: 'before-verb' })];
};

/** Présent continu à taper : she (read) → is reading. */
const FR_NOW = /\ben train de\b|\b(?:maintenant|en ce moment|actuellement)\b/i;
const presentContinuous: Builder = (s, known) => {
  const m = only(new RegExp(`(?:^|[\\s,])(${SUBJECTS})\\s+(am|is|are)\\s+([a-z]+ing)\\b`), s.en);
  if (!m || EN_NOT_PRESENT.test(s.en) || FR_FUTURE_OR_COND.test(s.fr) || !FR_NOW.test(s.fr) || /\bgoing to\b/.test(s.en)) return [];
  const ing = m[3];
  // hugging → hug, cuddling → cuddle : la base vérifiée par la liste de mots.
  const guessed = baseOfIng(ing, known);
  if (!guessed || !plausibleBase(guessed, known)) return [];
  const span = `${m[2]} ${ing}`;
  const at = m.index + m[0].length - span.length;
  return [blank(s, at, span, span, { hint: guessed, form: 'continuous' })];
};

/* ------------------------------------------------------------------- A2 --- */

/** Prétérit après un pronom sujet, à taper (verbe en indice) ; la traduction au passé confirme. */
function pastSimple(kind: 'regular' | 'irregular'): Builder {
  return (s, known) => {
    if (!FR_PAST.test(s.fr) || /\b(?:have|has|had|'ve|'d|been|will|would|if|wish|since)\b/i.test(s.en)) return [];
    const hits = [...s.en.matchAll(SUBJECT_WORD)].filter((h) => {
      const w = h[2];
      const base = baseOf(w, known);
      if (!base || base === 'be' || pastForms(base, known)[0] === base) return false; // put, cut : rien à trouver
      return kind === 'irregular' ? isIrregularBase(base) && pastForms(base, known).includes(w) : !isIrregularBase(base) && w.endsWith('ed');
    });
    if (hits.length !== 1) return [];
    const h = hits[0];
    const form = h[2];
    const base = baseOf(form, known)!;
    const at = h.index + h[0].length - form.length;
    return [blank(s, at, form, form, { hint: base, form: kind })];
  };
}

/** Participe passé irrégulier distinct du prétérit (gone / went), après have / has / had, à taper. */
const pastParticiple: Builder = (s, known) => {
  const m = only(/\b(have|has|had|'ve|'s|'d)\s+([a-z]+)\b/, s.en);
  if (!m) return [];
  const word = m[2];
  const base = baseOf(word, known);
  // Participe distinct du prétérit et de la base (gone, written) : « become », « run » n'apprendraient rien.
  if (!base || !isIrregularBase(base) || participleOf(base) === pastOf(base) || participleOf(base) !== word || word === base || base === 'be') return [];
  if (m[1] === "'s" && !/\b(?:has)\b/.test(s.en.replace(/'s/, ' has'))) return [];
  const at = m.index + m[0].length - word.length;
  return [blank(s, at, word, word, { hint: base, form: 'participle' })];
};

/** Négation au prétérit : didn't + base, contre « didn't went » et « don't go ». */
const pastQuestions: Builder = (s, known) => {
  const m = only(/\b(didn't|did not)\s+([a-z]+)\b/, s.en.replace(/’/g, "'"));
  if (!m || !FR_PAST.test(s.fr)) return [];
  const verb = m[2];
  if (!plausibleBase(verb, known) || verb === 'be') return [];
  const past = pastForms(verb, known)[0];
  if (past === verb) return [];
  const span = `${m[1]} ${verb}`;
  const neg = m[1];
  return [blank(s, m.index, span, span, { choices: [span, `${neg} ${past}`, `${neg === 'did not' ? 'do not' : "don't"} ${verb}`], form: 'negative' })];
};

/** Prétérit continu à taper (« en train de » dans la traduction : le prétérit simple ne conviendrait pas). */
const pastContinuous: Builder = (s, known) => {
  const m = only(new RegExp(`(?:^|[\\s,])(${SUBJECTS})\\s+(was|were)\\s+([a-z]+ing)\\b`), s.en);
  if (!m || !/\ben train de\b/i.test(s.fr) || /\bgoing to\b/.test(s.en)) return [];
  const ing = m[3];
  const base = baseOfIng(ing, known);
  if (!base || !plausibleBase(base, known)) return [];
  const span = `${m[2]} ${ing}`;
  const at = m.index + m[0].length - span.length;
  return [blank(s, at, span, span, { hint: base, form: 'continuous' })];
};

/** Nom indénombrable : advice, contre « advices » et « an advice ». */
const UNCOUNTABLE = 'advice|information|furniture|luggage|baggage|equipment|knowledge|homework|research|evidence|traffic';
const uncountables: Builder = (s) => {
  // Le nom seul, pas employé comme adjectif (« traffic jam », « information office ») : un mot-outil ou une ponctuation suit.
  const m = only(new RegExp(`\\b(${UNCOUNTABLE})\\b(?=\\s*(?:[.,!?;]|$|\\s+(?:is|was|about|on|for|from|that|to|and|in|of|you|I|we|he|she|they|with|before|after)\\b))`), s.en);
  if (!m) return [];
  const word = m[1];
  const prev = s.en.slice(0, m.index).trim().split(/\s+/).at(-1)?.toLowerCase() ?? '';
  const article = /^[aeiou]/.test(word) ? 'an' : 'a';
  // Après un déterminant (« some advice »), « a advice » serait faux pour une autre raison : seulement le pluriel.
  const plural = /(?:ch|sh|x)$/.test(word) ? `${word}es` : `${word}s`;
  const choices = /^(?:the|some|any|much|no|this|that|my|your|his|her|our|their|of|more|less|little|a|an)$/.test(prev) ? [word, plural] : [word, plural, `${article} ${word}`];
  return [blank(s, m.index, word, word, { choices, form: 'uncountable' })];
};

/** much / many selon le nom qui suit, contre « a lot » sans of. */
const NOT_NOUN_AFTER =
  /^(?:more|less|better|worse|too|longer|older|of|than|about|as|to|for|the|a|an|and|in|on|at|time|times|will|would|is|are|was|were|do|does|did|can|could|should|has|have|had|it|you|i|we|they|he|she|this|that|so|like|money)$/;
const countables: Builder = (s) => {
  const m = only(/\b(much|many)\s+([a-z]+)\b/, s.en);
  if (!m || NOT_NOUN_AFTER.test(m[2]) || /er$/.test(m[2]) && !/^(?:water|paper|weather|number|letter|member|dinner|money|power|computer|answer|teacher|problem)$/.test(m[2])) return [];
  const [word, noun] = [m[1], m[2]];
  const plural = /[^s]s$/.test(noun) || /^(?:people|children|men|women|feet|teeth)$/.test(noun);
  if ((word === 'many') !== plural) return [];
  return [blank(s, m.index, word, word, { choices: ['many', 'much', 'a lot'], form: word })];
};

/** Comparatif à taper, l'adjectif en indice : tall → taller, expensive → more expensive. */
// better / worse : comparatifs de good et de well (bad et badly) ; l'indice serait ambigu, ils sont écartés.
const comparatives: Builder = (s, known) => {
  const m = only(/\b(more\s+[a-z]+|[a-z]{3,}er)\s+than\b/, s.en);
  // « know better than to » : une tournure, pas une comparaison.
  if (!m || /\b(?:know|knew|knows|known)\s+better\b/.test(s.en)) return [];
  const span = m[1];
  let adjective: string | undefined;
  if (span.startsWith('more ')) {
    // « more spectators than » : un nom, pas un comparatif d'adjectif.
    adjective = span.slice(5);
    // « more thin than slender » : une comparaison de deux qualités ; thinner serait refusé à tort. Seuls les
    // adjectifs longs (useful, beautiful, surprised) prennent more.
    if (!isAdjective(adjective) || !/(?:ful|ous|ble|ive|ent|ant|ic|al|less|ish|ed|ing|ern)$/.test(adjective)) return [];
  } else {
    const stem = span.slice(0, -2);
    // lower → low avant « lowe » ; bigger → big ; nicer → nice ; easier → easy.
    adjective = [/ier$/.test(span) ? `${span.slice(0, -3)}y` : null, /([bdgmnpt])\1$/.test(stem) ? stem.slice(0, -1) : null, stem, `${stem}e`].find(
      (a): a is string => !!a && a.length > 2 && (!known || known(a)),
    );
    // « other », « rather », « never » : pas des comparatifs.
    if (/^(?:other|rather|never|ever|either|neither|whether|together|over|under|after|later|sooner)$/.test(span)) return [];
  }
  if (!adjective || !isAdjective(adjective)) return [];
  return [blank(s, m.index, span, span, { hint: adjective, form: span.startsWith('more ') ? 'more' : 'er' })];
};

/** Génitif 's : Tom's car (« la voiture de Tom »), contre « Toms » et « Tom ». */
const possessiveS: Builder = (s) => {
  const m = only(/\b([A-Z][a-z]{2,})'s\s+([a-z]{3,})\b/, s.en.replace(/’/g, "'"));
  if (!m || /^(?:It|That|He|She|There|What|Who|Where|Here|Let|This)$/.test(m[1])) return [];
  if (!new RegExp(`\\b(?:de|d'|à)\\s*${m[1]}\\b`).test(s.fr)) return [];
  const span = `${m[1]}'s`;
  return [blank(s, m.index, span, span, { choices: [span, `${m[1]}s`, m[1]], form: 'genitive' })];
};

/** be going to + base : contre « go to » et « going » sans to. */
const goingTo: Builder = (s, known) => {
  const m = only(/\b(am|is|are|'m|'re|'s)\s+going\s+to\s+([a-z]+)\b/, s.en.replace(/’/g, "'"));
  if (!m || !plausibleBase(m[2], known) || /^(?:the|a|an|school|bed|work|church|town|be)$/.test(m[2])) return [];
  const at = m.index + m[0].indexOf('going');
  const span = `going to ${m[2]}`;
  return [blank(s, at, span, span, { choices: [span, `go to ${m[2]}`, `going ${m[2]}`], form: 'going-to' })];
};

/** Modal + base verbale, contre « modal + to » et « modal + -ing » (will, should). */
function modalBase(modal: 'will' | 'should'): Builder {
  return (s, known) => {
    const m = only(new RegExp(`\\b(${modal})\\s+([a-z]+)\\b`), s.en);
    if (!m) return [];
    const verb = m[2];
    if (verb === 'be' || verb === 'have' || !plausibleBase(verb, known)) return [];
    const span = `${modal} ${verb}`;
    return [blank(s, m.index, span, span, { choices: [span, `${modal} to ${verb}`, `${modal} ${ingOf(verb)}`], form: modal })];
  };
}

/** Obligation : has to / have to selon le sujet, contre « must to ». */
const mustHaveTo: Builder = (s, known) => {
  const m = only(new RegExp(`(?:^|[\\s,])(${SUBJECTS})\\s+(have|has)\\s+to\\s+([a-z]+)\\b`), s.en);
  if (!m || FR_PAST.test(s.fr) || !plausibleBase(m[3], known)) return [];
  const third = /^(?:he|she|it)$/i.test(m[1]);
  if ((m[2] === 'has') !== third) return [];
  const span = `${m[2]} to`;
  const at = m.index + m[0].length - m[3].length - span.length - 1;
  return [blank(s, at, span, span, { choices: ['has to', 'have to', 'must to'], form: m[2] })];
};

/** Adverbe de manière en fin de proposition, contre l'adjectif : drive carefully / careful. */
const NOT_MANNER =
  /^(?:only|really|early|likely|family|lovely|friendly|ugly|daily|weekly|monthly|yearly|usually|finally|actually|probably|nearly|recently|lately|certainly|definitely|exactly|clearly|simply|apparently|obviously|unfortunately|fortunately|hardly|mostly|totally|completely|absolutely|especially|immediately|suddenly|eventually|supply|reply|apply|fly|july|italy|holy|silly|belly|jelly|lonely|curly|costly|deadly|elderly|lively|rely|ally|bully|rally|tally|hilly)$/;
const COPULA = /\b(?:is|are|am|was|were|be|been|look|looks|looked|seem|seems|seemed|feel|feels|felt|sound|sounds|smell|smells|taste|tastes|become|became|get|gets|got|stay|stays)\s+$/i;
const adverbsManner: Builder = (s, known) => {
  const m = only(/\b([a-z]{4,}ly)\b(?=\s*[.!?,]|\s*$)/, s.en);
  if (!m || NOT_MANNER.test(m[1]) || COPULA.test(s.en.slice(0, m.index)) || /,\s*$/.test(s.en.slice(0, m.index))) return [];
  const adverb = m[1];
  // happily → happy, basically → basic, comfortably → comfortable, gently → gentle, carefully → careful.
  const adjective = [
    /ily$/.test(adverb) ? `${adverb.slice(0, -3)}y` : null,
    /ically$/.test(adverb) ? adverb.slice(0, -4) : null,
    /[bpt]ly$/.test(adverb) ? `${adverb.slice(0, -1)}e` : null,
    adverb.slice(0, -2),
  ].find((a): a is string => !!a && a.length > 2 && (!known || known(a)));
  if (!adjective) return [];
  return [blank(s, m.index, adverb, adverb, { choices: [adverb, adjective], form: 'adverb' })];
};

/** Verbe + -ing (enjoy, finish, avoid…) ou verbe + to (want, decide, hope…) : les deux autres formes sont fausses. */
const ING_VERBS = 'enjoy|enjoys|enjoyed|finish|finished|finishes|avoid|avoided|avoids|mind|minds|keep|keeps|kept|suggest|suggested|practise|practice|miss|missed';
const TO_VERBS = 'want|wants|wanted|decide|decided|decides|hope|hoped|hopes|plan|planned|plans|refuse|refused|promise|promised|agree|agreed|need|needs|needed|learn|learned|learnt|expect|expected|seem|seems|seemed|manage|managed|offer|offered|afford';
const verbPatterns: Builder = (s, known) => {
  const ing = only(new RegExp(`\\b(?:${ING_VERBS})\\s+([a-z]+ing)\\b`), s.en);
  const to = only(new RegExp(`\\b(?:${TO_VERBS})\\s+to\\s+([a-z]+)\\b`), s.en);
  if (ing && !to) {
    const form = ing[1];
    const base = baseOfIng(form, known);
    if (!base || !plausibleBase(base, known) || /^(?:thing|something|anything|nothing|everything|morning|evening|king|ring|sing|bring|spring|string|wing|ceiling|building|meeting|feeling|wedding)$/.test(form)) return [];
    const at = ing.index + ing[0].length - form.length;
    return [blank(s, at, form, form, { choices: [form, `to ${base}`, base], form: 'ing' })];
  }
  if (to && !ing) {
    const verb = to[1];
    if (!plausibleBase(verb, known)) return [];
    const span = `to ${verb}`;
    const at = to.index + to[0].length - span.length;
    return [blank(s, at, span, span, { choices: [span, ingOf(verb), verb], form: 'to' })];
  }
  return [];
};

/** Générateur de chaque point du parcours sans leçon (A1 et A2) ; les autres attendent des questions rédigées. */
export const PLACEMENT_BUILDERS: Record<string, Builder> = {
  be,
  'was-were': wasWere,
  'subject-object-pronouns': objectPronouns,
  'possessive-adjectives': possessives,
  articles,
  'plural-forms': plurals,
  'this-that': demonstratives,
  'present-simple': presentSimple,
  'do-questions': doQuestions,
  'wh-questions': whQuestions,
  'there-is': thereIs,
  'have-got': haveGot,
  can,
  imperative,
  'prepositions-time-place': timePrepositions,
  'frequency-adverbs': frequencyAdverbs,
  'present-continuous': presentContinuous,
  'past-simple-regular': pastSimple('regular'),
  'past-simple-irregular': pastSimple('irregular'),
  'past-participle': pastParticiple,
  'past-questions': pastQuestions,
  'past-continuous': pastContinuous,
  uncountables,
  countables,
  comparatives,
  'possessive-s': possessiveS,
  'going-to': goingTo,
  will: modalBase('will'),
  'must-have-to': mustHaveTo,
  should: modalBase('should'),
  'adverbs-manner': adverbsManner,
  'verb-patterns': verbPatterns,
};

/** Question de placement d'un point à partir d'une phrase, ou null (même identifiant stable que les exercices). */
export function buildPlacementExercise(pointId: string, s: SourceSentence, known?: Known): Exercise | null {
  const builder = PLACEMENT_BUILDERS[pointId];
  if (!builder || !usable(s)) return null;
  const options = builder(s, known).filter((ex): ex is Candidate => !!ex && !!ex.answer && !!(ex.before.trim() || ex.after.trim()));
  if (!options.length) return null;
  return { id: `${pointId}:${s.id}`, en: s.en, fr: s.fr, ...options[s.id % options.length] };
}
