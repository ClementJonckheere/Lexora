import type { GrammarAnswer } from './progress';
import { baseOf, baseOfPresent, ingOf, participleOf, pastForms, presentOf, type Exercise } from './exercises';
import { IRREGULAR_VERBS } from './irregularVerbs';

/**
 * Révisions grammaticales mélangées : des exercices de plusieurs leçons d'un même groupe de contrastes, sans dire de
 * quelle leçon ils viennent. Il faut choisir la règle d'après le contexte (repères, traduction), comme en situation,
 * au lieu de l'appliquer parce que le titre de la leçon l'annonce. Après la réponse, une explication courte dit
 * pourquoi cette forme convient. Les leçons restent le lieu de l'apprentissage guidé : une leçon n'entre dans le
 * mélange qu'après MIN_ANSWERS réponses.
 *
 * Chaque exercice propose les formes concurrentes du groupe, pas seulement les deux de sa leçon (qui trahiraient le
 * thème) : la forme ajoutée est une forme que la traduction exclut (temps ou type de conditionnel), pour ne jamais
 * créer de seconde bonne réponse. Quand elle ne peut pas être construite sûrement, l'exercice garde ses propositions.
 */

export interface MixGroup {
  id: string;
  title: string;
  /** Leçons du groupe ; seules celles déjà commencées sont mélangées. */
  lessons: string[];
}

export const MIX_GROUPS: MixGroup[] = [
  { id: 'tenses', title: 'Présent ou passé', lessons: ['simple-vs-continuous', 'perfect-vs-past'] },
  { id: 'conditionals', title: 'Conditionnels', lessons: ['first-conditional', 'second-conditional', 'third-conditional', 'mixed-conditionals'] },
];

/** Réponses dans une leçon avant qu'elle entre dans le mélange : l'apprentissage guidé d'abord. */
export const MIN_ANSWERS = 10;
export const MIX_SIZE = 10;
/** Préfixe des réponses enregistrées (grammar_answers.lesson_id) : elles ne comptent pas dans la progression des leçons. */
export const mixLessonId = (group: string) => `mix:${group}`;

/** Pourquoi cette forme convient : selon la leçon d'origine et la nature de la réponse. */
const EXPLANATIONS: Record<string, Record<string, string>> = {
  'simple-vs-continuous': {
    simple: 'Présent simple : habitude, vérité générale ou état (every day, usually, never ; know, like, want…).',
    continuous: "Présent continu : action en cours au moment où l'on parle (now, at the moment, look!) ou situation temporaire.",
  },
  'perfect-vs-past': {
    past: 'Prétérit : action terminée à un moment passé précis, dit ou sous-entendu (yesterday, last week, in 2010, ago).',
    perfect: 'Present perfect : lien avec le présent, sans moment passé précisé (ever, never, already, yet, just, since, for).',
  },
  'first-conditional': {
    will: "Condition réelle ou probable : if + présent, will + base dans l'autre proposition.",
    present: "Condition réelle ou probable : présent après if (jamais will), will + base dans l'autre proposition.",
  },
  'second-conditional': {
    would: "Situation imaginaire, présente ou future : if + prétérit, would + base dans l'autre proposition.",
    past: 'Situation imaginaire, présente ou future : prétérit après if (were pour toutes les personnes en anglais soigné), would + base ailleurs.',
  },
  'third-conditional': {
    'present-unreal': 'Situation imaginaire, présente ou future : if + prétérit, would + base.',
    'past-unreal': "Passé qui ne s'est pas produit : if + had + participe, would have + participe.",
  },
  'mixed-conditionals': {
    would: 'Conditionnel mixte : condition passée (if + had + participe), conséquence présente (would + base, souvent avec now).',
    'would-have': 'Conditionnel mixte : condition présente ou permanente (if + prétérit), conséquence passée (would have + participe).',
  },
};

export function explanation(lessonId: string, form: string | undefined): string | null {
  return EXPLANATIONS[lessonId]?.[form ?? ''] ?? null;
}

/** Leçons du groupe assez pratiquées pour entrer dans le mélange. */
export function startedLessons(group: MixGroup, answers: readonly GrammarAnswer[]): string[] {
  const counts = new Map<string, number>();
  for (const a of answers) if (!a.reported) counts.set(a.lessonId, (counts.get(a.lessonId) ?? 0) + 1);
  return group.lessons.filter((id) => (counts.get(id) ?? 0) >= MIN_ANSWERS);
}

