/** Normalisation pour la recherche : minuscules, sans accents, apostrophes unifiées. */
export function normalizeSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clé de détection des doublons.
 * Les accents sont conservés (« año » ≠ « ano », « мой » ≠ « мои ») ; casse, ponctuation et espaces sont ignorés.
 * En anglais, le « to » initial est ignoré : « To tackle an issue » = « tackle an issue. ».
 */
export function expressionKey(expression: string, language = 'en'): string {
  const key = expression
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return language === 'en' ? key.replace(/^to /, '') : key;
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

/** Mots (toutes écritures), apostrophes internes conservées. */
export function tokenize(input: string): string[] {
  return normalizeSearch(input).match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? [];
}

/** Identifiant universel (synchronisation entre appareils). */
export function newId(): string {
  return crypto.randomUUID();
}
