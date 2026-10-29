import type { Exercise } from './exercises';
import type { PlacementQuestion } from './placement';

/**
 * Banque du placement grammatical : des questions courtes tirées des banques d'exercices des leçons (phrases Tatoeba
 * déjà filtrées et relues par la génération), converties pour limiter le hasard. Le moteur (placement.ts) compte
 * 5 % de chance pour une réponse tapée et 1 / n pour un choix entre n propositions : une question à deux choix
 * prouve beaucoup moins qu'une réponse tapée.
 *
 * - Exercice avec un verbe en indice : réponse tapée (le choix d'origine disparaît).
 * - Mots-outils : choix élargi à 3 ou 4 propositions quand un distracteur est sûrement faux (souvent le piège
 *   francophone : during pour « pendant », too much old, mustn't be pour « ne doit pas être »).
 * - Sinon, choix à 2 propositions, signalé comme tel.
 */

export interface PlacementItem extends PlacementQuestion {
  /** Énoncé : la phrase coupée autour du trou, avec sa traduction (indice qui lève l'ambiguïté). */
  before: string;
  after: string;
  fr: string;
  answer: string;
  accept?: string[];
  hint?: string;
  /** Propositions affichées (choix), dans l'ordre d'affichage. */
  options?: string[];
  /** Nature de la bonne réponse (sujet / objet, to / for…) : la simulation y modélise les règles superficielles. */
  form?: string;
  /** Provenance : phrase Tatoeba (CC BY 2.0 FR) ou question rédigée. */
  source: string;
  /** « généré » : sorti du générateur, contrôlé automatiquement ; « rédigé » : écrit à la main, à relire ; « relu » : validé par une personne. */
  status: 'généré' | 'rédigé' | 'relu';
}

/** Questions retenues par point (le moteur en pose au moins 2 et n'utilise jamais deux fois la même phrase). */
export const ITEMS_PER_POINT = 8;
/** Phrases courtes (rapides, une seule difficulté), mais pas trop : « We have read » n'a aucun contexte. */
const MAX_LENGTH = 90;
const MIN_LENGTH = 25;

/**
 * Condition propre à un point : la phrase doit le tester, lui, sans ambiguïté. Le 3e conditionnel n'utilise que ses
 * phrases d'irréel du passé (pas celles du 2e qui servent de contraste dans la leçon) ; le present perfect continu exige
 * une durée, sans quoi « j'ai travaillé » se dit aussi I worked.
 */
/** Repère du present perfect : sans lui, le prétérit est aussi juste (« Mary has arrived on time » / « arrived »). */
const PERFECT_CUE =
  /\b(?:ever|never|yet|already|just|so far|since|how long|lately|recently|up to now|until now|before|times|this (?:week|month|year|morning)|for (?:(?:a|two|three|many|several|some|ten|\d+) )?(?:years?|months?|weeks?|days?|hours?|ages|a long time|a while))\b/i;
/** Repère d'antériorité du plus-que-parfait : une phrase isolée (« No one had seen anything ») admet aussi le prétérit. */
const PAST_PERFECT_CUE = /\b(?:before|after|when|by the time|by then|until|already|as soon as)\b/i;
/** Proposition de temps : la conjonction est suivie d'un sujet et d'un verbe (« until four » n'en est pas une). */
const TIME_CLAUSE =
  /\b(?:when|as soon as|until|before|after)\s+(?:i|you|he|she|it|we|they|the\s+[a-z]+|my\s+[a-z]+|[A-Z][a-z]+)\s+(?!(?:of|in|on|at|to|for|with|from|and|or|the|a|an)\b)[a-z]+/;
/** Question indirecte (« Do you know when it shuts? ») : will est juste aussi. */
const INDIRECT = /\b(?:know|knows|ask|asked|wonder|tell me|sure|idea|find out)\s+(?:when|if|whether)\b/i;

