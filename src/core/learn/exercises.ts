import irregular from './irregular-verbs.json';
import { matchSentence } from './patterns';

/**
 * Exercices de grammaire tirés de phrases réelles (Tatoeba, avec leur traduction française).
 * La phrase est coupée autour de la forme travaillée : on tape la forme (verbe donné entre parenthèses), ou on
 * choisit entre deux formes. La traduction française sert d'indice : elle lève l'ambiguïté du trou.
 */

export interface Exercise {
  /** Identifiant stable : leçon + phrase Tatoeba. */
  id: string;
  en: string;
  fr: string;
  before: string;
  after: string;
  /** Réponse attendue (formes contractées développées : « 've » → « have »). */
  answer: string;
  /** Indice entre parenthèses (verbe à la base, « habitude passée »…). */
  hint?: string;
  /** Exercice à choix : les formes proposées (dont la réponse), dans l'ordre d'affichage. */
  choices?: string[];
}

export interface SourceSentence {
  id: number;
  en: string;
  fr: string;
}

/* --------------------------------------------------------------- verbes --- */

const verbs = (irregular as { verbs: { base: string; past: string[]; participle: string[] }[] }).verbs;
const BASE_OF = new Map<string, string>();
const PAST_OF = new Map<string, string>();
const PARTICIPLE_OF = new Map<string, string>();
for (const v of verbs) {
  for (const f of [...v.past, ...v.participle]) if (!BASE_OF.has(f)) BASE_OF.set(f, v.base);
  PAST_OF.set(v.base, v.past[0]);
  PARTICIPLE_OF.set(v.base, v.participle[0]);
}
BASE_OF.set('was', 'be').set('were', 'be');


/** Formes en -ed que les règles devinent mal, ou qui ne sont pas des verbes au passé (null). */
const REGULAR_EXCEPTIONS: Record<string, string | null> = {
  added: 'add', used: 'use', pleased: 'please', wasted: 'waste', owed: 'owe', tasted: 'taste', pasted: 'paste', ceased: 'cease', released: 'release',
  naked: null, wicked: null, sacred: null, beloved: null, crooked: null, rugged: null, hundred: null, kindred: null, red: null, bed: null, shed: null,
  need: null, feed: null, bleed: null, breed: null, speed: null, seed: null, weed: null, heed: null, deed: null, exceed: null, succeed: null, proceed: null, indeed: null,
};

/** Base verbale d'une forme passée ou d'un participe (« went » → « go », « stopped » → « stop »). `known` : liste de mots. */
export function baseOf(form: string, known?: (w: string) => boolean): string | null {
  const w = form.toLowerCase();
  const irr = BASE_OF.get(w);
  if (irr) return irr;
  if (w in REGULAR_EXCEPTIONS) return REGULAR_EXCEPTIONS[w];
  if (!w.endsWith('ed') || w.length < 4) return null;
  if (w.endsWith('eed')) return w.slice(0, -1); // agreed → agree, freed → free
  const stem = w.slice(0, -2);
  const candidates = [
    w.endsWith('ied') ? `${w.slice(0, -3)}y` : null,
    /([b-df-hj-np-tv-z])\1$/.test(stem) ? stem.slice(0, -1) : null,
    `${stem}e`,
    stem,
  ].filter((c): c is string => !!c && c.length >= 2);
  // Règles simples (stopped → stop, liked → like, played → play, died → die, discussed → discuss), vérifiées par
  // la liste de mots quand elle est fournie : elle contient aussi des mots étrangers (« signe »), d'où les règles d'abord.
  const guess = guessBase(w, stem);
  if (!known || known(guess)) return guess;
  return candidates.find(known) ?? null;
}

function guessBase(w: string, stem: string): string {
  if (w.endsWith('ied')) return w.length <= 4 ? w.slice(0, -1) : `${w.slice(0, -3)}y`;
  if (/([b-df-hj-km-rtv-y])\1$/.test(stem)) return stem.slice(0, -1);
  if (/[^aeiou][aeiou][bcdgkmnprstvz]$/.test(stem) && stem.length <= 4) return `${stem}e`;
  if (/(?:v|z|u|c|dg|rg|ang|ung)$/.test(stem)) return `${stem}e`; // changed → change, solved → solve
  return stem;
}

/** Prétérit d'une base (régulier ou irrégulier). */
export function pastOf(base: string): string {
  const irr = PAST_OF.get(base);
  if (irr) return irr.split('/')[0];
  if (base.endsWith('e')) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  return `${base}ed`;
}