/** Un groupe ne se mélange qu'avec au moins deux leçons commencées. */
export const groupReady = (group: MixGroup, answers: readonly GrammarAnswer[]) => startedLessons(group, answers).length >= 2;

/* ------------------------------------------------------- propositions --- */

const PRONOUN = /^(?:I|you|he|she|it|we|they)$/i;

const IRREGULAR = new Set(IRREGULAR_VERBS.map((v) => v.base));
const IRREGULAR_BY_BASE = new Map(IRREGULAR_VERBS.map((v) => [v.base, v]));
/** Prétérit et participe : la liste des 144 irréguliers d'abord (mistake → mistook), sinon les règles du générateur. */
const pastOf = (base: string) => IRREGULAR_BY_BASE.get(base)?.past[0] ?? pastForms(base)[0];
const participle = (base: string) => IRREGULAR_BY_BASE.get(base)?.participle[0] ?? participleOf(base);
/**
 * Verbe dont on sait former sûrement le prétérit et le participe : irrégulier de la liste, ou régulier qui n'est pas
 * un composé d'irrégulier (mistake → mistook, understand → understood : « mistaked » serait une forme inventée).
 */
function safeVerb(base: string): boolean {
  if (IRREGULAR.has(base)) return true;
  return ![...IRREGULAR].some((irr) => irr.length >= 3 && base.length > irr.length && base.endsWith(irr));
}

