import { languageInfo } from './languages';
import { tokenize } from './text';
import { wordMatches } from './cloze';

/**
 * Vérification d'une réponse tapée (mode « taper la réponse », français → langue).
 * - exact : mêmes mots (casse, accents, ponctuation et « to » initial ignorés) ;
 * - close : mêmes mots à une forme près (« tackled » pour « tackle ») ou un mot-outil oublié ;
 * - wrong : sinon.
 */
export type AnswerVerdict = 'exact' | 'close' | 'wrong';

const IGNORABLE = new Set(['to', 'a', 'an', 'the', 'sb', 'sth', 'someone', 'something']);

function strip(words: string[], language: string): string[] {
  return language === 'en' && words[0] === 'to' && words.length > 1 ? words.slice(1) : words;
}

export function checkAnswer(expected: string, typed: string, language = 'en'): AnswerVerdict {
  if (!typed.trim()) return 'wrong';
  if (languageInfo(language).noSpaces) {
    const clean = (s: string) => s.replace(/[\s\p{P}]/gu, '');
    return clean(expected) === clean(typed) ? 'exact' : 'wrong';
  }
  // Plusieurs réponses acceptées : « Comprendre / trouver », « to figure out, to work out ».
  const variants = expected.split(/\s*[/;,]\s*|\s+\bou\b\s+|\s+\bor\b\s+/).filter(Boolean);
  let best: AnswerVerdict = 'wrong';
  for (const variant of variants.length ? variants : [expected]) {
    const exp = strip(tokenize(variant), language);
    const got = strip(tokenize(typed), language);
    if (!exp.length) continue;
    if (exp.length === got.length && exp.every((w, i) => w === got[i])) return 'exact';
    const sameLength = exp.length === got.length && exp.every((w, i) => wordMatches(w, got[i], language));
    // Tolère l'oubli ou l'ajout d'un mot-outil (article, « sth »…).
    const core = (ws: string[]) => ws.filter((w) => !IGNORABLE.has(w));
    const e2 = core(exp);
    const g2 = core(got);
    const coreMatch = e2.length > 0 && e2.length === g2.length && e2.every((w, i) => wordMatches(w, g2[i], language));
    if (sameLength || coreMatch) best = 'close';
  }
  return best;
}
