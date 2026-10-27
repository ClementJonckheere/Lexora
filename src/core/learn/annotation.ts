import { wilsonLower } from '../reading/calibration';
import { matchSentence, sentences } from './patterns';

/**
 * Mesure de la précision du repérage : vous jugez, pour une cinquantaine de correspondances tirées de vrais livres,
 * si le passage surligné est bien un exemple du point. Le juge est une personne : c'est ce qui en fait une mesure.
 */

/** Correspondances à juger par point. */
export const TARGET_ANNOTATIONS = 50;
/** Précision à partir de laquelle un point est surligné dans le lecteur. */
export const HIGHLIGHT_PRECISION = 0.9;

export interface Candidate {
  key: string;
  sentence: string;
  start: number;
  end: number;
}

/** Jugement enregistré : 1 = juste, 0 = faux positif. La phrase est gardée pour l'export (traçabilité). */
export interface Verdict {
  v: 0 | 1;
  s: string;
  m: [number, number];
}

export type Annotations = Record<string, Record<string, Verdict>>;

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Tirage reproductible (même ordre d'une séance à l'autre pour un même point). */
function seeded(seed: string) {
  let s = Number.parseInt(hash(seed), 36) || 1;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

/** Toutes les correspondances d'un point dans des textes (paragraphes), sans doublon, dans un ordre aléatoire fixe. */
export function collectCandidates(pointId: string, paragraphs: string[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const text of paragraphs)
    for (const s of sentences(text)) {
      const sentence = s.text.trim();
      const offset = s.text.indexOf(sentence);
      for (const m of matchSentence(pointId, s.text)) {
        const start = m.start - offset;
        const end = m.end - offset;
        const key = hash(`${sentence}|${start}|${end}`);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, sentence, start, end });
      }
    }
  const rng = seeded(pointId);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface PrecisionEstimate {
  n: number;
  correct: number;
  precision: number | null;
  /** Borne basse (Wilson, 95 %) : un point n'est surligné que si elle dépasse le seuil. */
  lower: number | null;
  /** Assez de jugements pour conclure, et précision suffisante pour surligner. */
  enough: boolean;
  highlight: boolean;
}

export function precisionOf(verdicts: Record<string, Verdict> | undefined): PrecisionEstimate {
  const list = Object.values(verdicts ?? {});
  const n = list.length;
  const correct = list.filter((v) => v.v === 1).length;
  const precision = n ? correct / n : null;
  const lower = n ? wilsonLower(correct, n) : null;
  const enough = n >= TARGET_ANNOTATIONS;
  return { n, correct, precision, lower, enough, highlight: enough && precision !== null && precision >= HIGHLIGHT_PRECISION };
}

/** Fichier d'export : précision par point et jugements bruts (pour mettre à jour points.json, et l'analyser). */
export function exportAnnotations(annotations: Annotations, language: string, now = Date.now()) {
  return {
    version: 1,
    language,
    exportedAt: new Date(now).toISOString(),
    points: Object.fromEntries(Object.keys(annotations).map((id) => [id, precisionOf(annotations[id])])),
    annotations,
  };
}
