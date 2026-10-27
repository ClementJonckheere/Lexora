import { languageInfo } from './languages';
import { normalizeSearch, tokenize } from './text';

/**
 * Phrases à trous construites UNIQUEMENT à partir des exemples saisis par l'utilisateur.
 * On repère les mots-clés de l'expression dans la phrase (formes fléchies incluses)
 * et on les remplace par des blancs.
 */

/** Mots-outils et marqueurs (« sth », « algo »…) jamais masqués, par langue. */
const IGNORED: Record<string, Set<string>> = {
  en: new Set([
    'to', 'a', 'an', 'the',
    'sb', 'sth', 'someone', 'somebody', 'something', 'oneself', 'one', "one's", 'ones',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
  ]),
  es: new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'se', 'algo', 'alguien', 'algn', 'alg']),
  pt: new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'se', 'algo', 'alguem', 'alguém']),
  it: new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'si', 'qualcosa', 'qualcuno', 'qc', 'qcn']),
  de: new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'sich', 'zu', 'etw', 'jdn', 'jdm', 'jemand', 'etwas']),
  nl: new Set(['de', 'het', 'een', 'zich', 'te', 'iets', 'iemand']),
  fr: new Set(['le', 'la', 'les', 'un', 'une', 'se', "s'"]),
};

// Verbes irréguliers fréquents : base → formes.
const IRREGULAR: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  have: ['has', 'had', 'having'],
  do: ['does', 'did', 'done', 'doing'],
  go: ['goes', 'went', 'gone', 'going'],
  get: ['got', 'gotten', 'getting'],
  take: ['took', 'taken', 'taking'],
  make: ['made'], come: ['came'], give: ['gave', 'given'], keep: ['kept'], bring: ['brought'],
  think: ['thought'], buy: ['bought'], catch: ['caught'], teach: ['taught'], seek: ['sought'],
  fight: ['fought'], find: ['found'], hold: ['held'], stand: ['stood'], understand: ['understood'],
  run: ['ran', 'running'], set: ['setting'], put: ['putting'], cut: ['cutting'], let: ['letting'],
  hit: ['hitting'], shut: ['shutting'], break: ['broke', 'broken'], speak: ['spoke', 'spoken'],
  choose: ['chose', 'chosen'], fall: ['fell', 'fallen'], forget: ['forgot', 'forgotten'],
  know: ['knew', 'known'], grow: ['grew', 'grown'], throw: ['threw', 'thrown'], blow: ['blew', 'blown'],
  draw: ['drew', 'drawn'], see: ['saw', 'seen'], say: ['said'], tell: ['told'], sell: ['sold'],
  leave: ['left'], feel: ['felt'], deal: ['dealt'], mean: ['meant'], meet: ['met'], lead: ['led'],
  lose: ['lost'], send: ['sent'], spend: ['spent'], build: ['built'], lend: ['lent'], bend: ['bent'],
  pay: ['paid'], lay: ['laid'], sit: ['sat', 'sitting'], win: ['won', 'winning'], begin: ['began', 'begun'],
  drink: ['drank', 'drunk'], ring: ['rang', 'rung'], sing: ['sang', 'sung'], swim: ['swam', 'swum'],
  write: ['wrote', 'written'], ride: ['rode', 'ridden'], rise: ['rose', 'risen'], drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'], wear: ['wore', 'worn'], tear: ['tore', 'torn'], bear: ['bore', 'borne', 'born'],
  steal: ['stole', 'stolen'], wake: ['woke', 'woken'], hide: ['hid', 'hidden'], bite: ['bit', 'bitten'],
  shake: ['shook', 'shaken'], fly: ['flew', 'flown'], lie: ['lay', 'lain', 'lying'], hang: ['hung'],
  dig: ['dug'], stick: ['stuck'], strike: ['struck'], swing: ['swung'], hear: ['heard'], read: ['read'],
  light: ['lit'], slide: ['slid'], feed: ['fed'], flee: ['fled'], sleep: ['slept'], sweep: ['swept'],
  weep: ['wept'], creep: ['crept'], shoot: ['shot'], forgive: ['forgave', 'forgiven'], undergo: ['underwent', 'undergone'],
  overcome: ['overcame'], undertake: ['undertook', 'undertaken'], withdraw: ['withdrew', 'withdrawn'],
};

const VOWELS = /[aeiou]/;

