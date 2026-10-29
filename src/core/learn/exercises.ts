import irregular from './irregular-verbs.json';
import { matchSentence } from './patterns';

/**
 * Exercices de grammaire tirés de phrases réelles (Tatoeba, avec leur traduction française).
 * La phrase est coupée autour de la forme travaillée : on tape la forme (verbe donné entre parenthèses), ou on
 * choisit entre deux formes. La traduction française sert d'indice : elle lève l'ambiguïté du trou.
 *
 * Une règle simple (« jamais will », « toujours le prétérit ») ne doit pas suffire : chaque exercice porte la nature
 * de sa bonne réponse (`form`), et banques et séances alternent les natures, à parts à peu près égales.
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
  /** Autres réponses justes (le prétérit après after / before, au lieu du plus-que-parfait). */
  accept?: string[];
  /** Indice entre parenthèses (verbe à la base). */
  hint?: string;
  /** Exercice à choix : les formes proposées (dont la réponse), dans l'ordre d'affichage. */
  choices?: string[];
  /** Nature de la bonne réponse (« will », « present », « past »…) : les séances alternent les natures. */
  form?: string;
}

export interface SourceSentence {
  id: number;
  en: string;
  fr: string;
}

type Known = (w: string) => boolean;

/* --------------------------------------------------------------- verbes --- */

const verbs = (irregular as { verbs: { base: string; past: string[]; participle: string[] }[] }).verbs;
const BASE_OF = new Map<string, string>();
const PAST_OF = new Map<string, string>();
const PARTICIPLE_OF = new Map<string, string>();
const IRREGULAR_BASES = new Set<string>();
for (const v of verbs) {
  for (const f of [...v.past, ...v.participle]) if (!BASE_OF.has(f)) BASE_OF.set(f, v.base);
  PAST_OF.set(v.base, v.past[0]);
  PARTICIPLE_OF.set(v.base, v.participle[0]);
  IRREGULAR_BASES.add(v.base);
}
BASE_OF.set('was', 'be').set('were', 'be');

/** Formes en -ed que les règles devinent mal, ou qui ne sont pas des verbes au passé (null). */
// prettier-ignore
const REGULAR_EXCEPTIONS: Record<string, string | null> = {
  added: 'add', used: 'use', pleased: 'please', wasted: 'waste', owed: 'owe', tasted: 'taste', pasted: 'paste', ceased: 'cease', released: 'release',
  naked: null, wicked: null, sacred: null, beloved: null, crooked: null, rugged: null, hundred: null, kindred: null, red: null, bed: null, shed: null,
  need: null, feed: null, bleed: null, breed: null, speed: null, seed: null, weed: null, heed: null, deed: null, exceed: null, succeed: null, proceed: null, indeed: null,
};

