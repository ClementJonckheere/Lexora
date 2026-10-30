import { baseOf, baseOfIng, baseOfPresent, ingOf, isAdjective, participleOf, pastForms, plausibleBase, presentOf, usable, type Builder, type Candidate, type Exercise, type Known, type SourceSentence } from './exercises';
import { blank, cap, only } from './placementBuilders';

/**
 * Exercices des leçons B1 ajoutées en 2.29 (discours rapporté, questions sur le sujet, but avec to, préposition + -ing,
 * make / let, phrasal verbs). Même principe que les autres générateurs : une phrase n'est gardée que si la réponse est
 * certaine, parce que les autres propositions sont fausses en soi (« for to buy », « before to leave », « pick up it »),
 * ou parce que la traduction française tranche (imparfait → was, conditionnel → would, « laisser » → let).
 */

const SUBJECTS = '(?:I|you|he|she|it|we|they)';
const PRONOUNS = '(?:me|you|him|her|us|them|it)';

/* --------------------------------------------------- discours rapporté --- */

/** Imparfait, conditionnel, plus-que-parfait dans la traduction (« qu'il était », « qu'elle viendrait », « qu'il avait »). */
const FR_IMPERFECT = /(?<![a-zà-ÿ])[a-zàâçéèêëîïôûù]{2,}(?:ais|ait|aient)(?![a-zà-ÿ])/i;
const FR_CONDITIONAL = /(?<![a-zà-ÿ])[a-zàâçéèêëîïôûù]{2,}r(?:ais|ait|aient)(?![a-zà-ÿ])/i;
const FR_PLUPERFECT = /(?<![a-zà-ÿ])(?:avais|avait|avaient|étais|était|étaient)\s+(?:(?:pas|jamais|déjà|bien|tout)\s+)?[a-zàâçéèêëîïôûù]+(?:é|ée|és|ées|i|is|it|u|ue|us|ert|erte|ort|eint|aint)\b/i;
/** Mots en -ais / -ait qui ne sont pas des imparfaits. */
const FR_NOT_IMPERFECT =
  /(?<![a-zà-ÿ])(?:français|française|anglais|anglaise|japonais|japonaise|jamais|mais|désormais|frais|palais|mauvais|épais|lait|souhait|portrait|parfait|trait|fait|faits|laid|vrai|essai|délai|quai)(?![a-zà-ÿ])/gi;
const frImperfect = (fr: string) => FR_IMPERFECT.test(fr.replace(FR_NOT_IMPERFECT, ' '));
/** Participe passé : régulier (-ed d'une base connue) ou irrégulier. */
const isParticiple = (w: string, known?: Known) => {
  const base = baseOf(w, known);
  return !!base && participleOf(base, known) === w;
};

/**
 * Concordance des temps après said / told : la subordonnée recule d'un temps. Le trou porte sur son verbe ; l'autre
 * proposition est le temps du discours direct (is, will, can, has, présent). La traduction (imparfait, conditionnel,
 * plus-que-parfait) écarte les phrases où le présent serait voulu (« il a dit qu'il est malade »).
 */