/** Formes fléchies probables d'un mot anglais (pluriel, 3e personne, -ed, -ing, irréguliers). */
export function inflections(word: string): Set<string> {
  const w = word.toLowerCase();
  const forms = new Set<string>([w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`, `${w}'s`]);
  if (w.endsWith('y') && w.length > 2 && !VOWELS.test(w[w.length - 2])) {
    const stem = w.slice(0, -1);
    forms.add(`${stem}ies`).add(`${stem}ied`);
  }
  if (w.endsWith('e')) forms.add(`${w.slice(0, -1)}ing`);
  if (w.endsWith('ie')) forms.add(`${w.slice(0, -2)}ying`);
  // Doublement de la consonne finale : stop → stopped, stopping.
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) {
    const last = w[w.length - 1];
    forms.add(`${w}${last}ed`).add(`${w}${last}ing`);
  }
  for (const f of IRREGULAR[w] ?? []) forms.add(f);
  return forms;
}

export interface ClozePart {
  text: string;
  blank: boolean;
}

export interface Cloze {
  parts: ClozePart[];
  /** Mots effectivement masqués dans la phrase, dans l'ordre. */
  answers: string[];
  /** Mots-clés de l'expression correspondants (forme de base). */
  keywords: string[];
}

interface SentenceToken {
  text: string;
  norm: string;
  start: number;
  end: number;
}

function sentenceTokens(sentence: string): SentenceToken[] {
  const out: SentenceToken[] = [];
  const re = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)?/gu;
  for (const m of sentence.matchAll(re)) {
    out.push({ text: m[0], norm: normalizeSearch(m[0]), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

export function clozeKeywords(expression: string, language = 'en'): string[] {
  const ignored = IGNORED[language];
  return tokenize(expression).filter((t) => !ignored?.has(t));
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Le mot de la phrase est-il une forme du mot-clé ?
 * Anglais : formes fléchies et irréguliers. Autres langues : radical commun
 * (« hablar » / « hablamos », « обращать » / « обращай »).
 */
export function wordMatches(keyword: string, token: string, language = 'en'): boolean {
  if (keyword === token) return true;
  if (language === 'en') return inflections(keyword).has(token);
  if (keyword.length < 4) return false;
  const stem = Math.max(3, keyword.length - 4);
  return commonPrefix(keyword, token) >= stem && Math.abs(token.length - keyword.length) <= 4;
}

const MAX_GAP = 3;

/** Écritures sans espaces : on repère l'expression (ou sa plus longue partie) comme sous-chaîne. */
function buildClozeNoSpaces(expression: string, sentence: string): Cloze | null {
  const expr = expression.trim();
  const candidates = [expr, ...expr.split(/[\s\p{P}]+/u).filter((p) => p.length >= 2).sort((a, b) => b.length - a.length)];
  for (const c of candidates) {
    const i = sentence.indexOf(c);
    if (i < 0 || !c) continue;
    const parts: ClozePart[] = [];
    if (i > 0) parts.push({ text: sentence.slice(0, i), blank: false });
    parts.push({ text: c, blank: true });
    if (i + c.length < sentence.length) parts.push({ text: sentence.slice(i + c.length), blank: false });
    return { parts, answers: [c], keywords: [c] };
  }
  return null;
}

/** Construit la phrase à trous, ou `null` si l'expression n'est pas repérable dans la phrase. */
export function buildCloze(expression: string, sentence: string, language = 'en'): Cloze | null {
  if (languageInfo(language).noSpaces) return buildClozeNoSpaces(expression, sentence);
  const keywords = clozeKeywords(expression, language);
  if (keywords.length === 0) return null;
  const tokens = sentenceTokens(sentence);
  const matches = (kw: number, tok: number) => wordMatches(keywords[kw], tokens[tok].norm, language);

  let picked: { tok: number; kw: number }[] | null = null;

  // 1. Tous les mots-clés, dans l'ordre, avec des écarts courts.
  for (let i = 0; i < tokens.length && !picked; i++) {
    if (!matches(0, i)) continue;
    const seq = [{ tok: i, kw: 0 }];
    let pos = i;
    for (let k = 1; k < keywords.length; k++) {
      let found = -1;
      for (let j = pos + 1; j <= Math.min(tokens.length - 1, pos + 1 + MAX_GAP); j++) {
        if (matches(k, j)) {
          found = j;
          break;
        }
      }
      if (found < 0) break;
      seq.push({ tok: found, kw: k });
      pos = found;
    }
    if (seq.length === keywords.length) picked = seq;
  }

  // 2. Repli : le mot principal (premier mot-clé), puis le plus long mot-clé.
  if (!picked) {
    const order = [0, ...keywords.map((_, k) => k).slice(1).sort((a, b) => keywords[b].length - keywords[a].length)];
    for (const k of order) {
      if (k !== 0 && keywords[k].length < 4) continue;
      const i = tokens.findIndex((_, t) => matches(k, t));
      if (i >= 0) {
        picked = [{ tok: i, kw: k }];
        break;
      }
    }
  }
  if (!picked) return null;

  const parts: ClozePart[] = [];
  let cursor = 0;
  for (const { tok } of picked) {
    const t = tokens[tok];
    if (t.start > cursor) parts.push({ text: sentence.slice(cursor, t.start), blank: false });
    parts.push({ text: t.text, blank: true });
    cursor = t.end;
  }
  if (cursor < sentence.length) parts.push({ text: sentence.slice(cursor), blank: false });

  return {
    parts,
    answers: picked.map(({ tok }) => tokens[tok].text),
    keywords: picked.map(({ kw }) => keywords[kw]),
  };
}

export type ClozeVerdict = 'exact' | 'close' | 'wrong';

/**
 * Compare la réponse tapée aux mots masqués.
 * « close » : bon mot mais autre forme (ex. « tackle » au lieu de « tackled »).
 */
export function checkCloze(cloze: Cloze, typed: string, language = 'en'): ClozeVerdict {
  if (languageInfo(language).noSpaces) {
    const strip = (s: string) => s.replace(/[\s\p{P}]/gu, '');
    return strip(typed) === strip(cloze.answers.join('')) ? 'exact' : 'wrong';
  }
  const given = tokenize(typed);
  const expected = cloze.answers.map((a) => normalizeSearch(a));
  if (given.length !== expected.length) return 'wrong';
  if (given.every((g, i) => g === expected[i])) return 'exact';
  const ok = given.every((g, i) => g === expected[i] || wordMatches(normalizeSearch(cloze.keywords[i]), g, language));
  return ok ? 'close' : 'wrong';
}

/** Indice : premières lettres de chaque mot masqué. */
export function clozeHint(cloze: Cloze): string {
  return cloze.answers.map((a) => {
    const chars = [...a];
    return `${chars[0]}${'·'.repeat(Math.max(0, chars.length - 1))}`;
  }).join('  ');
}