/** Participe passé d'une base. */
export function participleOf(base: string): string {
  return PARTICIPLE_OF.get(base)?.split('/')[0] ?? pastOf(base);
}

/** Forme en -ing (« go » → « going », « make » → « making », « stop » → « stopping »). */
export function ingOf(base: string): string {
  if (base.endsWith('ie')) return `${base.slice(0, -2)}ying`;
  if (base.endsWith('e') && !base.endsWith('ee') && base !== 'be') return `${base.slice(0, -1)}ing`;
  if (/^[^aeiou]*[aeiou][b-df-hj-np-tv-z]$/.test(base) && !/[wxy]$/.test(base)) return `${base}${base.at(-1)}ing`;
  return `${base}ing`;
}

/** Base d'un présent de 3e personne (« rains » → « rain », « goes » → « go », « studies » → « study »). */
function baseOfPresent(form: string): string {
  if (form === 'has') return 'have';
  if (form === 'is') return 'be';
  if (form === 'does') return 'do';
  if (form.endsWith('ies')) return `${form.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|o)es$/.test(form)) return form.slice(0, -2);
  return form.endsWith('s') ? form.slice(0, -1) : form;
}

/* ------------------------------------------------------------ réponses --- */

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/n't\b/g, ' not'],
  [/'ve\b/g, ' have'],
  [/'ll\b/g, ' will'],
  [/'re\b/g, ' are'],
  [/'m\b/g, ' am'],
];

/** Réponse normalisée : minuscules, apostrophes droites, contractions développées, espaces réduits. */
export function normalizeAnswer(text: string, contracted: { d?: string; s?: string } = {}): string {
  let s = text.toLowerCase().replace(/[’`´]/g, "'").trim();
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  if (contracted.d) s = s.replace(/'d\b/g, ` ${contracted.d}`);
  if (contracted.s) s = s.replace(/'s\b/g, ` ${contracted.s}`);
  return s.replace(/cannot/g, 'can not').replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
}

/** La réponse tapée est-elle juste ? (contractions acceptées dans les deux sens) */
export function isCorrect(ex: Exercise, typed: string): boolean {
  const target = normalizeAnswer(ex.answer);
  return [undefined, 'had', 'would', 'has', 'is'].some(
    (alt) => normalizeAnswer(typed, { d: alt === 'had' || alt === 'would' ? alt : undefined, s: alt === 'has' || alt === 'is' ? alt : undefined }) === target,
  );
}

/* ---------------------------------------------------------- découpage --- */

const SUBJECTS_3RD = /^(?:he|she|it|this|that|there|everyone|someone|nobody|everybody|somebody)$/i;
const MAX_LENGTH = 130;
const MIN_LENGTH = 12;

function usable(s: SourceSentence): boolean {
  return s.en.length >= MIN_LENGTH && s.en.length <= MAX_LENGTH && !!s.fr && !/["“”«»]/.test(s.en) && !/\d{3,}/.test(s.en.replace(/\b(1[5-9]|20)\d\d\b/g, ''));
}

function words(span: string): string[] {
  return span.trim().split(/\s+/);
}

/** Phrase où le motif trouve exactement une correspondance, et sa position. */
function single(pointId: string, en: string) {
  const m = matchSentence(pointId, en.replace(/’/g, "'"));
  return m.length === 1 ? m[0] : null;
}

type Builder = (s: SourceSentence, known?: (w: string) => boolean) => Omit<Exercise, 'id' | 'en' | 'fr'> | null;

/** Forme verbale « auxiliaire + participe », à taper, verbe à la base en indice. */
function auxParticiple(pointId: string, auxes: RegExp): Builder {
  return (s, known) => {
    const m = single(pointId, s.en);
    if (!m) return null;
    // « I've said » : le motif commence à « 've », qui fait partie de la forme à trouver.
    const span = s.en.slice(m.start, m.end);
    const w = words(span);
    if (w.length !== 2 || !auxes.test(w[0])) return null; // pas d'adverbe au milieu (never, already…) : trou net
    const base = baseOf(w[1], known);
    if (!base) return null;
    let before = s.en.slice(0, m.start);
    // « should've set » : conditionnel passé, pas un present perfect.
    if (/(?:\b(?:would|could|should|might|must|may|will|can|to)(?:n't)?|'d)\s*$/i.test(before)) return null;
    // « I've said » → « I [have said] » : l'espace manquant avant la forme développée.
    if (span.startsWith("'")) before += ' ';
    const answer = normalizeAnswer(span, { d: 'had', s: 'has' });
    return { before, after: s.en.slice(m.end), answer, hint: base };
  };
}

/** Un mot à choisir parmi des formes concurrentes. */
function choiceWord(pointId: string, pairs: Record<string, string>): Builder {
  return (s) => {
    const m = single(pointId, s.en);
    if (!m) return null;
    const hits = [...s.en.slice(m.start, m.end).matchAll(new RegExp(`\\b(?:${Object.keys(pairs).join('|')})\\b`, 'gi'))];
    if (hits.length !== 1) return null;
    const word = hits[0][0];
    const at = m.start + hits[0].index!;
    const other = pairs[word.toLowerCase()];
    return { before: s.en.slice(0, at), after: s.en.slice(at + word.length), answer: word.toLowerCase(), choices: shuffle2(word.toLowerCase(), other, s.id) };
  };
}

/** Ordre des choix fixé par la phrase (même ordre à chaque fois, sans biais de position). */
function shuffle2(a: string, b: string, seed: number): string[] {
  return seed % 2 ? [a, b] : [b, a];
}

const ADVERBS = /^(?:first|never|always|just|also|still|often|ever|only|even|already|sometimes|usually|soon|then|again|all|both)$/;

/** Verbe juste après « mot de liaison + sujet » (if it rains, when you arrive), avec la forme concurrente. */
function clauseVerb(pointId: string, links: string, kind: 'present' | 'past'): Builder {
  const re = new RegExp(`\\b(?:${links})\\s+([a-z]+)\\s+([a-z]+)\\b`, 'i');
  return (s, known) => {
    if (!single(pointId, s.en)) return null;
    const m = re.exec(s.en);
    if (!m) return null;
    const [, subject, verb] = m;
    const v = verb.toLowerCase();
    if (/^(?:will|would|won|wouldn|can|could|may|might|must|should|do|does|did|don|doesn|didn|not)$/.test(v)) return null;
    // « if you don't hurry », « when I really need » : pas un verbe seul dans le trou.
    if (s.en[m.index + m[0].length] === "'" || ADVERBS.test(v) || v.endsWith('ly')) return null;
    // Contexte passé (« Tom was there when I needed ») : hors sujet pour « présent après when, pas will ».
    if (kind === 'present' && /\b(?:was|were|did|had|used|didn't|wasn't|weren't)\b/i.test(s.en)) return null;
    if (kind === 'present' && /^(?:have|had|is|am|are|was|were)$/.test(v)) return null;
    // « if I had known » : conditionnel passé, pas un prétérit d'irréel.
    if (kind === 'past' && v === 'had' && /^\s+(?:[a-z]+ed|been|known|seen|done|gone|taken|given|had)\b/i.test(s.en.slice(m.index + m[0].length))) return null;
    if (!/^(?:i|you|he|she|it|we|they)$/i.test(subject)) return null;
    let base: string | null;
    let other: string;
    if (kind === 'present') {
      // Forme passée (« came », « played ») : pas un présent. « come », « put » sont aussi des bases.
      if (/ed$/.test(v) || (BASE_OF.has(v) && BASE_OF.get(v) !== v)) return null;
      base = SUBJECTS_3RD.test(subject) ? baseOfPresent(v) : v;
      if (SUBJECTS_3RD.test(subject) && !v.endsWith('s')) return null;
      other = `will ${base}`;
    } else {
      base = v === 'was' || v === 'were' ? 'be' : baseOf(v, known);
      if (!base) return null;
      other = `would ${base}`;
    }
    const at = m.index + m[0].length - verb.length;
    return { before: s.en.slice(0, at), after: s.en.slice(at + verb.length), answer: v, hint: base, choices: shuffle2(v, other, s.id) };
  };
}

/** Present perfect ou prétérit : choisir entre les deux formes du même verbe. */
const perfectOrPast: Builder = (s, known) => {
  const pp = single('present-perfect', s.en);
  const marker = /\b(?:yesterday|ago|last\s+(?:week|month|year|night|summer)|in\s+(?:19|20)\d\d|when\s+(?:i|he|she|we|they)\s+was|this\s+(?:morning|week|year)|ever|never|yet(?=\s*[.?!]$)|already|just|so\s+far)\b/i;
  if (!marker.test(s.en)) return null;
  if (pp) {
    const w = words(s.en.slice(pp.start, pp.end));
    if (w.length !== 2 || !/^(?:have|has)$/i.test(w[0])) return null;
    const base = baseOf(w[1], known);
    if (!base) return null;
    const answer = `${w[0].toLowerCase()} ${w[1].toLowerCase()}`;
    return { before: s.en.slice(0, pp.start), after: s.en.slice(pp.end), answer, hint: base, choices: shuffle2(answer, pastOf(base), s.id) };
  }
  const past = single('past-simple-irregular', s.en) ?? single('past-simple-regular', s.en);
  if (!past) return null;
  const w = words(s.en.slice(past.start, past.end));
  if (w.length !== 2) return null;
  const [subject, verb] = w;
  // « She had already gone » : plus-que-parfait, pas un prétérit.
  if (/^had$/i.test(verb) && /^\s+(?:already\s+|just\s+|never\s+)?(?:[a-z]+ed|been|gone|done|seen|known|taken|given|left|come|got|gotten)\b/i.test(s.en.slice(past.end))) return null;
  const base = baseOf(verb, known);
  if (!base || !/(?:yesterday|ago|last|in\s+(?:19|20)\d\d|when)/i.test(s.en)) return null;
  const aux = SUBJECTS_3RD.test(subject) ? 'has' : 'have';
  const at = past.start + subject.length + 1;
  return { before: s.en.slice(0, at), after: s.en.slice(past.end), answer: verb.toLowerCase(), hint: base, choices: shuffle2(verb.toLowerCase(), `${aux} ${participleOf(base)}`, s.id) };
};

/** Used to + verbe : choisir entre « used to go » et « was used to going ». */
const usedTo: Builder = (s) => {
  const m = single('used-to', s.en);
  if (!m) return null;
  const w = words(s.en.slice(m.start, m.end));
  if (w.length !== 3) return null;
  const verb = w[2].toLowerCase();
  if (BASE_OF.has(verb) || /(?:ed|ing|s|ly)$/.test(verb)) return null;
  const before = s.en.slice(0, m.start);
  // « I'm not used to hard work » : « be used to », l'autre point.
  if (/(?:\b(?:am|is|are|was|were|be|been|get|got|getting)|'m|'re|'s)(?:\s+not)?\s*$/i.test(before)) return null;
  const subject = /\b([a-z]+)\s*$/i.exec(before)?.[1] ?? '';
  if (!subject) return null;
  const be = /^(?:you|we|they|people)$/i.test(subject) || (/[^s]s$/.test(subject) && !SUBJECTS_3RD.test(subject)) ? 'were' : 'was';
  const answer = `used to ${verb}`;
  return { before, after: s.en.slice(m.end), answer, choices: shuffle2(answer, `${be} used to ${ingOf(verb)}`, s.id) };
};

/** Fabrique de chaque leçon. */
export const BUILDERS: Record<string, Builder> = {
  'present-perfect': auxParticiple('present-perfect', /^(?:have|has|'ve|'s)$/i),
  'perfect-vs-past': perfectOrPast,
  'for-since': choiceWord('for-since', { for: 'since', since: 'for' }),
  'past-perfect': auxParticiple('past-perfect', /^(?:had|'d)$/i),
  'used-to': usedTo,
  'first-conditional': clauseVerb('first-conditional', 'if|unless', 'present'),
  'second-conditional': clauseVerb('second-conditional', 'if', 'past'),
  'time-clauses': clauseVerb('time-clauses', 'when|as soon as|until|before|after', 'present'),
  passive: auxParticiple('passive', /^(?:is|are|was|were|am)$/i),
  'say-tell': choiceWord('say-tell', { say: 'tell', tell: 'say', says: 'tells', tells: 'says', said: 'told', told: 'said', saying: 'telling', telling: 'saying' }),
};

/** Exercice d'une leçon à partir d'une phrase, ou null si la phrase ne convient pas. */
export function buildExercise(lessonId: string, s: SourceSentence, known?: (w: string) => boolean): Exercise | null {
  const builder = BUILDERS[lessonId];
  if (!builder || !usable(s)) return null;
  const ex = builder(s, known);
  if (!ex || !ex.answer || !ex.before.trim() && !ex.after.trim()) return null;
  return { id: `${lessonId}:${s.id}`, en: s.en, fr: s.fr, ...ex };
}

/** Phrase affichée avec le trou. */
export function withBlank(ex: Exercise): string {
  return `${ex.before}___${ex.after}`;
}

