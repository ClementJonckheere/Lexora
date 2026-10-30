import { baseOf, baseOfIng, baseOfPresent, ingOf, isAdjective, isListedAdjective, participleOf, pastForms, plausibleBase, presentOf, usable, type Builder, type Candidate, type Exercise, type Known, type SourceSentence } from './exercises';
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

/* ================================================================ B2 (2.30) === */

/** Conditionnel passé dans la traduction (« aurait fait », « serait venu ») : il exclut le conditionnel présent. */
const FR_COND_PAST = /(?<![a-zà-ÿ])(?:aurais|aurait|aurions|auriez|auraient|serais|serait|serions|seriez|seraient)\s+(?:(?:pas|jamais|déjà|bien|tout|vraiment)\s+)?[a-zàâçéèêëîïôûù]+(?:é|ée|és|ées|i|ie|is|it|u|ue|us|ert|erte|ort|eint|aint)(?![a-zà-ÿ])/i;

/**
 * Conditionnels (2e, 3e et mixtes) : would + base ou would have + participe dans la conséquence. La traduction tranche
 * (« je serais » / « j'aurais été ») ; c'est le choix que demande le conditionnel mixte (If I had studied, I would be…).
 */
const conditionalResult: Builder = (s, known) => {
  if (!/\bif\b/i.test(s.en)) return [];
  const m = only(/\b(would|wouldn't|would not)\s+(?:(have)\s+([a-z]+)|([a-z]+))\b/, s.en);
  if (!m) return [];
  const [whole, modal, have, part, bare] = m;
  const frPast = FR_COND_PAST.test(s.fr);
  const frPresent = FR_CONDITIONAL.test(s.fr) && !frPast;
  if (have) {
    const base = baseOf(part, known);
    if (!base || !isParticiple(part, known) || !frPast) return [];
    const other = `${modal} ${base}`;
    return [blank(s, m.index, whole, whole, { choices: [whole, other], form: 'would-have' })];
  }
  if (!plausibleBase(bare, known) || /^(?:have|like|rather|be able)$/.test(bare) || !frPresent) return [];
  const other = `${modal} have ${participleOf(bare, known)}`;
  return [blank(s, m.index, whole, whole, { choices: [whole, other], form: 'would' })];
};

/** Passif avec un modal : modal + be + participe (must be done), contre been done et la base active. */
const MODALS = 'can|can\'t|cannot|could|couldn\'t|must|mustn\'t|should|shouldn\'t|may|might|will|won\'t|would|has to|have to|had to';
const passiveModals: Builder = (s, known) => {
  const m = only(new RegExp(`\\b(?:${MODALS})\\s+(?:not\\s+)?be\\s+([a-z]+)\\b`), s.en);
  if (!m) return [];
  const part = m[1];
  const base = baseOf(part, known);
  if (!base || !isParticiple(part, known) || base === part) return [];
  const span = `be ${part}`;
  const at = m.index + m[0].length - span.length;
  return [blank(s, at, span, span, { choices: [span, `been ${part}`, base], form: 'be-done' })];
};

/** Have / get something done : le participe après le complément (had my car repaired), contre la base et -ing. */
const haveDone: Builder = (s, known) => {
  const m = only(/\b(?:have|has|had|having|get|gets|got|getting)\s+(?:my|your|his|her|our|their|the|a|an|this|that)\s+([a-z]+)\s+([a-z]+)\b/, s.en);
  if (!m) return [];
  const [, noun, part] = m;
  const base = baseOf(part, known);
  // « a son named Tom », « a friend called Ann », « the house left to him » : pas une tâche confiée à quelqu'un.
  if (!base || base === 'be' || !isParticiple(part, known) || base === part || /(?:ing|ed)$/.test(noun) || /^(?:named|called|left|located|based|known|born|used|involved|concerned)$/.test(part)) return [];
  const at = m.index + m[0].length - part.length;
  return [blank(s, at, part, part, { choices: [part, base, ingOf(base)], form: 'done' })];
};

/** Relative explicative (entre virgules) : who pour une personne, which pour une chose, whose ; jamais that. */
const relativesNonDefining: Builder = (s) => {
  const m = only(/,\s+(who|which|whose)\b/, s.en);
  // « …, which one would you choose? » : interrogatif, pas une relative.
  if (!m || /^\s*(?:one|ones|of)\b/.test(s.en.slice(m.index + m[0].length)) || /\?\s*$/.test(s.en)) return [];
  const word = m[1];
  const at = m.index + m[0].length - word.length;
  const choices = word === 'whose' ? ['whose', 'who', 'which'] : [word, word === 'who' ? 'which' : 'who', 'that'];
  return [blank(s, at, word, word, { choices, form: word })];
};

/** Déduction au passé : must have / can't have / might have + participe, la traduction donne le degré de certitude. */
const FR_MUST = /(?<![a-zà-ÿ])(?:ai|as|a|avons|avez|ont)\s+dû(?![a-zà-ÿ])|\bdoi(?:s|t|vent)\s+(?:avoir|être)\b|\bsûrement\b|\bcertainement\b/i;
const FR_CANT = /\b(?:n'(?:ai|as|a|avons|avez|ont)\s+pas\s+pu|ne\s+peu(?:x|t|vent)\s+pas\s+avoir|impossible)\b/i;
const FR_MIGHT = /\bpeut-être\b|\bpourrai(?:s|t|ent)\s+avoir\b|\bil\s+se\s+peut\b/i;
const deductionPast: Builder = (s, known) => {
  const m = only(/\b(must|can't|couldn't|might|may)\s+have\s+([a-z]+)\b/, s.en);
  if (!m) return [];
  const [, modal, part] = m;
  if (!isParticiple(part, known)) return [];
  const kind = modal === 'must' ? 'must' : /n't$/.test(modal) ? 'cant' : 'might';
  const fr = { must: FR_MUST.test(s.fr), cant: FR_CANT.test(s.fr), might: FR_MIGHT.test(s.fr) };
  // Une seule nuance dans la traduction, celle de la phrase anglaise.
  if (!fr[kind] || Object.values(fr).filter(Boolean).length !== 1) return [];
  const span = `${modal} have`;
  const others = { must: ['must have', "can't have", 'might have'], cant: [`${modal} have`, 'must have', 'might have'], might: [`${modal} have`, 'must have', "can't have"] }[kind];
  return [blank(s, m.index, span, span, { choices: others, form: kind })];
};

/** Question rapportée : ordre de l'affirmation (where I lived, if she was), contre l'inversion ; ordre rapporté : to + base. */
const reportedQuestions: Builder = (s, known) => {
  const order = only(/\b(?:told|asked|ordered|begged|reminded|warned)\s+(?:me|him|her|us|them|[A-Z][a-z]+)\s+(not\s+)?to\s+([a-z]+)\b/, s.en);
  if (order) {
    const verb = order[2];
    if (!plausibleBase(verb, known)) return [];
    const span = `${order[1] ?? ''}to ${verb}`;
    const at = order.index + order[0].length - span.length;
    const neg = order[1] ? 'not ' : '';
    return [blank(s, at, span, span, { choices: [span, `${neg}${verb}`, `${neg}${ingOf(verb)}`], form: 'order' })];
  }
  const q = only(new RegExp(`\\b(?:asked|wondered|wanted to know)\\s+(?:(?:me|him|her|us|them|[A-Z][a-z]+)\\s+)?(where|what|when|why|how|who|if|whether)\\s+(${SUBJECTS}|[A-Z][a-z]+)\\s+([a-z']+)\\b`), s.en);
  if (!q) return [];
  const [, wh, subject, verb] = q;
  if (wh === 'who' && !/^(?:I|you|he|she|it|we|they)$/.test(subject)) return [];
  const span = `${subject} ${verb}`;
  const at = q.index + q[0].length - span.length;
  let inverted: string | null = null;
  if (/^(?:was|were|could|would|had|should|might)$/.test(verb)) inverted = `${verb} ${subject}`;
  else {
    const base = baseOf(verb, known);
    if (base && base !== 'be' && pastForms(base, known).includes(verb) && plausibleBase(base, known)) inverted = `did ${subject} ${base}`;
  }
  if (!inverted) return [];
  return [blank(s, at, span, span, { choices: [span, inverted], form: 'question' })];
};

/** Futur continu : will be + -ing, contre will + -ing et will be + base (formes fausses). */
const futureContinuous: Builder = (s, known) => {
  const m = only(/\b(will|'ll|won't)\s+be\s+([a-z]+ing)\b/, s.en);
  if (!m) return [];
  const [, aux, ing] = m;
  const base = baseOfIng(ing, known);
  if (!base || base === 'be' || base === 'go' && /going\s+to\b/.test(s.en) || !plausibleBase(base, known)) return [];
  const span = `be ${ing}`;
  const at = m.index + m[0].length - span.length;
  return [blank(s, at, span, span, { choices: [span, ing, `be ${base}`], form: aux === "won't" ? 'negative' : 'affirmative' })];
};

/** Futur antérieur : will have + participe, contre will has et will have + base. */
const futurePerfect: Builder = (s, known) => {
  const m = only(/\b(will|'ll|won't)\s+have\s+([a-z]+)\b/, s.en);
  if (!m) return [];
  const part = m[2];
  const base = baseOf(part, known);
  if (!base || !isParticiple(part, known) || base === part) return [];
  const span = `have ${part}`;
  const at = m.index + m[0].length - span.length;
  return [blank(s, at, span, span, { choices: [span, `has ${part}`, `have ${base}`], form: 'perfect' })];
};

/** Be / get used to + -ing : le verbe en -ing (habitude), contre la base et to + base. */
const beUsedTo: Builder = (s, known) => {
  const m = only(/\b(?:am|is|are|was|were|be|been|being|get|gets|got|getting|'m|'re|'s)\s+(?:not\s+|never\s+|already\s+)?used\s+to\s+([a-z]+ing)\b/, s.en);
  if (!m) return [];
  const ing = m[1];
  const base = baseOfIng(ing, known);
  if (!base || base === 'be' || !plausibleBase(base, known)) return [];
  const at = m.index + m[0].length - ing.length;
  return [blank(s, at, ing, ing, { choices: [ing, base, `to ${base}`], form: 'ing' })];
};

/* ========================================================== C1, A2 (2.31) === */

/** Inversion après un adverbe négatif ou restrictif en tête : Never have I seen…, Rarely do we…, Not only did he… */
const INVERSION_HEAD = /^(Never|Rarely|Seldom|Hardly|Scarcely|Little|Not only|No sooner|Nowhere|Only then|Only when|Only after|Only by|Only if|Only later|Under no circumstances|At no time|In no way|On no account)\s+/;
const inversion: Builder = (s, known) => {
  const head = INVERSION_HEAD.exec(s.en);
  if (!head) return [];
  const at = head[0].length;
  // Inversion directe seulement (« Only when he arrived did we… » la place après la subordonnée).
  const m = /^(have|has|had|do|does|did|was|were|is|are|am|can|could|will|would|should|shall|must|may|might)\s+(I|you|he|she|it|we|they|[A-Z][a-z]+)\s+([a-z]+)\b/.exec(s.en.slice(at));
  if (!m) return [];
  const [, aux, subject, verb] = m;
  const form = /^Not only/.test(head[1]) ? 'not-only' : /^Only/.test(head[1]) ? 'only' : 'negative';
  if (/^(?:do|does|did)$/.test(aux)) {
    // Ordre normal : pas d'auxiliaire, le verbe fléchi (« Rarely we see », « Not only he broke »).
    if (!plausibleBase(verb, known) || /^(?:lie|lay)$/.test(verb)) return [];
    const natural = `${subject} ${aux === 'did' ? pastForms(verb, known)[0] : presentOf(verb, subject)}`;
    const span = `${aux} ${subject} ${verb}`;
    return [blank(s, at, span, span, { choices: [span, natural], form })];
  }
  const span = `${aux} ${subject}`;
  return [blank(s, at, span, span, { choices: [span, `${subject} ${aux}`], form })];
};

/** Phrase clivée en What : What I need is…, contre That et Which, impossibles en tête. */
const cleftSentences: Builder = (s) => {
  const m = /^What\s+(?:I|you|he|she|we|they|[A-Z][a-z]+)\s+(?:really\s+|actually\s+)?[a-z']+(?:\s+[a-z']+){0,3}\s+(?:is|was)\b/.exec(s.en);
  if (!m || /\?\s*$/.test(s.en)) return [];
  return [blank(s, 0, 'What', 'What', { choices: ['What', 'That', 'Which'], form: 'what' })];
};

/** Proposition participiale en tête : Having + participe (Having finished, she left) ou participe passé (Built in 1890, …). */
const participleClauses: Builder = (s, known) => {
  const having = /^Having\s+(?:been\s+)?([a-z]+)\b[^,]*,/.exec(s.en);
  if (having) {
    const part = having[1];
    if (!isParticiple(part, known)) return [];
    const span = /^Having\s+been\s+/.test(s.en) ? `Having been ${part}` : `Having ${part}`;
    const tail = span.slice('Having '.length);
    return [blank(s, 0, span, span, { choices: [span, `Have ${tail}`, `Had ${tail}`], form: 'having' })];
  }
  const past = /^([A-Z][a-z]+)\s+(?:by|in|with|from|on|at|for|into|under|over|during|after)\b[^,]*,\s+(?:the|a|an|this|that|his|her|my|our|their|it|he|she|they|we|I)\b/.exec(s.en);
  if (!past) return [];
  const word = past[1].toLowerCase();
  const base = baseOf(word, known);
  if (!base || base === word || !isParticiple(word, known) || /^(?:based|compared|according)$/.test(word)) return [];
  const answer = past[1];
  return [blank(s, 0, answer, answer, { choices: [answer, cap(ingOf(base), true), cap(base, true)], form: 'past' })];
};

/** Subjonctif après suggest, insist, recommend… that : la base pour toutes les personnes (that he go, that she be). */
const MANDATIVE = /\b(?:suggest|suggests|suggested|insist|insists|insisted|recommend|recommends|recommended|demand|demands|demanded|propose|proposes|proposed|require|requires|required|request|requested|ask|asked|urge|urged|essential|important|vital|necessary|imperative)\s+that\s+/;
const subjunctive: Builder = (s, known) => {
  const m = MANDATIVE.exec(s.en);
  if (!m) return [];
  const rest = s.en.slice(m.index + m[0].length);
  const c = /^(he|she|it|[A-Z][a-z]+|the\s+[a-z]+|his\s+[a-z]+|her\s+[a-z]+)\s+(not\s+)?([a-z]+)\b/.exec(rest);
  if (!c) return [];
  const verb = c[3];
  if (!plausibleBase(verb, known) || /^(?:should|would|will|can|could|must|may|might)$/.test(verb)) return [];
  const other = verb === 'be' ? 'is' : presentOf(verb, 'he');
  if (other === verb) return [];
  const at = m.index + m[0].length + c[0].length - verb.length;
  return [blank(s, at, verb, verb, { choices: [verb, other], form: c[2] ? 'negative' : verb === 'be' ? 'be' : 'verb' })];
};

/** Do d'insistance : do / does / did + base (I do like it, She did call), contre la forme fléchie après l'auxiliaire. */
const emphaticDo: Builder = (s, known) => {
  if (/\?\s*$/.test(s.en)) return [];
  const imperative = /^(Do)\s+([a-z]+)\b/.exec(s.en);
  if (imperative && plausibleBase(imperative[2], known) && !/^(?:not|you|we|they|it|so|this|that)$/.test(imperative[2])) {
    const span = `Do ${imperative[2]}`;
    return [blank(s, 0, span, span, { choices: [span, `Do ${ingOf(imperative[2])}`, `Do to ${imperative[2]}`], form: 'imperative' })];
  }
  const m = only(/\b(I|you|we|they|he|she|it|[A-Z][a-z]+)\s+(?:really\s+)?(do|does|did)\s+([a-z]+)\b/, s.en);
  if (!m) return [];
  const [, , aux, verb] = m;
  if (!plausibleBase(verb, known) || /^(?:not|so|it|that|this|the|a|an|my|your|his|her|our|their|what|nothing|anything|something|everything|well|too)$/.test(verb)) return [];
  const wrong = aux === 'did' ? pastForms(verb, known)[0] : aux === 'does' ? presentOf(verb, 'he') : pastForms(verb, known)[0];
  if (wrong === verb) return [];
  const span = `${aux} ${verb}`;
  const at = m.index + m[0].length - span.length;
  return [blank(s, at, span, span, { choices: [span, `${aux} ${wrong}`], form: aux })];
};

/** Adjectif : avant le nom, invariable (a red car, different ideas), contre « car red » et « differents ». */
const DET = '(?:a|an|the|some|two|three|many|these|those|my|your|his|her|our|their|this|that|very)';
const NOT_NOUN = /^(?:of|to|more|less|than|as|and|or|enough|with|for|in|on|at|about|from|one|ones|bit|lot|deal|while|way|kind|sort|number|amount|thing|things|is|are|was|were|be)$/;
const AMBIGUOUS_ADJ = /^(?:well|close|fine|light|right|free|sure|ready|ill|mad|kind|wrong|true|real|full|empty|late|early|fast|hard|long|high|low|short|cool|dark|deep|wide|clear|safe)$/;
const adjectives: Builder = (s) => {
  const m = only(new RegExp(`\\b${DET}\\s+([a-z]+)\\s+([a-z]{3,})\\b(?=\\s*(?:[.,!?;]|$|\\s+(?:is|are|was|were|in|on|at|for|with|and|to|from|that|who|which|I|you|he|she|we|they)\\b))`), s.en);
  if (!m) return [];
  const [whole, adj, noun] = m;
  if (!isListedAdjective(adj) || AMBIGUOUS_ADJ.test(adj) || NOT_NOUN.test(noun) || isListedAdjective(noun) || /(?:ly|ing|ed)$/.test(noun)) return [];
  const span = `${adj} ${noun}`;
  const at = m.index + whole.length - span.length;
  const plural = /[^s]s$/.test(noun) && /\b(?:some|two|three|many|these|those)\s/.test(whole);
  const choices = plural ? [span, `${noun} ${adj}`, `${adj}s ${noun}`] : [span, `${noun} ${adj}`];
  return [blank(s, at, span, span, { choices, form: plural ? 'plural' : 'singular' })];
};

/** Présent simple ou continu : un repère anglais tranche (now, Look! → continu ; usually, every day → simple). */
const NOW = /\b(?:now|right now|at the moment|currently|at present|Look|Listen)\b/;
const HABIT = /\b(?:usually|always|often|never|sometimes|rarely|seldom|every\s+(?:day|morning|evening|night|week|month|year|summer|winter|weekend|Sunday|Monday|Saturday)|on\s+(?:Mondays|Sundays|Saturdays|weekends)|once\s+a|twice\s+a)\b/;
const NOT_PRESENT = /\b(?:will|would|was|were|did|had|yesterday|ago|tomorrow|last|next|tonight|going to|been|since|for\s+\w+\s+(?:years|months|weeks|days))\b/;
const simpleVsContinuous: Builder = (s, known) => {
  if (NOT_PRESENT.test(s.en)) return [];
  const now = NOW.test(s.en);
  const habit = HABIT.test(s.en);
  if (now === habit) return [];
  if (now) {
    const m = only(/\b(I|[Yy]ou|[Hh]e|[Ss]he|[Ii]t|[Ww]e|[Tt]hey)\s+(am|is|are)\s+([a-z]+ing)\b/, s.en);
    if (!m) return [];
    const base = baseOfIng(m[3], known);
    if (!base || base === 'be' || !plausibleBase(base, known)) return [];
    const span = `${m[2]} ${m[3]}`;
    const at = m.index + m[0].length - span.length;
    return [blank(s, at, span, span, { choices: [span, presentOf(base, m[1].toLowerCase())], form: 'continuous' })];
  }
  const m = only(/\b(I|[Yy]ou|[Hh]e|[Ss]he|[Ii]t|[Ww]e|[Tt]hey)\s+(?:usually\s+|always\s+|often\s+|never\s+|sometimes\s+|rarely\s+)?([a-z]+)\b/, s.en);
  if (!m) return [];
  const subject = m[1] === 'I' ? 'I' : m[1].toLowerCase();
  const verb = m[2];
  const base = /^(?:he|she|it)$/.test(subject) ? baseOfPresent(verb) : verb;
  if (presentOf(base, subject) !== verb || !plausibleBase(base, known) || /^(?:be|have|do|can|will|must|should)$/.test(base) || AUX_WORDS.test(verb)) return [];
  const be = presentOf('be', subject);
  const at = m.index + m[0].length - verb.length;
  return [blank(s, at, verb, verb, { choices: [verb, `${be} ${ingOf(base)}`], form: 'simple' })];
};
const AUX_WORDS = /^(?:am|is|are|was|were|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|don't|doesn't|can't|won't)$/;

export const LESSON_BUILDERS: Record<string, Builder> = {
  'reported-statements': reportedStatements,
  'subject-questions': subjectQuestions,
  'purpose-to': purposeTo,
  'preposition-ing': prepositionIng,
  'make-let': makeLet,
  'phrasal-verbs': phrasalVerbs,
  'mixed-conditionals': conditionalResult,
  'passive-modals': passiveModals,
  'have-something-done': haveDone,
  'relatives-non-defining': relativesNonDefining,
  'deduction-past': deductionPast,
  'reported-questions': reportedQuestions,
  'future-continuous': futureContinuous,
  'future-perfect': futurePerfect,
  'be-used-to': beUsedTo,
  inversion,
  'cleft-sentences': cleftSentences,
  'participle-clauses': participleClauses,
  subjunctive,
  'emphatic-do': emphaticDo,
  adjectives,
  'simple-vs-continuous': simpleVsContinuous,
};

/** Exercice d'une leçon B1 ajoutée en 2.29, ou null si la phrase ne s'y prête pas. */
export function buildLessonExercise(lessonId: string, s: SourceSentence, known?: Known): Exercise | null {
  const builder = LESSON_BUILDERS[lessonId];
  if (!builder || !usable(s)) return null;
  const options = builder(s, known).filter((ex): ex is Candidate => !!ex && !!ex.answer && !!(ex.before.trim() || ex.after.trim()));
  if (!options.length) return null;
  return { id: `${lessonId}:${s.id}`, en: s.en, fr: s.fr, ...options[s.id % options.length] };
}
