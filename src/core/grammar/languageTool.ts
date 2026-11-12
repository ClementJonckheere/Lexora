/**
 * Correction des phrases libres par LanguageTool (correcteur à règles, open source, non génératif), sur le serveur
 * de l'utilisateur, appelé par la fonction Supabase « grammar » (adresse gardée en secret sur le serveur).
 * LanguageTool signale des fautes possibles (orthographe, grammaire, accord, style) ; il ne dit pas si la phrase
 * exprime le sens voulu : l'autoévaluation reste nécessaire.
 */

export interface GrammarIssue {
  offset: number;
  length: number;
  /** Explication de la règle (dans la langue vérifiée). */
  message: string;
  /** Corrections proposées (trois au plus). */
  replacements: string[];
  /** misspelling, grammar, style… (champ issueType de LanguageTool). */
  type: string;
  ruleId: string;
}

/** Codes LanguageTool par langue de l'application ; une langue absente n'est pas vérifiée. */
const LT_LANGUAGES: Record<string, string> = {
  en: 'en-US', fr: 'fr', es: 'es', de: 'de-DE', pt: 'pt-PT', it: 'it', nl: 'nl', pl: 'pl-PL', ru: 'ru-RU', sv: 'sv',
  uk: 'uk-UA', el: 'el-GR', ja: 'ja-JP', zh: 'zh-CN', ar: 'ar', da: 'da-DK',
};

export function languageToolCode(language: string): string | null {
  return LT_LANGUAGES[language] ?? null;
}

/**
 * Règles écartées : sur une phrase tapée vite dans un exercice, majuscule initiale, point final, espaces ou
 * guillemets typographiques ne sont pas ce qu'on travaille.
 */
const IGNORED_RULES = new Set([
  'UPPERCASE_SENTENCE_START',
  'PUNCTUATION_PARAGRAPH_END',
  'WHITESPACE_RULE',
  'EN_QUOTES',
  'DASH_RULE',
  'COMMA_PARENTHESIS_WHITESPACE',
  'FRENCH_WHITESPACE',
  'APOS_TYP',
]);

type Json = Record<string, unknown>;

/** Lecture tolérante de la réponse de LanguageTool (/v2/check). */
export function parseLanguageTool(json: unknown, text: string): GrammarIssue[] {
  const matches = Array.isArray((json as Json | null)?.matches) ? ((json as Json).matches as Json[]) : [];
  const out: GrammarIssue[] = [];
  for (const m of matches) {
    const rule = (m.rule ?? {}) as Json;
    const ruleId = String(rule.id ?? '');
    const offset = Number(m.offset);
    const length = Number(m.length);
    if (IGNORED_RULES.has(ruleId) || !Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || offset + length > text.length) continue;
    out.push({
      offset,
      length,
      message: String(m.message ?? m.shortMessage ?? '').trim(),
      replacements: (Array.isArray(m.replacements) ? (m.replacements as Json[]) : [])
        .map((r) => String(r.value ?? ''))
        .filter(Boolean)
        .slice(0, 3),
      type: String(rule.issueType ?? ''),
      ruleId,
    });
  }
  return out.sort((a, b) => a.offset - b.offset);
}

/** Découpe la phrase en morceaux, ceux qui portent un signalement à part (pour les souligner). */
export function markIssues(text: string, issues: readonly GrammarIssue[]): { text: string; issue: GrammarIssue | null }[] {
  const parts: { text: string; issue: GrammarIssue | null }[] = [];
  let at = 0;
  for (const i of issues) {
    if (i.offset < at) continue; // chevauchement : le premier signalement l'emporte
    if (i.offset > at) parts.push({ text: text.slice(at, i.offset), issue: null });
    parts.push({ text: text.slice(i.offset, i.offset + i.length), issue: i });
    at = i.offset + i.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), issue: null });
  return parts;
}

/** Vérifie une phrase (fonction Supabase « grammar ») ; ServiceUnavailable si le serveur n'est pas configuré. */
export async function checkSentence(text: string, language: string): Promise<GrammarIssue[] | null> {
  const code = languageToolCode(language);
  if (!code || !text.trim()) return null;
  const { invokeOptional } = await import('../platform/serverCheck');
  return parseLanguageTool(await invokeOptional('grammar', { text: text.trim(), language: code }), text.trim());
}
