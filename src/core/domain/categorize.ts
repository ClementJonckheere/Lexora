import { tokenize } from './text';

/**
 * Catégorisation automatique, locale et déterministe.
 * Évite d'avoir à ranger chaque expression : la catégorie reste modifiable.
 */
export const AUTO_CATEGORIES = ['Mot', 'Verbe', 'Phrasal verb', 'Expression verbale', 'Expression'] as const;

const PARTICLES = new Set([
  'up', 'out', 'off', 'down', 'in', 'on', 'away', 'back', 'over', 'through', 'around', 'round',
  'about', 'along', 'into', 'across', 'forward', 'apart', 'ahead', 'behind', 'together', 'aside',
  'onto', 'upon',
]);

const PLACEHOLDERS = new Set(['sb', 'sth', 'someone', 'somebody', 'something', 'it', 'one', 'them', 'him', 'her', 'oneself']);

export function categorize(expression: string): string {
  const words = tokenize(expression);
  if (words.length === 0) return '';
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
