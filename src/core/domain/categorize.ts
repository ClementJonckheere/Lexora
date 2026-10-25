import { languageInfo } from './languages';
import { tokenize } from './text';

/**
 * Catégorisation automatique, locale et déterministe.
 * Évite d'avoir à ranger chaque expression : la catégorie reste modifiable.
 * Règles fines pour l'anglais (verbes, phrasal verbs) ; « Mot » / « Expression » pour les autres langues.
 */
export const AUTO_CATEGORIES = ['Mot', 'Verbe', 'Phrasal verb', 'Expression verbale', 'Expression'] as const;

const PARTICLES = new Set([
  'up', 'out', 'off', 'down', 'in', 'on', 'away', 'back', 'over', 'through', 'around', 'round',
  'about', 'along', 'into', 'across', 'forward', 'apart', 'ahead', 'behind', 'together', 'aside',
  'onto', 'upon',
]);

const PLACEHOLDERS = new Set(['sb', 'sth', 'someone', 'somebody', 'something', 'it', 'one', 'them', 'him', 'her', 'oneself']);

export function categorize(expression: string, language = 'en'): string {
  const trimmed = expression.trim();
  if (!trimmed) return '';
  if (languageInfo(language).noSpaces) {
    // Chinois / japonais : pas d'espaces ; une expression courte est considérée comme un mot.
    const chars = [...trimmed.replace(/[\s\p{P}]/gu, '')].length;
    return chars <= 3 ? 'Mot' : 'Expression';
  }
  const words = tokenize(trimmed);
  if (words.length === 0) return '';
  if (language !== 'en') return words.length === 1 ? 'Mot' : 'Expression';

  const hasTo = words[0] === 'to' && words.length > 1;
  const core = hasTo ? words.slice(1) : words;

  if (core.length === 1) return hasTo ? 'Verbe' : 'Mot';

  const second = core[1];
  const third = core[2];
  const isPhrasal =
    core.length <= 4 &&
    (PARTICLES.has(second) || (PLACEHOLDERS.has(second) && third !== undefined && PARTICLES.has(third)));
  if (isPhrasal) return 'Phrasal verb';
  if (hasTo) return 'Expression verbale';
  return 'Expression';
}