/** Formules de politesse (would like, would rather…) : pas des conditionnels, l'explication serait fausse. */
const POLITE = /^(?:would|wouldn't) (?:like|love|prefer|rather|mind)$/;

/** Sujet juste avant le trou (pronom, ou prénom en majuscule hors début de phrase) ; null s'il est incertain. */
function subjectBefore(before: string): string | null {
  const words = before.trim().split(/\s+/);
  const last = words.at(-1) ?? '';
  if (PRONOUN.test(last)) return last;
  if (/^[A-Z][a-z]+$/.test(last) && words.length > 1 && !/^(?:If|When|Unless)$/.test(last)) return 'he';
  return null;
}

/** Conditionnels, proposition principale : will / would / would have, au même degré de négation. */
function resultOptions(answer: string): string[] | null {
  const m = /^(will|won't|would|wouldn't)(?: (have))? ([a-z]+)$/.exec(answer);
  if (!m) return null;
  const [, modal, have, verb] = m;
  const negative = /n't$/.test(modal);
  const base = have ? baseOf(verb) ?? (verb === 'been' ? 'be' : null) : verb;
  if (!base || !safeVerb(base)) return null;
  const pp = base === 'be' ? 'been' : participle(base);
  return negative ? [`won't ${base}`, `wouldn't ${base}`, `wouldn't have ${pp}`] : [`will ${base}`, `would ${base}`, `would have ${pp}`];
}

/** Conditionnels, proposition en if : présent / prétérit / plus-que-parfait, accordés au sujet. */
function conditionOptions(answer: string, before: string): string[] | null {
  const subject = subjectBefore(before);
  if (!subject || !/\bif\s+\S+\s*$/i.test(before)) return null;
  let base: string | null;
  const perfect = /^had ([a-z]+)$/.exec(answer);
  if (perfect) base = perfect[1] === 'been' ? 'be' : baseOf(perfect[1]);
  else if (/^(?:were|was)$/.test(answer)) base = 'be';
  else if (/^[a-z]+$/.test(answer)) base = baseOf(answer) ?? baseOfPresent(answer);
  else return null;
  if (!base || !safeVerb(base)) return null;
  const past = base === 'be' ? (/^(?:I|he|she|it)$/i.test(subject) && answer === 'was' ? 'was' : 'were') : pastOf(base);
  const options = [presentOf(base, subject), past, `had ${base === 'be' ? 'been' : participle(base)}`];
  return options.includes(answer) ? options : null;
}

/**
 * Temps : la forme d'un autre temps que la traduction exclut. Phrase au présent (simple ou continu) : le prétérit ;
 * phrase au passé (prétérit ou present perfect) : le présent simple.
 */
function tenseOptions(lessonId: string, ex: Exercise): string[] | null {
  const choices = ex.choices ?? [];
  if (choices.length !== 2 || choices.some((c) => /n't|\bnot\b/.test(c))) return null;
  if (lessonId === 'simple-vs-continuous') {
    const continuous = choices.find((c) => /^(?:am|is|are) [a-z]+ing$/.test(c));
    const simple = choices.find((c) => c !== continuous && /^[a-z]+$/.test(c));
    if (!continuous || !simple) return null;
    // Base tirée de la forme simple, et vérifiée sur la forme en -ing (« mistaking » seul donnerait « mistak »).
    const base = baseOfPresent(simple);
    if (!base || base === 'be' || !safeVerb(base) || ingOf(base) !== continuous.split(' ')[1]) return null;
    return [...choices, pastOf(base)];
  }
  if (lessonId === 'perfect-vs-past') {
    const perfect = choices.find((c) => /^(?:have|has) [a-z]+$/.test(c));
    const past = choices.find((c) => c !== perfect && /^[a-z]+$/.test(c));
    if (!perfect || !past) return null;
    const base = baseOf(perfect.split(' ')[1]);
    if (!base || base === 'be' || base === 'have' || !safeVerb(base)) return null;
    // « has » : troisième personne du singulier ; sinon le sujet de « have » (I, you, we, they).
    return [...choices, presentOf(base, perfect.startsWith('has') ? 'he' : 'you')];
  }
  return null;
}

/** Propositions de l'exercice dans le mélange : formes concurrentes du groupe, ou celles de la leçon à défaut. */
export function mixedOptions(lessonId: string, ex: Exercise): string[] | null {
  if (POLITE.test(ex.answer)) return null;
  const group = MIX_GROUPS.find((g) => g.lessons.includes(lessonId));
  let options: string[] | null = null;
  if (group?.id === 'conditionals') options = resultOptions(ex.answer) ?? conditionOptions(ex.answer, ex.before);
  else if (group?.id === 'tenses') options = tenseOptions(lessonId, ex);
  if (options && options.includes(ex.answer) && new Set(options).size === options.length) return options;
  return ex.choices ?? null;
}

/* ------------------------------------------------------------ séance --- */

export interface MixedItem {
  /** Exercice, avec les propositions du mélange (mélangées). */
  ex: Exercise;
  /** Leçon d'origine : explication, signalement ; jamais montrée avant la réponse. */
  lessonId: string;
}

/**
 * Séance : tour à tour dans chaque leçon commencée (jamais deux fois de suite la même quand c'est possible), puis
 * dans chaque nature de réponse ; exercices signalés écartés, ceux réussis récemment dans le mélange en dernier.
 */
export function mixedSession(
  banks: Readonly<Record<string, readonly Exercise[]>>,
  lessons: readonly string[],
  answers: readonly GrammarAnswer[],
  rng: () => number = Math.random,
  size = MIX_SIZE,
): MixedItem[] {
  const reported = new Set(answers.filter((a) => a.reported).map((a) => a.itemId));
  const recent = new Set(
    [...answers]
      .filter((a) => a.lessonId.startsWith('mix:') && a.correct)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 80)
      .map((a) => a.itemId),
  );
  const shuffle = <T>(xs: T[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  };
  // Par leçon : files par nature de réponse, exercices récents en dernier.
  const queues = new Map<string, Exercise[][]>();
  for (const id of lessons) {
    const pool = shuffle([...(banks[id] ?? [])].filter((ex) => !reported.has(ex.id) && mixedOptions(id, ex)));
    pool.sort((a, b) => Number(recent.has(a.id)) - Number(recent.has(b.id)));
    const byForm = new Map<string, Exercise[]>();
    for (const ex of pool) byForm.set(ex.form ?? '', [...(byForm.get(ex.form ?? '') ?? []), ex]);
    if (byForm.size) queues.set(id, [...byForm.values()]);
  }
  const order = shuffle([...queues.keys()]);
  const formTurn = new Map<string, number>();
  const out: MixedItem[] = [];
  for (let turn = 0; out.length < size && [...queues.values()].some((qs) => qs.some((q) => q.length)); turn++) {
    const id = order[turn % order.length];
    const qs = queues.get(id)!.filter((q) => q.length);
    if (!qs.length) continue;
    const k = formTurn.get(id) ?? 0;
    formTurn.set(id, k + 1);
    const ex = qs[k % qs.length].shift()!;
    const options = mixedOptions(id, ex)!;
    out.push({ lessonId: id, ex: { ...ex, choices: shuffle([...options]) } });
  }
  return out;
}
