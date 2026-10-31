import { languageInfo } from '../domain/languages';
import { chapterDisplay } from './gutenberg';

/**
 * Sélection dans un livre : l'expression choisie et la phrase du livre qui la contient
 * (l'exemple de la fiche, authentique et dans son contexte).
 */

/** Longueur maximale de l'exemple (au-delà, on coupe à une virgule ou un point-virgule). */
const MAX_SENTENCE = 260;
const MAX_EXPRESSION = 80;
const MAX_WORDS = 8;

const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|Prof|Mme|Mlle|M|Sra|Srta|Hr|Fr|Nr|etc|vs|p)\.$/;
const END = /[.!?…。！？]/;
const CLOSERS = /["'”’»)\]」』]/;

/** Une fin de phrase se termine-t-elle à l'indice `i` (inclus) ? */
function isSentenceEnd(text: string, i: number): boolean {
  if (!END.test(text[i])) return false;
  // « Mr. Bennet » n'est pas une fin de phrase.
  if (text[i] === '.' && ABBREVIATIONS.test(text.slice(Math.max(0, i - 6), i + 1))) return false;
  let j = i + 1;
  while (j < text.length && (END.test(text[j]) || CLOSERS.test(text[j]))) j++;
  if (/[。！？]/.test(text[i]) || j >= text.length) return true;
  if (!/\s/.test(text[j])) return false;
  // « “Go home!” and left » : la phrase continue après une minuscule.
  let k = j;
  while (k < text.length && /\s/.test(text[k])) k++;
  return !/\p{Ll}/u.test(text[k] ?? '');
}

/** +1 pour un guillemet ouvrant, −1 pour un fermant (l'apostrophe d'un mot n'est pas un guillemet). */
function quoteDelta(text: string, i: number): number {
  const c = text[i];
  if (c === '“' || c === '«' || c === '„') return 1;
  if (c === '”' || c === '»') return -1;
  if (c === '"' || c === "'" || c === '‘' || c === '’') {
    const before = i === 0 ? ' ' : text[i - 1];
    const after = text[i + 1] ?? ' ';
    if (/[\s(—–-]/.test(before) && /\p{L}/u.test(after)) return 1;
    if (/[\p{L}.!?,;…]/u.test(before) && /[\s,.;:!?—–)]|$/.test(after)) return c === "'" || c === '’' ? (/[.!?,;…]/.test(before) ? -1 : 0) : -1;
  }
  return 0;
}

/** La ponctuation finale en `i` est-elle suivie d'un guillemet fermant ? */
function closesQuote(text: string, i: number): boolean {
  let j = i + 1;
  while (j < text.length && END.test(text[j])) j++;
  return CLOSERS.test(text[j] ?? '');
}

/** Phrase qui contient les caractères [start, end[ du paragraphe. */
export function sentenceAround(text: string, start: number, end: number): string {
  let a = 0;
  for (let i = Math.min(start, text.length) - 1; i >= 0; i--) {
    if (isSentenceEnd(text, i)) {
      a = i + 1;
      while (a < text.length && CLOSERS.test(text[a]) && !/\s/.test(text[a - 1])) a++;
      break;
    }
  }
  let b = text.length;
  // Pas de coupure à l'intérieur d'une citation (« 'Oh dear! Oh dear! I shall be late!' »).
  let quoted = 0;
  for (let i = a; i < text.length; i++) {
    quoted += quoteDelta(text, i);
    if (i < Math.max(end, start)) continue;
    if (isSentenceEnd(text, i) && (quoted <= 0 || closesQuote(text, i))) {
      b = i + 1;
      while (b < text.length && CLOSERS.test(text[b])) b++;
      break;
    }
  }
  let sentence = text.slice(a, b).trim();
  if (sentence.length > MAX_SENTENCE) sentence = clauseAround(text.slice(a, b), start - a, end - a);
  return sentence.replace(/\s+/g, ' ').trim();
}

/** Phrase trop longue : la proposition autour de la sélection (entre virgules, points-virgules, deux-points). */
function clauseAround(sentence: string, start: number, end: number): string {
  const cut = /[,;:—]/;
  let a = 0;
  for (let i = start - 1; i >= 0; i--) {
    if (cut.test(sentence[i]) && start - i > 40) {
      a = i + 1;
      break;
    }
  }
  let b = sentence.length;
  for (let i = end; i < sentence.length; i++) {
    if (cut.test(sentence[i]) && i - end > 40) {
      b = i;
      break;
    }
  }
  const core = sentence.slice(a, b).trim();
  return `${a > 0 ? '… ' : ''}${core}${b < sentence.length ? ' …' : ''}`;
}

export interface SelectionCheck {
  expression: string;
  /** Raison du refus, si la sélection ne peut pas devenir une fiche. */
  error?: string;
}

/**
 * Nettoie le texte sélectionné : ponctuation et guillemets autour, espaces,
 * majuscule de début de phrase (sauf noms en allemand, « I » anglais, sigles).
 */
export function cleanSelection(raw: string, language: string, atSentenceStart: boolean): SelectionCheck {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[\s"'“”‘’«»()[\]¿¡—–-]+/u, '').replace(/[\s"'“”‘’«»()[\],.;:!?…—–-]+$/u, '');
  if (!s) return { expression: '', error: 'Sélectionnez un mot ou une expression.' };
  if (s.length > MAX_EXPRESSION) return { expression: s, error: 'Sélection trop longue : choisissez un mot ou une expression courte.' };
  if (!languageInfo(language).noSpaces && s.split(' ').length > MAX_WORDS) {
    return { expression: s, error: `Sélection trop longue (${MAX_WORDS} mots au plus).` };
  }
  if (!/\p{L}/u.test(s)) return { expression: s, error: 'Sélectionnez un mot ou une expression.' };
  const first = s.split(' ')[0];
  const isAcronym = first.length > 1 && first === first.toUpperCase();
  if (atSentenceStart && language !== 'de' && first !== 'I' && !isAcronym) s = s[0].toLocaleLowerCase(language) + s.slice(1);
  // Mot écrit en capitales dans le texte (« VERY ») : forme normale.
  if (s.length > 1 && s === s.toUpperCase() && /\p{Lu}/u.test(s) && s.split(' ').every((w) => w.length > 2)) s = s.toLocaleLowerCase(language);
  return { expression: s };
}

/** La sélection commence-t-elle une phrase du paragraphe ? */
export function startsSentence(text: string, start: number): boolean {
  let i = start - 1;
  while (i >= 0 && (/\s/.test(text[i]) || CLOSERS.test(text[i]) || /["'“‘«¿¡—–-]/.test(text[i]))) i--;
  return i < 0 || isSentenceEnd(text, i);
}

/** Mention de la source, enregistrée dans la note. */
export function sourceNote(title: string, author: string, chapterTitle: string): string {
  const where = chapterTitle ? `, ${chapterDisplay(chapterTitle).replace(/\.$/, '').trim()}` : '';
  return `Lu dans « ${title} »${author ? ` (${author})` : ''}${where}.`;
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}'’-]/u;

/**
 * Mot touché dans un paragraphe (début et fin, en caractères), apostrophes et traits d'union compris (« don't »,
 * « well-known ») mais pas en bordure. `at` peut tomber juste après le mot (position du curseur).
 */
export function wordAt(text: string, at: number): [number, number] | null {
  let i = at;
  if (!WORD_CHAR.test(text[i] ?? '')) {
    if (!WORD_CHAR.test(text[i - 1] ?? '')) return null;
    i--;
  }
  let start = i;
  let end = i + 1;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  while (start < end && /['’-]/.test(text[start])) start++;
  while (end > start && /['’-]/.test(text[end - 1])) end--;
  return start < end ? [start, end] : null;
}