/** Base verbale d'une forme passée ou d'un participe (« went » → « go », « stopped » → « stop »). `known` : liste de mots. */
export function baseOf(form: string, known?: Known): string | null {
  const w = form.toLowerCase();
  const irr = BASE_OF.get(w);
  if (irr) return irr;
  if (w in REGULAR_EXCEPTIONS) return REGULAR_EXCEPTIONS[w];
  if (!w.endsWith('ed') || w.length < 4) return null;
  if (w.endsWith('eed')) return w.slice(0, -1); // agreed → agree, freed → free
  const stem = w.slice(0, -2);
  const candidates = [w.endsWith('ied') ? `${w.slice(0, -3)}y` : null, /([b-df-hj-np-tv-z])\1$/.test(stem) ? stem.slice(0, -1) : null, `${stem}e`, stem].filter(
    (c): c is string => !!c && c.length >= 2,
  );
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

/**
 * Prétérit d'une base (régulier ou irrégulier). La consonne finale se double après une voyelle simple accentuée
 * (stop → stopped, commit → committed) : avec la liste de mots, on garde la forme doublée si elle y figure ; sans
 * elle, on ne double que les verbes d'une syllabe. Un distracteur mal écrit (« stoped ») trahirait la réponse.
 */
export function pastOf(base: string, known?: Known): string {
  const irr = PAST_OF.get(base);
  if (irr) return irr.split('/')[0];
  if (base.endsWith('e')) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  if (/[^aeiou][aeiou][b-df-hj-np-tv-z]$/.test(base) && !/[wxy]$/.test(base)) {
    const doubled = `${base}${base.at(-1)}ed`;
    if (known) return known(doubled) ? doubled : `${base}ed`;
    if (/^[^aeiou]*[aeiou][b-df-hj-np-tv-z]$/.test(base)) return doubled;
  }
  return `${base}ed`;
}

/** Participe passé d'une base. */
export function participleOf(base: string, known?: Known): string {
  return PARTICIPLE_OF.get(base)?.split('/')[0] ?? pastOf(base, known);
}

/** Forme en -ing (« go » → « going », « make » → « making », « stop » → « stopping »). */
export function ingOf(base: string): string {
  if (base.endsWith('ie')) return `${base.slice(0, -2)}ying`;
  if (base.endsWith('e') && !base.endsWith('ee') && base !== 'be') return `${base.slice(0, -1)}ing`;
  if (/^[^aeiou]*[aeiou][b-df-hj-np-tv-z]$/.test(base) && !/[wxy]$/.test(base)) return `${base}${base.at(-1)}ing`;
  return `${base}ing`;
}

/** Noms et mots en -ing qui ne sont pas des formes verbales (« used to the morning »). */
const NOT_ING =
  /^(?:nothing|something|anything|everything|thing|morning|evening|king|ring|spring|sing|bring|sting|swing|wing|ceiling|ping|during|darling|pudding|wedding|building|clothing|meeting|feeling|ending|beginning|painting|reading|writing|cooking|shopping|camping|parking|housing|training|warning|savings|earring|kidding)$/;

/** Base d'une forme en -ing (« working » → « work », « making » → « make », « getting » → « get »). */
export function baseOfIng(form: string, known?: Known): string | null {
  const w = form.toLowerCase();
  if (w === 'being') return 'be';
  if (!w.endsWith('ing') || w.length < 5) return null;
  const stem = w.slice(0, -3);
  const reduced = /([b-df-hj-np-tv-z])\1$/.test(stem) ? stem.slice(0, -1) : null; // getting → get
  const ie = stem.length <= 2 && stem.endsWith('y') ? `${stem.slice(0, -1)}ie` : null; // dying → die
  if (known) {
    // La bonne base est connue et redonne la forme (hoping → hope, pas hop).
    const order = [reduced, ie, stem, `${stem}e`].filter((c): c is string => !!c && c.length >= 2);
    return order.find((c) => known(c) && ingOf(c) === w) ?? order.find(known) ?? null;
  }
  if (reduced && !/(?:ss|ll|ff|zz)$/.test(stem)) return reduced;
  if (ie) return ie;
  const withE =
    (/[^aeiou][aeiou][bcdgkmnprstvz]$/.test(stem) && stem.length <= 4) || /(?:v|z|u|c|dg|rg)$/.test(stem) || /^[aeiou][b-df-hj-np-tv-z]$/.test(stem);
  return withE ? `${stem}e` : stem; // making → make, living → live, using → use
}

const THIRD_PERSON = /^(?:he|she|it|this|that|there|everyone|someone|nobody|everybody|somebody|one)$/i;

/** Le sujet appelle-t-il un verbe à la 3e personne du singulier ? (pronoms, noms propres, noms singuliers) */
function isThird(subject: string): boolean {
  if (/^(?:i|you|we|they|people|these|those|children|men|women|police|feet|teeth|mice|geese|both|many|few|several)$/i.test(subject)) return false;
  if (THIRD_PERSON.test(subject)) return true;
  return !/[^su]s$/i.test(subject); // « my parents » : pluriel ; « Tom », « the boss » : singulier
}

/** Présent d'une base pour un sujet (« rain », it → « rains » ; « be », I → « am »). */
export function presentOf(base: string, subject: string): string {
  if (base === 'be') return /^i$/i.test(subject) ? 'am' : isThird(subject) ? 'is' : 'are';
  if (!isThird(subject)) return base;
  if (base === 'have') return 'has';
  if (/(?:s|sh|ch|x|z|o)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
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
  return s
    .replace(/cannot/g, 'can not')
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** La réponse tapée est-elle juste ? (contractions acceptées dans les deux sens, et les autres réponses admises) */
export function isCorrect(ex: Exercise, typed: string): boolean {
  const targets = [ex.answer, ...(ex.accept ?? [])].map((a) => normalizeAnswer(a));
  return [undefined, 'had', 'would', 'has', 'is'].some((alt) =>
    targets.includes(normalizeAnswer(typed, { d: alt === 'had' || alt === 'would' ? alt : undefined, s: alt === 'has' || alt === 'is' ? alt : undefined })),
  );
}

/* ---------------------------------------------------------- découpage --- */

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

type Candidate = Omit<Exercise, 'id' | 'en' | 'fr'>;
type Builder = (s: SourceSentence, known?: Known) => (Candidate | null)[];

/** Ordre des choix fixé par la phrase (même ordre à chaque fois, sans biais de position). */
function shuffle2(a: string, b: string, seed: number): string[] {
  return seed % 2 ? [a, b] : [b, a];
}

const ADVERBS =
  /^(?:first|never|always|just|also|still|often|ever|only|even|already|sometimes|usually|soon|then|again|all|both|really|not|regularly|probably|certainly)$/;
const NOT_VERBS =
  /^(?:i|you|he|she|it|we|they|me|him|her|us|them|the|a|an|this|that|there|here|rather|better|so|to|when|if|and|but|or|what|where|how|why|who|which|in|on|at|for|with|of|from|by|as|up|out|my|your|his|our|their)$/;

/** Mot plausible comme base verbale (pas un adverbe, un pronom, une forme fléchie) ; vérifié par la liste de mots. */
function plausibleBase(v: string, known?: Known): boolean {
  if (v === 'be') return true;
  if (NOT_VERBS.test(v) || ADVERBS.test(v) || /(?:ed|ing|ly)$/.test(v)) return false;
  if (BASE_OF.has(v) && BASE_OF.get(v) !== v && !IRREGULAR_BASES.has(v)) return false; // went, taken
  if (IRREGULAR_BASES.has(v)) return true;
  return !known || known(ingOf(v)) || known(pastOf(v, known));
}

/** Traductions françaises au conditionnel (je ferais, il pourrait…) et au futur (j'arriverai, il viendra…). */
const FR_CONDITIONAL = /\b[a-zàâçéèêëîïôûù]{2,}r(?:ais|ait|ions|iez|aient)\b/i;
const FR_FUTURE = /\b[a-zàâçéèêëîïôûù]{2,}r(?:ai|as|a|ons|ez|ont)\b/i;

/* ---------------------------------------------- auxiliaire + participe --- */

/** Modal juste avant (should've, would never have, I'd have, I'll have) : conditionnel ou futur passé. */
const MODAL_BEFORE = /(?:\b(?:would|could|should|might|must|may|will|can|to)(?:n't)?(?:\s+never|\s+not)?|'d|'ll)\s*$/i;
/** Auxiliaire du plus-que-parfait français (j'avais vu, elle était partie). */
const FR_PLUPERFECT =
  /(?<![a-zà-ÿ])(?:av(?:ais|ait|ions|iez|aient)|ét(?:ais|ait|ions|iez|aient)|eu(?:s|t|mes|tes|rent)|fu(?:s|t|rent))\s+(?:(?:déjà|pas|jamais|bien|tout|plus|toujours|rien|été|beaucoup)\s+)*(?!(?:toi|moi|lui|ici|aussi|ainsi|si|parmi)\b)[a-zàâçéèêëîïôûù]*(?:é|ée|és|ées|i|ie|is|it|u|ue|us|ues|ert|erte|ort|orte|int|ainte|ait|aite)(?![a-zà-ÿ])/i;

/** Participes qui décrivent un état (we were hurt, everything is closed), pas une action subie : hors du passif. */
const STATE_PARTICIPLES = new Set(
  (
    'shocked surprised interested scared tired worried bored excited pleased disappointed satisfied amazed annoyed confused embarrassed ' +
    'frightened terrified delighted depressed exhausted disgusted impressed upset thrilled stunned puzzled relieved ashamed convinced determined ' +
    'obsessed concerned married divorced engaged dressed drunk lost gone done finished supposed located situated used allowed required related ' +
    'involved prepared crowded intrigued overwhelmed distressed outraged displeased dazed spoiled spoilt qualified entitled acquainted ' +
    'accustomed opposed devoted dedicated retired mistaken mixed absorbed amused astonished bewildered alarmed horrified insulted irritated ' +
    'offended stuck swollen cramped fed known'
  ).split(' '),
);
/** État, sauf si l'auteur de l'action suit (the road was closed by the police). */
const STATE_UNLESS_BY = new Set(
  'hurt closed covered broken filled injured damaged opened locked packed stained wounded flooded polluted equipped decorated'.split(' '),
);

/** Forme verbale « auxiliaire + participe », à taper, verbe à la base en indice. */
function auxParticiple(pointId: string, auxes: RegExp, options: { passive?: boolean; pastAccepted?: boolean } = {}): Builder {
  return (s, known) => {
    const m = single(pointId, s.en);
    if (!m) return [];
    // « I've said » : le motif commence à « 've », qui fait partie de la forme à trouver.
    const span = s.en.slice(m.start, m.end);
    const w = words(span);
    if (w.length !== 2 || !auxes.test(w[0])) return []; // pas d'adverbe au milieu (never, already…) : trou net
    const participle = w[1].toLowerCase();
    const base = baseOf(participle, known);
    if (!base) return [];
    const after = s.en.slice(m.end);
    if (
      options.passive &&
      (STATE_PARTICIPLES.has(participle) || (STATE_UNLESS_BY.has(participle) && !/^\s+by\b/i.test(after)) || /^\s+(?:of|from)\b/i.test(after))
    )
      return []; // made of wood
    let before = s.en.slice(0, m.start);
    // « should've set », « I'd have won » : conditionnel passé, pas un present perfect.
    if (MODAL_BEFORE.test(before)) return [];
    // « I had shut up if I were you » (pour I'd shut up) : la traduction doit avoir un plus-que-parfait.
    if (options.pastAccepted && !FR_PLUPERFECT.test(s.fr)) return [];
    // « I've said » → « I [have said] » : l'espace manquant avant la forme développée.
    if (span.startsWith("'")) before += ' ';
    const answer = normalizeAnswer(span, { d: 'had', s: 'has' });
    // Après after / before / as soon as, l'ordre des faits est clair : le prétérit est juste aussi (règle 5).
    // Seulement la conjonction suivie d'un sujet (« before he entered ») : « the day before », « as if », « if only »
    // gardent le plus-que-parfait.
    const ordered = /\b(?:after|before|as soon as)\s+(?:i|you|he|she|it|we|they|[A-Z][a-z]+)\s+[a-z]+/.test(s.en) && !/\b(?:if|wish|though)\b/i.test(s.en);
    const accept = options.pastAccepted && ordered ? (base === 'be' ? ['was', 'were'] : [pastOf(base, known)]) : undefined;
    return [{ before, after, answer, hint: base, ...(accept ? { accept } : {}) }];
  };
}

/** Un mot à choisir parmi des formes concurrentes. */
function choiceWord(pointId: string, pairs: Record<string, string>): Builder {
  return (s) => {
    const m = single(pointId, s.en);
    if (!m) return [];
    const hits = [...s.en.slice(m.start, m.end).matchAll(new RegExp(`\\b(?:${Object.keys(pairs).join('|')})\\b`, 'gi'))];
    if (hits.length !== 1) return [];
    const word = hits[0][0];
    const at = m.start + hits[0].index!;
    const other = pairs[word.toLowerCase()];
    return [{ before: s.en.slice(0, at), after: s.en.slice(at + word.length), answer: word.toLowerCase(), choices: shuffle2(word.toLowerCase(), other, s.id) }];
  };
}

/* ------------------------------------------- conditionnels, subordonnées --- */

/** Verbe juste après « mot de liaison + sujet » (if it rains, when you arrive), avec la forme concurrente. */
function clauseVerb(pointId: string, links: string, kind: 'present' | 'past'): Builder {
  const re = new RegExp(`\\b(?:${links})\\s+([a-z]+)\\s+([a-z]+)\\b`, 'i');
  return (s, known) => {
    if (!single(pointId, s.en)) return [];
    const m = re.exec(s.en);
    if (!m) return [];
    const [, subject, verb] = m;
    const v = verb.toLowerCase();
    if (/^(?:will|would|won|wouldn|can|could|may|might|must|should|do|does|did|don|doesn|didn|not)$/.test(v)) return [];
    // « if you don't hurry », « when I really need » : pas un verbe seul dans le trou.
    if (s.en[m.index + m[0].length] === "'" || ADVERBS.test(v) || v.endsWith('ly')) return [];
    if (kind === 'present' && /^(?:have|had|is|am|are|was|were)$/.test(v)) return [];
    // « if I had known » : conditionnel passé, pas un prétérit d'irréel.
    if (kind === 'past' && v === 'had' && /^\s+(?:[a-z]+ed|been|known|seen|done|gone|taken|given|had)\b/i.test(s.en.slice(m.index + m[0].length))) return [];
    if (!/^(?:i|you|he|she|it|we|they)$/i.test(subject)) return [];
    let base: string | null;
    let other: string;
    if (kind === 'present') {
      // Forme passée (« came », « played ») : pas un présent. « come », « put » sont aussi des bases.
      if (/ed$/.test(v) || (BASE_OF.has(v) && BASE_OF.get(v) !== v)) return [];
      base = THIRD_PERSON.test(subject) ? baseOfPresent(v) : v;
      if (THIRD_PERSON.test(subject) && !v.endsWith('s')) return [];
      other = `will ${base}`;
    } else {
      base = v === 'was' || v === 'were' ? 'be' : baseOf(v, known);
      if (!base) return [];
      other = `would ${base}`;
    }
    const at = m.index + m[0].length - verb.length;
    return [{ before: s.en.slice(0, at), after: s.en.slice(at + verb.length), answer: v, hint: base, choices: shuffle2(v, other, s.id), form: kind }];
  };
}

/**
 * Le trou dans la principale : « If it rains, we [will stay] home » (will stay / stay), « I [would buy] a car if… »
 * (would buy / bought). Le modal doit être hors de la subordonnée (avant le mot de liaison, ou après la virgule qui
 * la ferme), et seul de son espèce dans la phrase.
 */
function mainModal(links: string, modal: 'will' | 'would'): Builder {
  const link = new RegExp(`\\b(?:${links})\\b`, 'i');
  const any = modal === 'will' ? /\b(?:will|won't|shall)\b|'ll\b/gi : /\b(?:would|wouldn't)\b|'d\b/gi;
  const re = modal === 'will' ? /\b([A-Za-z]+)(\s+will|'ll)\s+([a-z]+)\b/ : /\b([A-Za-z]+)(\s+would|'d)\s+([a-z]+)\b/;
  return (s, known) => {
    if ((s.en.match(any) ?? []).length !== 1) return [];
    const l = link.exec(s.en);
    const m = re.exec(s.en);
    if (!l || !m) return [];
    const at = m.index + m[1].length;
    const inMain = at < l.index || s.en.slice(l.index, at).includes(',');
    if (!inMain) return [];
    const subject = m[1];
    const v = m[3].toLowerCase();
    if (!plausibleBase(v, known)) return [];
    // « will have finished », « would have told » : futur antérieur, 3e conditionnel.
    const next = /^\s+([a-z]+)/i.exec(s.en.slice(m.index + m[0].length))?.[1]?.toLowerCase() ?? '';
    if (v === 'have' && (/(?:ed|en|wn)$/.test(next) || (BASE_OF.has(next) && BASE_OF.get(next) !== next))) return [];
    if (NOT_VERBS.test(subject.toLowerCase()) && !/^(?:i|you|he|she|it|we|they|there)$/i.test(subject)) return [];
    const answer = `${modal} ${v}`;
    const other = modal === 'will' ? presentOf(v, subject) : v === 'be' ? (isThird(subject) || /^i$/i.test(subject) ? 'was' : 'were') : pastOf(v, known);
    const before = s.en.slice(0, at) + ' ';
    return [{ before, after: s.en.slice(m.index + m[0].length), answer, hint: v, choices: shuffle2(answer, other, s.id), form: modal }];
  };
}

/** Principale au futur ou à l'impératif : sans elle, « when I kiss you, I forget » est une vérité générale, sans calque. */
const IMPERATIVE_START =
  /^(?:please|don't|do|let's|let|never|always|just|call|tell|wait|give|come|go|take|make|get|keep|stay|phone|write|send|bring|ask|turn|stop|look|try|remember|be|put|leave|bear|cover|see|read|hold|sit|stand|close|open|wash|eat|drink|help|show|wake|pay|think|have)$/i;

function futureOrImperative(en: string, linkIndex: number, known?: Known): boolean {
  if (/\b(?:will|won't|shall|going to)\b|'ll\b/i.test(en)) return true;
  // Principale en tête (« Phone me when… ») ou après la subordonnée (« When you see him, tell him… »).
  const main = linkIndex === 0 ? (en.split(',')[1] ?? '') : en.slice(0, linkIndex);
  const [first, next = ''] = main.trim().split(/\s+/);
  if (!first) return false;
  const w = first.toLowerCase().replace(/[^a-z']/g, '');
  if (/^(?:is|are|was|were|has|have|does|do|can|will|[a-z]+s)$/i.test(next) && !/^(?:us|this|his|its)$/i.test(next)) return false; // « Water boils », « Love is »
  if (IMPERATIVE_START.test(w)) return true;
  return !!known && !NOT_VERBS.test(w) && known(ingOf(w)) && /^[A-Z]/.test(first) && !/^[A-Z][a-z]+$/.test(next);
}

/** Subordonnée de temps : la version de base exige une principale au futur ou à l'impératif. */
function timeClause(links: string): Builder {
  const sub = clauseVerb('time-clauses', links, 'present');
  const main = mainModal(links, 'will');
  const link = new RegExp(`\\b(?:${links})\\b`, 'i');
  return (s, known) => {
    const l = link.exec(s.en);
    if (!l || !futureOrImperative(s.en, l.index, known)) return [];
    // « after a bath » : préposition, pas une subordonnée ; le motif exige un sujet et un verbe après le mot de liaison.
    if (!matchSentence('time-clauses', s.en.replace(/’/g, "'")).length) return [];
    return [...sub(s, known), ...main(s, known)];
  };
}

/**
 * Les cas où will est juste après when, que la leçon cite : la question (When will you arrive?) et la question
 * indirecte (I don't know when he'll arrive), dont la traduction est au futur.
 */
const whenQuestion: Builder = (s, known) => {
  const direct = /^(\s*When\s+)will\s+([A-Za-z]+)\s+([a-z]+)\b(?=[^?]*\?\s*$)/.exec(s.en);
  if (direct) {
    const [, lead, subject, verb] = direct;
    if (!/^(?:i|you|he|she|it|we|they|[A-Z][a-z]+)$/.test(subject) || !plausibleBase(verb, known)) return [];
    const answer = `will ${subject} ${verb}`;
    return [
      { before: lead, after: s.en.slice(direct[0].length), answer, choices: shuffle2(answer, `${subject} ${presentOf(verb, subject)}`, s.id), form: 'will' },
    ];
  }
  const indirect =
    /\b(?:know|knows|wonder|wondering|ask|asking|sure|idea|tell me|tell you|decide|find out|guess)\s+when\s+([A-Za-z]+)(\s+will|'ll)\s+([a-z]+)\b/di.exec(s.en);
  if (!indirect || !FR_FUTURE.test(s.fr)) return [];
  const [, subject, , verb] = indirect;
  if (!/^(?:i|you|he|she|it|we|they|[A-Z][a-z]+)$/.test(subject) || !plausibleBase(verb, known)) return [];
  const at = indirect.indices![2][0];
  const answer = `will ${verb}`;
  return [
    {
      before: `${s.en.slice(0, at)} `,
      after: s.en.slice(indirect.index + indirect[0].length),
      answer,
      hint: verb,
      choices: shuffle2(answer, presentOf(verb, subject), s.id),
      form: 'will',
    },
  ];
};

/* ------------------------------------------------ prétérit, used to --- */

const PAST_MOMENT =
  /\b(?:yesterday|ago|last\s+(?:week|month|year|night|summer|winter|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+(?:19|20)\d\d|when\s+(?:i|he|she|we|they)\s+w(?:as|ere))\b/i;

/** Present perfect ou prétérit : choisir entre les deux formes du même verbe. */
const perfectOrPast: Builder = (s, known) => {
  const pp = single('present-perfect', s.en);
  const marker =
    /\b(?:yesterday|ago|last\s+(?:week|month|year|night|summer)|in\s+(?:19|20)\d\d|when\s+(?:i|he|she|we|they)\s+was|this\s+(?:morning|week|year)|ever|never|yet(?=\s*[.?!]$)|already|just|so\s+far)\b/i;
  if (!marker.test(s.en)) return [];
  if (pp) {
    const w = words(s.en.slice(pp.start, pp.end));
    if (w.length !== 2 || !/^(?:have|has)$/i.test(w[0])) return [];
    const base = baseOf(w[1], known);
    if (!base || MODAL_BEFORE.test(s.en.slice(0, pp.start))) return [];
    const answer = `${w[0].toLowerCase()} ${w[1].toLowerCase()}`;
    return [
      { before: s.en.slice(0, pp.start), after: s.en.slice(pp.end), answer, hint: base, choices: shuffle2(answer, pastOf(base, known), s.id), form: 'perfect' },
    ];
  }
  const past = single('past-simple-irregular', s.en) ?? single('past-simple-regular', s.en);
  if (!past) return [];
  const w = words(s.en.slice(past.start, past.end));
  if (w.length !== 2) return [];
  const [subject, verb] = w;
  if (/^used$/i.test(verb) && /^\s+to\b/i.test(s.en.slice(past.end))) return []; // used to : l'autre leçon
  // « She had already gone » : plus-que-parfait, pas un prétérit.
  if (
    /^had$/i.test(verb) &&
    /^\s+(?:already\s+|just\s+|never\s+)?(?:[a-z]+ed|been|gone|done|seen|known|taken|given|left|come|got|gotten)\b/i.test(s.en.slice(past.end))
  )
    return [];
  const base = baseOf(verb, known);
  if (!base || !/(?:yesterday|ago|last|in\s+(?:19|20)\d\d|when)/i.test(s.en)) return [];
  const aux = THIRD_PERSON.test(subject) ? 'has' : 'have';
  const at = past.start + subject.length + 1;
  return [
    {
      before: s.en.slice(0, at),
      after: s.en.slice(past.end),
      answer: verb.toLowerCase(),
      hint: base,
      choices: shuffle2(verb.toLowerCase(), `${aux} ${participleOf(base, known)}`, s.id),
      form: 'past',
    },
  ];
};

/**
 * Used to, contre ses deux voisins de la règle 5 : be used to + -ing (avoir l'habitude) et le prétérit d'un seul
 * événement daté (I went to Rome last year).
 */
const usedTo: Builder = (s, known) => {
  const out: (Candidate | null)[] = [];
  const habit = /\bused\s+to\s+((?:(?:often|never|always|usually|sometimes|really|just|also|even|not|still|regularly)\s+)?)([a-z]+)\b/i.exec(s.en);
  if (habit) {
    const before = s.en.slice(0, habit.index);
    const [, adverb, verb] = habit;
    const v = verb.toLowerCase();
    // « I'm not used to hard work », « get used to it » : be / get used to, pas used to.
    const beUsed = /(?:\b(?:am|is|are|was|were|be|been|get|gets|got|getting)|'m|'re|'s)(?:\s+not)?\s*$/i.test(before);
    const subject = /\b([a-z]+)\s*$/i.exec(before)?.[1] ?? '';
    if (!beUsed && subject && plausibleBase(v, known) && (s.en.match(/\bused\s+to\b/gi) ?? []).length === 1) {
      const answer = `used to ${adverb}${v}`;
      const be = /^(?:you|we|they|people)$/i.test(subject) || (!isThird(subject) && !/^i$/i.test(subject)) ? 'were' : 'was';
      out.push({
        before,
        after: s.en.slice(habit.index + habit[0].length),
        answer,
        choices: shuffle2(answer, `${be} used to ${adverb}${ingOf(v)}`, s.id),
        form: 'used-to',
      });
    }
  }
  const accustomed = /(\b(?:am|is|are|was|were|be|been|get|gets|got|getting)|'m|'re|'s)((?:\s+not)?\s+)used\s+to\s+([a-z]+ing)\b/i.exec(s.en);
  if (accustomed && !NOT_ING.test(accustomed[3].toLowerCase())) {
    const ing = accustomed[3].toLowerCase();
    const base = baseOfIng(ing, known);
    const at = accustomed.index + accustomed[1].length + accustomed[2].length;
    if (base && base !== ing && plausibleBase(base, known)) {
      const answer = `used to ${ing}`;
      out.push({
        before: s.en.slice(0, at),
        after: s.en.slice(accustomed.index + accustomed[0].length),
        answer,
        choices: shuffle2(answer, `used to ${base}`, s.id),
        form: 'be-used-to',
      });
    }
  }
  // Un seul événement daté, sans idée d'habitude : prétérit.
  if (!out.length && PAST_MOMENT.test(s.en) && !/\b(?:used|every|often|always|usually|would)\b/i.test(s.en)) {
    const past = single('past-simple-irregular', s.en) ?? single('past-simple-regular', s.en);
    const w = past ? words(s.en.slice(past.start, past.end)) : [];
    if (past && w.length === 2 && !/^(?:was|were|had|did)$/i.test(w[1])) {
      const base = baseOf(w[1], known);
      if (base && plausibleBase(base, known)) {
        const at = past.start + w[0].length + 1;
        const answer = w[1].toLowerCase();
        out.push({
          before: s.en.slice(0, at),
          after: s.en.slice(past.end),
          answer,
          hint: base,
          choices: shuffle2(answer, `used to ${base}`, s.id),
          form: 'past',
        });
      }
    }
  }
  return out;
};

/* ------------------------------------------------------------ leçons --- */

const firstConditional: Builder = (s, known) => [
  ...clauseVerb('first-conditional', 'if|unless', 'present')(s, known),
  ...mainModal('if|unless', 'will')(s, known),
];

/** Le 2e conditionnel exige une traduction au conditionnel : « je l'achèterai » serait un 1er conditionnel. */
const secondConditional: Builder = (s, known) =>
  FR_CONDITIONAL.test(s.fr) ? [...clauseVerb('second-conditional', 'if', 'past')(s, known), ...mainModal('if', 'would')(s, known)] : [];

const TIME_LINKS = 'when|as soon as|until|before|after';

/** Fabrique de chaque leçon : les variantes possibles d'une phrase. */
export const BUILDERS: Record<string, Builder> = {
  'present-perfect': auxParticiple('present-perfect', /^(?:have|has|'ve|'s)$/i),
  'perfect-vs-past': perfectOrPast,
  'for-since': choiceWord('for-since', { for: 'since', since: 'for' }),
  'past-perfect': auxParticiple('past-perfect', /^(?:had|'d)$/i, { pastAccepted: true }),
  'used-to': usedTo,
  'first-conditional': firstConditional,
  'second-conditional': secondConditional,
  'time-clauses': (s, known) => [...timeClause(TIME_LINKS)(s, known), ...whenQuestion(s, known)],
  passive: auxParticiple('passive', /^(?:is|are|was|were|am)$/i, { passive: true }),
  'say-tell': choiceWord('say-tell', {
    say: 'tell',
    tell: 'say',
    says: 'tells',
    tells: 'says',
    said: 'told',
    told: 'said',
    saying: 'telling',
    telling: 'saying',
  }),
};

/**
 * Exercice d'une leçon à partir d'une phrase, ou null si la phrase ne convient pas. Quand la phrase permet plusieurs
 * variantes (trou dans la subordonnée ou dans la principale), son identifiant en choisit une, toujours la même.
 */
export function buildExercise(lessonId: string, s: SourceSentence, known?: Known): Exercise | null {
  const builder = BUILDERS[lessonId];
  if (!builder || !usable(s)) return null;
  const options = builder(s, known).filter((ex): ex is Candidate => !!ex && !!ex.answer && !!(ex.before.trim() || ex.after.trim()));
  if (!options.length) return null;
  return { id: `${lessonId}:${s.id}`, en: s.en, fr: s.fr, ...options[s.id % options.length] };
}

/** Phrase affichée avec le trou. */
export function withBlank(ex: Exercise): string {
  return `${ex.before}___${ex.after}`;
}