const REPORT = new RegExp(`\\b(?:said|told\\s+(?:me|him|her|us|them|[A-Z][a-z]+))\\s+(?:that\\s+)?(${SUBJECTS})\\s+([a-z']+)\\b`);
const reportedStatements: Builder = (s, known) => {
  const m = only(REPORT, s.en);
  if (!m || /\b(?:says|tells|will say|'ll say)\b/.test(s.en) || !/\b(?:dit|répondu|annoncé|expliqué|affirmé|déclaré|raconté|promis)\b/i.test(s.fr)) return [];
  const subject = m[1];
  const verb = m[2];
  const at = m.index + m[0].length - verb.length;
  const out = (answer: string, other: string, form: string, ok: boolean): Candidate[] =>
    ok ? [blank(s, at, verb, answer, { choices: [answer, other], form })] : [];
  if (verb === 'was' || verb === 'were') return out(verb, presentOf('be', subject), 'be', frImperfect(s.fr));
  if (verb === 'would') return out('would', 'will', 'would', FR_CONDITIONAL.test(s.fr));
  if (verb === 'could') return out('could', 'can', 'could', FR_CONDITIONAL.test(s.fr) || frImperfect(s.fr));
  if (verb === 'had') {
    // had + participe (plus-que-parfait) ; « had » seul (possession) suit la règle du prétérit plus bas.
    const next = /^had\s+(?:(?:not|never|already|just|always)\s+)?([a-z]+)/.exec(s.en.slice(at))?.[1] ?? '';
    if (isParticiple(next, known)) return out('had', presentOf('have', subject), 'had', FR_PLUPERFECT.test(s.fr));
  }
  // Prétérit simple d'un verbe d'action ou d'état : l'autre proposition est le présent.
  const base = baseOf(verb, known);
  if (!base || base === 'be' || base === 'have' || !plausibleBase(base, known) || !pastForms(base, known).includes(verb)) return [];
  return out(verb, presentOf(base, subject), 'past', frImperfect(s.fr));
};

/* ------------------------------------------------ questions sur le sujet --- */

/**
 * Who / What sujet : pas de do (Who called?), contre la question sur le complément, où do revient (Who did you call?).
 * Deux natures de réponse : « subject » (called / did call) et « object » (did you call / you called).
 */
const AUX = /^(?:is|are|was|were|am|has|have|had|can|could|will|would|shall|should|may|might|must|do|does|did)$/;
const subjectQuestions: Builder = (s, known) => {
  if (!/\?\s*$/.test(s.en)) return [];
  const obj = /^(Who|What)\s+(did|does)\s+(you|he|she|they|we|I|it|Tom|Mary)\s+([a-z]+)\b/.exec(s.en);
  if (obj) {
    const [, wh, aux, subject, verb] = obj;
    if (!plausibleBase(verb, known) || AUX.test(verb)) return [];
    const span = `${aux} ${subject} ${verb}`;
    const at = wh.length + 1;
    const wrong = aux === 'did' ? `${subject} ${pastForms(verb, known)[0]}` : `${subject} ${presentOf(verb, subject)}`;
    if (wrong === `${subject} ${verb}`) return [];
    return [blank(s, at, span, span, { choices: [span, wrong], form: 'object' })];
  }
  const subj = /^(Who|What)\s+([a-z]+)\b/.exec(s.en);
  if (!subj) return [];
  const [, wh, verb] = subj;
  if (AUX.test(verb) || /^(?:else|kind|sort|time)$/.test(verb)) return [];
  const at = wh.length + 1;
  // Prétérit (called, broke) : did + base ; présent de 3e personne (wants) : does + base.
  const base = baseOf(verb, known);
  if (base && base !== 'be' && pastForms(base, known).includes(verb) && plausibleBase(base, known))
    return [blank(s, at, verb, verb, { choices: [verb, `did ${base}`], form: 'subject' })];
  if (/s$/.test(verb) && !/ss$/.test(verb)) {
    const b = baseOfPresent(verb);
    if (b !== verb && plausibleBase(b, known) && presentOf(b, 'he') === verb && (!known || known(b)))
      return [blank(s, at, verb, verb, { choices: [verb, `does ${b}`], form: 'subject' })];
  }
  return [];
};

/* ----------------------------------------------------------- but : to --- */

/** Verbes suivis d'un infinitif complément (want to, try to…) : là, to n'exprime pas le but. */
const TO_COMPLEMENT =
  /\b(?:want|wants|wanted|need|needs|needed|like|likes|liked|love|loves|loved|hate|hates|hated|prefer|try|tries|tried|decide|decided|hope|hoped|plan|planned|promise|promised|refuse|refused|agree|agreed|forget|forgot|remember|remembered|learn|learned|learnt|seem|seems|seemed|have|has|had|going|used|able|ought|about|begin|began|start|started|continue|manage|managed|afford|expect|expected|would|'d|how|what|where|when|whether|ask|asked|tell|told|allow|allowed|enough|too|first|last|only|time|way|chance|right|easy|hard|difficult|nice|glad|happy|sorry|sure|likely|ready|free)\s+(?:(?:not|me|you|him|her|us|them)\s+)?to\s+[a-z]+\s*$/i;
const PURPOSE_VERBS = /\b(?:went|go|goes|came|come|comes|called|stopped|left|ran|hurried|stayed|saved|worked|work|works|studied|study|got up|woke up|sat down|opened|closed|used|use|uses|bought|buy|sold|borrowed|wrote|phoned|rang|returned|moved|visited|travelled|traveled)\b/i;
/** But : to + base, contre « for » (calque de « pour ») ; la traduction dit « pour » + infinitif. */
const FR_POUR = /\bpour\s+(?:(?:ne\s+pas|le|la|les|l'|lui|leur|me|te|se|nous|vous|en|y)\s+)*[a-zàâçéèêëîïôûù']+(?:er|ir|re|oir)\b/i;
const purposeTo: Builder = (s, known) => {
  if (!FR_POUR.test(s.fr)) return [];
  // Un seul « to + verbe » dans la phrase (« went to the shop to buy » : le premier to est une préposition).
  const infinitives = [...s.en.matchAll(/\bto\s+([a-z]+)\b/g)].filter((m) => plausibleBase(m[1], known) && !/^(?:the|a|an|my|your|his|her|our|their|me|you|him|us|them|it|this|that|be)$/.test(m[1]));
  if (infinitives.length !== 1) return [];
  const m = infinitives[0];
  const verb = m[1];
  const head = s.en.slice(0, m.index);
  if (TO_COMPLEMENT.test(`${head}to ${verb}`)) return [];
  // « too far to », « enough time to », « it took four hours to », « 24 hours left to » : to juste, mais pas un but.
  if (/\b(?:too|enough|took|takes|take|taking|left|time|hours|minutes|days|years|money|way|chance|reason)\b/i.test(head.split(/\s+/).slice(-5).join(' '))) return [];
  // Un verbe de mouvement ou d'action avant le but, à six mots au plus.
  if (!PURPOSE_VERBS.test(head.split(/\s+/).slice(-7).join(' '))) return [];
  return [blank(s, m.index!, `to ${verb}`, `to ${verb}`, { choices: [`to ${verb}`, `for ${verb}`, `for to ${verb}`], form: 'purpose' })];
};

/* ---------------------------------------------------- préposition + -ing --- */

const PREPOSITIONS = 'about|of|for|without|before|after|by|at|in|on|from|instead of';
/** Après une préposition, le verbe prend -ing : before leaving, contre before to leave et before leave. */
const prepositionIng: Builder = (s, known) => {
  const m = only(new RegExp(`\\b(${PREPOSITIONS})\\s+([a-z]+ing)\\b`), s.en);
  if (!m) return [];
  const ing = m[2];
  const base = baseOfIng(ing, known);
  if (!base || base === 'be' || !plausibleBase(base, known)) return [];
  // « in / at / on » + -ing : souvent un nom (in writing, at sea…) ; seulement après un adjectif ou un verbe qui les appelle.
  const prev = s.en.slice(0, m.index).trim().split(/\s+/).slice(-2).join(' ').toLowerCase();
  if (/^(?:in|at|on|of|for|from|by)$/.test(m[1]) && !/(?:interested|good|bad|better|best|tired|afraid|proud|fond|capable|keen|succeed\w*|insist\w*|believe\w*|thank\w*|sorry|responsible|instead|apolog\w*|forgive\w*|blame\w*|prevent\w*|stop\w*|accused?|charged|guilty|famous|known|excited|worried|nervous|thinking|dream\w*|talk\w*|complain\w*|warn\w*|keen|used|look\w* forward|object\w*|way|idea|chance|hope|point|habit|danger|fear|risk|purpose|process|charge|middle)$/.test(prev.split(' ').at(-1) ?? ''))
    return [];
  const at = m.index + m[0].length - ing.length;
  const form = /^(?:before|after)$/.test(m[1]) ? 'time' : m[1] === 'without' ? 'without' : 'other';
  return [blank(s, at, ing, ing, { choices: [ing, `to ${base}`, base], form })];
};

/* --------------------------------------------------------- make / let --- */

const MAKE_LET = new RegExp(`\\b([Mm]ake|[Mm]akes|[Mm]ade|[Mm]aking|[Ll]et|[Ll]ets|[Ll]etting)\\s+(${PRONOUNS}|[A-Z][a-z]+)\\s+([a-z]+)\\b`);
/** Make / let + personne + base verbale : sans to. Deux natures : la base (go / to go / going) et le verbe (faire ou laisser). */
const makeLet: Builder = (s, known) => {
  const m = only(MAKE_LET, s.en);
  if (!m || /\blet's\b/i.test(s.en)) return [];
  const [, verbRaw, , base] = m;
  const verb = verbRaw.toLowerCase();
  if (!plausibleBase(base, known) || isAdjective(base) || /^(?:to|a|an|the|up|down|in|out|off|on|it|sure|so|very)$/.test(base)) return [];
  const out: Candidate[] = [];
  const baseAt = m.index + m[0].length - base.length;
  const ing = ingOf(base);
  out.push(blank(s, baseAt, base, base, { choices: [base, `to ${base}`, ing], form: 'base' }));
  // Le verbe lui-même, si la traduction dit clairement « faire » (make) ou « laisser » (let).
  const isLet = /^let/.test(verb);
  const frLet = /\blaiss/i.test(s.fr);
  const frMake = /\b(?:fai[st]?|fait|font|faire|fis|fit|firent|ferai\w*|fera\w*|ferons|ferez|feront|faisai\w*)\b/i.test(s.fr);
  if (isLet ? frLet && !frMake : frMake && !frLet) {
    const past = /\b(?:ai|as|a|avons|avez|ont)\s+(?:laissé|fait)\b|\b(?:laissa|fit|laissait|faisait)\b/i.test(s.fr);
    const other: Record<string, string> = { make: 'let', makes: 'lets', made: 'let', making: 'letting', lets: 'makes', letting: 'making', let: past ? 'made' : 'make' };
    const verbAt = m.index + m[0].indexOf(verbRaw);
    out.push(blank(s, verbAt, verbRaw, cap(verb, verbAt === 0), { choices: [verb, other[verb]].map((c) => cap(c, verbAt === 0)), form: 'verb' }));
  }
  return out;
};

/* --------------------------------------------------------- phrasal verbs --- */

/** Pronom complément entre le verbe et la particule : pick it up, jamais pick up it. */
const PARTICLES = 'up|down|off|on|out|back|away|over';
const phrasalVerbs: Builder = (s, known) => {
  const m = only(new RegExp(`\\b([a-z]+)\\s+(${PRONOUNS})\\s+(${PARTICLES})\\b`), s.en);
  if (!m) return [];
  const [, verb, pronoun, particle] = m;
  const base = baseOf(verb, known) ?? baseOfIng(verb, known) ?? (/[^s]s$/.test(verb) ? baseOfPresent(verb) : verb);
  if (!base || !plausibleBase(base, known) || /^(?:be|have|do|let|make|help|see|watch|hear|want|need|ask|tell|thank|give|send|show|take)$/.test(base)) return [];
  // La particule ne doit pas ouvrir un groupe prépositionnel (« put it on the table » : on est une préposition).
  const after = s.en.slice(m.index + m[0].length);
  if (/^\s+(?:the|a|an|my|your|his|her|our|their|this|that|these|those)\b/i.test(after)) return [];
  const span = `${verb} ${pronoun} ${particle}`;
  return [blank(s, m.index, span, span, { choices: [span, `${verb} ${particle} ${pronoun}`], form: 'pronoun' })];
};

export const LESSON_BUILDERS: Record<string, Builder> = {
  'reported-statements': reportedStatements,
  'subject-questions': subjectQuestions,
  'purpose-to': purposeTo,
  'preposition-ing': prepositionIng,
  'make-let': makeLet,
  'phrasal-verbs': phrasalVerbs,
};

/** Exercice d'une leçon B1 ajoutée en 2.29, ou null si la phrase ne s'y prête pas. */
export function buildLessonExercise(lessonId: string, s: SourceSentence, known?: Known): Exercise | null {
  const builder = LESSON_BUILDERS[lessonId];
  if (!builder || !usable(s)) return null;
  const options = builder(s, known).filter((ex): ex is Candidate => !!ex && !!ex.answer && !!(ex.before.trim() || ex.after.trim()));
  if (!options.length) return null;
  return { id: `${lessonId}:${s.id}`, en: s.en, fr: s.fr, ...options[s.id % options.length] };
}
