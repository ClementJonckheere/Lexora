import { IRREGULAR } from './cloze';

/**
 * Règles linguistiques du retour par type d'erreur (src/core/domain/errorKind.ts) : mots-outils de chaque langue et
 * formes d'un même mot. Le mécanisme est commun ; seules ces listes dépendent de la langue. Une langue absente
 * d'une liste n'a simplement pas ce type de retour (l'erreur est alors classée plus généralement).
 */

export const PREPOSITIONS: Record<string, ReadonlySet<string>> = {
  en: new Set(
    'about above across after against along among around at before behind below beneath beside besides between beyond by despite down during except for from in inside into like near of off on onto out outside over past since through throughout till to toward towards under underneath until up upon with within without'.split(' '),
  ),
  fr: new Set("à a au aux après avant avec chez contre dans de des du depuis derrière devant en entre envers hors jusque jusqu malgré par parmi pendant pour près sans selon sous sur vers".split(' ')),
  es: new Set('a al ante bajo con contra de del desde durante en entre hacia hasta mediante para por según sin sobre tras'.split(' ')),
  it: new Set('a al allo alla ai agli alle da dal dallo dalla dai dagli dalle di del dello della dei degli delle in nel nello nella nei negli nelle con su sul sullo sulla sui sugli sulle per tra fra'.split(' ')),
  pt: new Set('a ao aos à às de do da dos das em no na nos nas por pelo pela pelos pelas para com sem sobre entre até desde contra'.split(' ')),
  de: new Set('an auf aus bei bis durch für gegen hinter in mit nach neben ohne seit über um unter von vor während wegen zu zwischen am im zum zur vom beim ins ans aufs'.split(' ')),
  nl: new Set('aan achter bij binnen boven door in met na naar naast om onder op over per sinds tegen tot tussen uit van voor zonder'.split(' ')),
};

export const ARTICLES: Record<string, ReadonlySet<string>> = {
  en: new Set(['a', 'an', 'the']),
  fr: new Set(['le', 'la', 'les', 'un', 'une', 'des', "l'"]),
  es: new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas']),
  it: new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una']),
  pt: new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas']),
  de: new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines']),
  nl: new Set(['de', 'het', 'een']),
};

/** Forme irrégulière → base (anglais). */
const BASE_OF = new Map<string, string>();
for (const [base, forms] of Object.entries(IRREGULAR)) for (const f of forms) if (!BASE_OF.has(f)) BASE_OF.set(f, base);

/** Bases possibles d'une forme anglaise (pluriel, 3e personne, -ed, -ing, irréguliers). */
function englishBases(word: string): Set<string> {
  const w = word.toLowerCase();
  const out = new Set([w]);
  const irregular = BASE_OF.get(w);
  if (irregular) out.add(irregular);
  const strip = (suffix: string, add = '') => w.length > suffix.length + 1 && w.endsWith(suffix) && out.add(w.slice(0, -suffix.length) + add);
  strip('ies', 'y');
  strip('ied', 'y');
  strip('es');
  // « -ss » n'est pas un pluriel (« nevertheless », « class »).
  if (!w.endsWith('ss')) strip('s');
  strip("'s");
  strip('ed');
  strip('ed', 'e');
  strip('d');
  strip('ing');
  strip('ing', 'e');
  // Consonne doublée : stopped, stopping → stop.
  const doubled = /([bdgklmnprt])\1(ed|ing)$/.exec(w);
  if (doubled) out.add(w.slice(0, -(doubled[2].length + 1)));
  return out;
}

/**
 * Deux formes du même mot (« take » / « took », « figure » / « figured », « have gone » / « have went ») :
 * l'erreur porte sur la forme (conjugaison, accord), pas sur le choix du mot.
 */
export function sameWord(a: string, b: string, language: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return false;
  if (language === 'en') {
    const bx = englishBases(x);
    for (const v of englishBases(y)) if (bx.has(v)) return true;
    return false;
  }
  // Autres langues : même radical (préfixe commun assez long, terminaisons courtes).
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i >= 4 && x.length - i <= 4 && y.length - i <= 4;
}
