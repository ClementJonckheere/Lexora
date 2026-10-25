import { cleanText } from './text';

/**
 * Import par collage : une entrée par ligne.
 *   To tackle an issue ; S'attaquer à un problème ; We need to tackle this issue.
 * Séparateurs acceptés (par ordre de priorité) : tabulation, « ; », « | », « = », « — », « – », « - », « : ».
 * Le 3e champ (facultatif) est un exemple ; les champs suivants sont des exemples supplémentaires.
 */
export interface ParsedLine {
  line: number;
  raw: string;
  expression: string;
  translation: string;
  examples: string[];
  error?: string;
}

const SEPARATORS: RegExp[] = [/\t/, /\s*;\s*/, /\s*\|\s*/, /\s+=\s+/, /\s+[—–]\s+/, /\s+-\s+/, /\s+:\s+/];

export function splitLine(raw: string): string[] {
  for (const sep of SEPARATORS) {
    const parts = raw.split(sep);
    if (parts.length >= 2) return parts.map(cleanText);
  }
  return [cleanText(raw)];
}

export function parseBulk(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    const [expression = '', translation = '', ...rest] = splitLine(raw);
    const entry: ParsedLine = {
      line: idx + 1,
      raw,
      expression,
      translation,
      examples: rest.filter(Boolean),
    };
    if (!expression) entry.error = 'Expression anglaise manquante';
    else if (!translation) entry.error = 'Traduction manquante (séparateur attendu : « ; »)';
    out.push(entry);
  });
  return out;
}
