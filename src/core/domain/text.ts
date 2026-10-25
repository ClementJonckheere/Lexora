/** Normalisation pour la recherche : minuscules, sans accents, apostrophes unifiées. */
export function normalizeSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clé de détection des doublons.
 * « To tackle an issue », « tackle an issue » et « to Tackle an  issue. » ont la même clé.
 */
export function expressionKey(expression: string): string {
  return normalizeSearch(expression)
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^to /, '');
}

/** Nettoie une saisie : espaces superflus, retours ligne. */
export function cleanText(input: string | undefined | null): string {
  return (input ?? '').replace(/\s+/g, ' ').trim();
}

/** Nettoie une liste (exemples, tags) : vide, doublons insensibles à la casse. */
export function cleanList(items: (string | undefined | null)[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items ?? []) {
    const v = cleanText(raw);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Tokens alphabétiques (anglais), apostrophes internes conservées. */
export function tokenize(input: string): string[] {
  return normalizeSearch(input).match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? [];
}
