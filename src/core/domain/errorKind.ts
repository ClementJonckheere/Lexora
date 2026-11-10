import { ARTICLES, PREPOSITIONS, sameWord } from './errorRules';
import { tokenize } from './text';

/**
 * Retour par type d'erreur, sans IA : la réponse tapée est alignée mot à mot sur la réponse attendue (plus longue
 * sous-suite commune), puis chaque écart est classé :
 * - typo : le bon mot, mal orthographié (une ou deux lettres) ;
 * - form : le bon mot, sous une autre forme (temps, personne, nombre ; verbe irrégulier régularisé) ;
 * - preposition / article : préposition ou article différent, oublié ou en trop ;
 * - missing / extra : un autre mot oublié ou ajouté ;
 * - order : les bons mots, dans un autre ordre ;
 * - other : un autre mot, une autre expression.
 * Mécanisme commun aux langues ; les listes de mots-outils et les formes d'un même mot sont dans errorRules.ts.
 * Chaque type a une explication courte, écrite et relue à la main (pas de texte généré).
 */

export type ErrorKind = 'typo' | 'form' | 'preposition' | 'article' | 'missing' | 'extra' | 'order' | 'other';

export interface ErrorDiff {
  kind: ErrorKind;
  expected: string | null;
  given: string | null;
}

export interface AnswerFeedback {
  /** Type principal de l'erreur. */
  kind: ErrorKind;
  /** Écarts relevés, dans l'ordre de la phrase (trois au plus). */
  diffs: ErrorDiff[];
  /** Phrase courte : ce qui ne va pas, avec les mots concernés. */
  message: string;
  /** Explication courte du type d'erreur. */
  tip: string;
}

export const ERROR_LABELS: Record<ErrorKind, string> = {
  typo: 'Faute de frappe',
  form: 'Forme du mot',
  preposition: 'Préposition ou particule',
  article: 'Article',
  missing: 'Mot oublié',
  extra: 'Mot en trop',
  order: 'Ordre des mots',
  other: 'Autre mot',
};

const TIPS: Record<ErrorKind, string> = {
  typo: "C'est le bon mot : seule l'orthographe est à revoir.",
  form: "C'est le bon mot, pas la bonne forme : vérifiez le temps, la personne ou le nombre.",
  preposition: "La préposition (ou la particule : up, out, off…) fait partie de l'expression : elle ne se traduit pas mot à mot, elle s'apprend avec elle.",
  article: "L'emploi des articles ne suit pas toujours le français : retenez-le avec l'expression.",
  missing: "Un mot de l'expression manque : l'expression se retient en entier.",
  extra: "Un mot est en trop : l'expression est plus courte.",
  order: "Les mots sont les bons, l'ordre ne l'est pas.",
  other: "Ce n'est pas la réponse attendue : relisez-la, elle reviendra bientôt.",
};

/** Verbe irrégulier régularisé (« taked », « goed ») : une explication plus précise. */
const IRREGULAR_TIP = 'Ce verbe est irrégulier : sa forme ne se construit pas avec -ed.';

/** Marques de place ignorées dans l'expression attendue (« sth », « sb »…). */
const PLACEHOLDERS = new Set(['sth', 'sb', 'someone', 'something', 'somebody', 'algo', 'alguien', 'qc', 'qcn', 'etw', 'jdn', 'jdm']);

function words(text: string, language: string): string[] {
  const ws = tokenize(text).filter((w) => !PLACEHOLDERS.has(w));
  // Le « to » de l'infinitif, en tête, ne compte pas.
  return language === 'en' && ws[0] === 'to' && ws.length > 1 ? ws.slice(1) : ws;
}

/** Distance d'édition avec inversion de deux lettres voisines (« tackel » / « tackle » : 1). */
export function typoDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

function isTypo(expected: string, given: string): boolean {
  if (expected.length < 3) return false;
  return typoDistance(expected, given) <= (expected.length >= 8 ? 2 : 1);
}

/** Alignement : opérations égal / remplacé / oublié / ajouté, dans l'ordre de la phrase attendue. */
function align(exp: string[], got: string[]): { e: string | null; g: string | null }[] {
  const n = exp.length;
  const m = got.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = exp[i] === got[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops: { e: string | null; g: string | null }[] = [];
  let i = 0;
  let j = 0;
  const dels: string[] = [];
  const inss: string[] = [];
  const flush = () => {
    // Un oubli et un ajout au même endroit forment un remplacement.
    while (dels.length && inss.length) ops.push({ e: dels.shift()!, g: inss.shift()! });
    for (const e of dels.splice(0)) ops.push({ e, g: null });
    for (const g of inss.splice(0)) ops.push({ e: null, g });
  };
  while (i < n || j < m) {
    if (i < n && j < m && exp[i] === got[j]) {
      flush();
      ops.push({ e: exp[i], g: got[j] });
      i++;
      j++;
    } else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) dels.push(exp[i++]);
    else inss.push(got[j++]);
  }
  flush();
  return ops;
}