const POINT_FILTER: Record<string, (ex: Exercise) => boolean> = {
  'third-conditional': (ex) => ex.form === 'past-unreal',
  // Les phrases « be used to + -ing » de la leçon used to mesurent le point be-used-to (B2), pas used to.
  'used-to': (ex) => ex.form !== 'be-used-to',
  'be-used-to': (ex) => ex.form === 'be-used-to',
  // Une durée chiffrée (for, since, how long) : avec « all day », le present perfect simple est juste aussi.
  'perfect-continuous': (ex) => /\b(?:for|since|how long)\b/i.test(ex.en),
  'present-perfect': (ex) => PERFECT_CUE.test(ex.en) && !/\bjust now\b/i.test(ex.en),
  // « just now » (= il y a un instant) se construit avec le prétérit.
  'perfect-vs-past': (ex) => !/\bjust now\b/i.test(ex.en),
  // wish et if au plus-que-parfait relèvent d'autres points (wish, conditionnels).
  'past-perfect': (ex) => PAST_PERFECT_CUE.test(ex.en) && !/\b(?:wish|wished|if)\b/i.test(ex.en),
  // Phrase source fautive (« I would go nuts if we stay here ») : la subordonnée doit être au passé.
  'second-conditional': (ex) =>
    !/\bif\s+(?:i|you|he|she|it|we|they)\s+(?!(?:were|was|had|could|did|didn't|weren't|wasn't|knew|went|got|came|saw|took|[a-z]+ed)\b)[a-z]+\b/i.test(
      `${ex.before}${ex.answer}${ex.after}`,
    ),
  // try + -ing et try + to sont justes tous les deux, et « essayer de » ne tranche pas.
  'gerund-infinitive-meaning': (ex) => !/\btr(?:y|ies|ied|ying)\b/i.test(ex.en),
  // « I'll see if I can… » : if = si interrogatif (whether), pas un conditionnel.
  'first-conditional': (ex) => !INDIRECT.test(ex.en) && !/\b(?:see|check|decide)\s+if\b/i.test(ex.en),
  'time-clauses': (ex) => TIME_CLAUSE.test(ex.en) && !INDIRECT.test(ex.en),
  // much adverbe (« Does it snow much here? ») : a lot est juste aussi.
  countables: (ex) => !(ex.answer === 'much' && /^\s+(?:here|there|now|today|anymore|at|in|on|about|lately|these|this)\b/i.test(ex.after)),
};

/**
 * Variété : deux questions d'un même point ne partagent ni une suite de trois mots (« if I were you ») ni un tour
 * figé (« Without your help, I would have… ») ; sinon la même phrase-type compte plusieurs fois.
 */
const TEMPLATES = [/^\s*without\b/i, /^\s*but for\b/i, /\bif i were you\b/i, /\bif i had known\b/i];
function shingles(ex: Exercise): Set<string> {
  const w = ex.en.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(w.slice(i, i + 3).join(' '));
  TEMPLATES.forEach((t, i) => t.test(ex.en) && out.add(`#${i}`));
  return out;
}

/** Ordre fixé par la phrase : même ordre à chaque génération, réponse pas toujours à la même place. */
function rotate<T>(list: T[], seed: number): T[] {
  const k = seed % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/** Troisième (ou quatrième) proposition sûrement fausse, par leçon ; null si aucune n'est sûre. */
function widen(lessonId: string, ex: Exercise): string[] | null {
  const choices = ex.choices ?? [];
  switch (lessonId) {
    case 'for-since':
      return [...choices, 'during'];
    case 'relatives-defining':
      return [...choices, 'what'];
    case 'quantifiers':
      return ['a few', 'a little', 'few', 'little'];
    case 'gerund-infinitive-meaning': {
      const toForm = choices.find((c) => c.startsWith('to '));
      return toForm ? [...choices, toForm.slice(3)] : null;
    }
    case 'too-enough': {
      if (ex.form === 'too' || ex.form === 'enough') {
        const adj = (ex.answer.startsWith('too ') ? ex.answer.slice(4) : ex.answer.replace(/ enough$/, '')).trim();
        return [...choices, ex.form === 'too' ? `too much ${adj}` : `enough ${adj}`];
      }
      return null;
    }
    case 'question-tags': {
      if (!choices.includes("isn't it")) return [...choices, "isn't it"];
      const pronoun = ex.answer.split(' ').at(-1);
      return pronoun === 'it' ? [...choices, ex.answer.startsWith('is') ? "doesn't it" : "isn't it"].filter((c, i, l) => l.indexOf(c) === i) : null;
    }
    case 'deduction-present':
      return [...choices, "mustn't"];
    case 'used-to':
      // « I use to » : le piège du présent (used to n'existe qu'au passé).
      return ex.answer.startsWith('used to ') ? [...choices, ex.answer.replace(/^used to /, 'use to ')] : null;
    case 'time-clauses': {
      // « When will you arrive? » : l'ordre de l'affirmation (you will arrive) est faux dans une question directe.
      const q = /^will (\S+) (.+)$/.exec(ex.answer);
      return q ? [...choices, `${q[1]} will ${q[2]}`] : null;
    }
    default:
      return null;
  }
}

/** Question de placement tirée d'un exercice, ou null si l'exercice ne convient pas. */
export function placementItem(lessonId: string, ex: Exercise, targetId = lessonId): PlacementItem | null {
  if (ex.en.length > MAX_LENGTH || ex.en.length < MIN_LENGTH || !ex.fr) return null;
  // Une autre réponse admise (prétérit sans repère, variante proche) : la question ne prouve rien.
  if (ex.accept?.length) return null;
  if (POINT_FILTER[targetId] && !POINT_FILTER[targetId](ex)) return null;
  // « I wish it were » : was est admis aussi (même connaissance, registre courant).
  const singular = /\b(?:i|he|she|it|this|that|[A-Z][a-z]+)\s+$/i.test(ex.before);
  const beToo = singular && (ex.answer === 'were' || ex.answer === 'was') ? [ex.answer === 'were' ? 'was' : 'were'] : null;
  const sentenceId = ex.id.split(':')[1];
  const base = {
    id: `placement:${targetId}:${ex.id}`,
    targetId,
    evidenceId: `tatoeba:${sentenceId}`,
    before: ex.before,
    after: ex.after,
    fr: ex.fr,
    answer: ex.answer,
    source: `tatoeba:${sentenceId}`,
    status: 'généré' as const,
    ...(ex.form ? { form: ex.form } : {}),
  };
  // Verbe en indice : la forme se tape, sans propositions.
  if (ex.hint) return { ...base, mode: 'typed', hint: ex.hint, ...(beToo ? { accept: beToo } : {}) };
  if (!ex.choices) return null;
  const options = widen(lessonId, ex) ?? ex.choices;
  const unique = [...new Set(options)];
  if (!unique.includes(ex.answer)) return null;
  return { ...base, mode: 'choice', choices: unique.length, options: rotate(unique, Number(sentenceId)) };
}

/**
 * Questions d'un point : jusqu'à 8, phrases courtes d'abord, natures de réponse alternées (will / présent…), réponses
 * variées. Déterministe : la même banque donne les mêmes questions.
 */
export function placementItems(lessonId: string, bank: Exercise[], excluded: ReadonlySet<string> = new Set(), targetId = lessonId): PlacementItem[] {
  const candidates = bank
    .filter((ex) => !excluded.has(ex.id))
    .map((ex) => ({ ex, item: placementItem(lessonId, ex, targetId) }))
    .filter((c): c is { ex: Exercise; item: PlacementItem } => !!c.item)
    .sort((x, y) => x.ex.en.length - y.ex.en.length || x.ex.id.localeCompare(y.ex.id));
  const byForm = new Map<string, typeof candidates>();
  for (const c of candidates) byForm.set(c.ex.form ?? '', [...(byForm.get(c.ex.form ?? '') ?? []), c]);
  const queues = [...byForm.values()];
  const answers = new Set<string>();
  const used = new Set<string>();
  const out: PlacementItem[] = [];
  const fresh = (c: { ex: Exercise }) => ![...shingles(c.ex)].some((s) => used.has(s));
  // Tour à tour dans chaque nature ; une réponse déjà prise ne revient qu'en deuxième passe, une phrase-type déjà
  // prise seulement en dernier recours (banque trop petite).
  for (let pass = 0; pass < 3 && out.length < ITEMS_PER_POINT; pass++) {
    const pools = queues.map((q) => q.filter((c) => !out.includes(c.item)));
    let added = true;
    while (out.length < ITEMS_PER_POINT && added) {
      added = false;
      for (const pool of pools) {
        const i = pool.findIndex((c) => (pass === 2 || fresh(c)) && (pass > 0 || !answers.has(c.item.answer)));
        if (i < 0 || out.length >= ITEMS_PER_POINT) continue;
        const [c] = pool.splice(i, 1);
        out.push(c.item);
        answers.add(c.item.answer);
        for (const s of shingles(c.ex)) used.add(s);
        added = true;
      }
    }
  }
  return out;
}

/** Question rédigée (public/grammar/en/placement-written.json) : pour les points sans leçon ni générateur. */
export interface WrittenQuestion {
  id: string;
  targetId: string;
  before: string;
  after: string;
  fr: string;
  answer: string;
  /** Autres réponses tapées admises (« will already have eaten »). */
  accept?: string[];
  /** Forme à taper (verbe en indice), sinon propositions plausibles pour un francophone, une seule faute chacune. */
  hint?: string;
  options?: string[];
  form: string;
}

/** Question de placement tirée d'une question rédigée ; les propositions tournent pour que la réponse change de place. */
export function writtenItem(q: WrittenQuestion, index: number): PlacementItem {
  const base = {
    id: `placement:${q.targetId}:${q.id}`,
    targetId: q.targetId,
    evidenceId: q.id,
    before: q.before,
    after: q.after,
    fr: q.fr,
    answer: q.answer,
    source: q.id,
    status: 'rédigé' as const,
    form: q.form,
  };
  if (q.hint) return { ...base, mode: 'typed', hint: q.hint, ...(q.accept ? { accept: q.accept } : {}) };
  const options = rotate(q.options ?? [], index);
  return { ...base, mode: 'choice', choices: options.length, options };
}