function diffKind(e: string | null, g: string | null, language: string): ErrorKind {
  const preps = PREPOSITIONS[language];
  const arts = ARTICLES[language];
  const isPrep = (w: string | null) => !!w && !!preps?.has(w);
  const isArt = (w: string | null) => !!w && !!arts?.has(w);
  if (e && g) {
    if (isPrep(e) && isPrep(g)) return 'preposition';
    if (isArt(e) && isArt(g)) return 'article';
    if (sameWord(e, g, language)) return 'form';
    if (isTypo(e, g)) return 'typo';
    return 'other';
  }
  const w = e ?? g;
  if (isPrep(w)) return 'preposition';
  if (isArt(w)) return 'article';
  return e ? 'missing' : 'extra';
}

const PRIORITY: ErrorKind[] = ['other', 'form', 'preposition', 'missing', 'extra', 'article', 'typo'];

function describe(d: ErrorDiff): string {
  if (d.expected && d.given) return `« ${d.expected} » attendu (vous : « ${d.given} »)`;
  if (d.expected) return `« ${d.expected} » oublié`;
  return `« ${d.given} » en trop`;
}

function feedbackFor(exp: string[], got: string[], language: string): AnswerFeedback | null {
  if (exp.length === got.length && exp.every((w, i) => w === got[i])) return null;
  if (!got.length) return { kind: 'missing', diffs: [], message: 'Sans réponse.', tip: TIPS.missing };
  const sorted = (xs: string[]) => [...xs].sort().join(' ');
  if (exp.length > 1 && sorted(exp) === sorted(got)) return { kind: 'order', diffs: [], message: `${ERROR_LABELS.order} : « ${exp.join(' ')} ».`, tip: TIPS.order };
  const ops = align(exp, got);
  const common = ops.filter((o) => o.e !== null && o.e === o.g).length;
  const diffs: ErrorDiff[] = ops
    .filter((o) => o.e !== o.g)
    .map((o) => ({ kind: diffKind(o.e, o.g, language), expected: o.e, given: o.g }));
  // Beaucoup d'écarts : ce n'est plus une faute dans l'expression, c'est une autre expression.
  const kind = diffs.length > Math.max(2, Math.ceil(exp.length / 2)) ? 'other' : PRIORITY.find((k) => diffs.some((d) => d.kind === k)) ?? 'other';
  const shown = diffs.filter((d) => d.kind === kind).slice(0, 3);
  const irregular =
    kind === 'form' && language === 'en' && shown.some((d) => d.given?.endsWith('ed') && d.expected && !d.expected.endsWith('ed') && sameWord(d.expected, d.given, 'en'));
  return {
    kind,
    diffs: diffs.slice(0, 3),
    // Rien en commun, ou trop d'écarts : la réponse attendue en entier plutôt que mot à mot.
    message:
      kind === 'other' && (diffs.length > 2 || common === 0)
        ? `${ERROR_LABELS.other} : réponse « ${exp.join(' ')} » (vous : « ${got.join(' ')} »).`
        : `${ERROR_LABELS[kind]} : ${shown.map(describe).join(' ; ')}.`,
    tip: irregular ? IRREGULAR_TIP : TIPS[kind],
  };
}

/**
 * Type de l'erreur entre une réponse attendue (ou plusieurs acceptées : on garde la plus proche) et la réponse tapée ;
 * null si la réponse est juste mot pour mot (casse, accents et ponctuation ignorés).
 */
export function classifyAnswer(expected: string | readonly string[], typed: string, language = 'en'): AnswerFeedback | null {
  const got = words(typed, language);
  let best: AnswerFeedback | null = null;
  let bestScore = Infinity;
  for (const variant of typeof expected === 'string' ? [expected] : expected) {
    const fb = feedbackFor(words(variant, language), got, language);
    if (!fb) return null;
    const score = fb.diffs.length + (fb.kind === 'other' ? 10 : 0);
    if (score < bestScore) {
      best = fb;
      bestScore = score;
    }
  }
  return best;
}

/** Réponses acceptées d'une expression notée « to figure out / to work out » (mêmes séparateurs que la vérification). */
export function expressionVariants(expression: string): string[] {
  const xs = expression.split(/\s*[/;,]\s*|\s+\bou\b\s+|\s+\bor\b\s+/).filter((x) => x.trim());
  return xs.length ? xs : [expression];
}

export interface ErrorTrend {
  kind: ErrorKind;
  /** Erreurs des 30 derniers jours. */
  recent: number;
  /** Erreurs des 30 jours précédents. */
  previous: number;
  /** Dernier exemple : attendu et réponse. */
  example: { expected: string; given: string } | null;
}

const MONTH = 30 * 86_400_000;

/** Erreurs par type : 30 derniers jours contre les 30 précédents (les types sans erreur sur 60 jours sont omis). */
export function errorTrend(errors: readonly { kind: ErrorKind; expected: string; given: string; createdAt: number }[], now = Date.now()): ErrorTrend[] {
  const rows = new Map<ErrorKind, ErrorTrend>();
  for (const e of [...errors].sort((a, b) => a.createdAt - b.createdAt)) {
    const age = now - e.createdAt;
    if (age < 0 || age >= 2 * MONTH) continue;
    const row = rows.get(e.kind) ?? { kind: e.kind, recent: 0, previous: 0, example: null };
    if (age < MONTH) {
      row.recent++;
      row.example = { expected: e.expected, given: e.given };
    } else row.previous++;
    rows.set(e.kind, row);
  }
  return [...rows.values()].sort((a, b) => b.recent - a.recent || b.previous - a.previous);
}
