/**
 * Notation de la prononciation (facultative, réglage `pronunciationScoring`) : l'enregistrement de la répétition
 * (Écoute et shadowing) est envoyé, avec la phrase de référence, à la fonction Supabase « pronounce », qui le
 * transmet à Azure AI Speech (évaluation de la prononciation) puis l'oublie. Seules les notes sont gardées.
 * Une bonne note ne garantit pas une prononciation naturelle ; elle mesure l'écart à la phrase lue.
 */

export interface WordScore {
  word: string;
  /** Précision 0-100 ; null quand le mot manque. */
  accuracy: number | null;
  /** None, Mispronunciation, Omission, Insertion… */
  error: string;
}

export interface PronunciationScore {
  /** Note globale 0-100. */
  score: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  /** Ce qu'Azure a reconnu. */
  recognized: string;
  words: WordScore[];
}

type Json = Record<string, unknown>;
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * Lecture de la réponse d'Azure (format détaillé) ; les notes sont soit dans PronunciationAssessment, soit
 * directement sur le résultat selon la version de l'API. null si rien n'a été reconnu.
 */
export function parseAssessment(json: unknown): PronunciationScore | null {
  const root = (json ?? {}) as Json;
  if (root.RecognitionStatus !== 'Success') return null;
  const best = (Array.isArray(root.NBest) ? (root.NBest as Json[]) : [])[0];
  if (!best) return null;
  const pa = (best.PronunciationAssessment ?? best) as Json;
  const score = num(pa.PronScore) ?? num(best.PronScore);
  if (score === null) return null;
  const words = (Array.isArray(best.Words) ? (best.Words as Json[]) : []).map((w) => {
    const wa = (w.PronunciationAssessment ?? w) as Json;
    const error = String(wa.ErrorType ?? 'None');
    return { word: String(w.Word ?? ''), accuracy: error === 'Omission' ? null : num(wa.AccuracyScore), error };
  });
  const round = (x: number | null) => Math.round(x ?? 0);
  return {
    score: round(score),
    accuracy: round(num(pa.AccuracyScore)),
    fluency: round(num(pa.FluencyScore)),
    completeness: round(num(pa.CompletenessScore)),
    recognized: String(best.Display ?? best.Lexical ?? ''),
    words,
  };
}

/** Niveau d'un mot pour l'affichage. */
export function wordLevel(w: WordScore): 'good' | 'fair' | 'poor' | 'missing' | 'extra' {
  if (w.error === 'Omission') return 'missing';
  if (w.error === 'Insertion') return 'extra';
  const a = w.accuracy ?? 0;
  return a >= 80 ? 'good' : a >= 60 ? 'fair' : 'poor';
}

/** WAV PCM 16 bits mono (format attendu par Azure pour une évaluation courte). */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return buffer;
}

/** Au-delà, l'évaluation courte d'Azure refuse l'enregistrement : on ne l'envoie pas. */
export const MAX_SECONDS = 30;

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Note un enregistrement WAV 16 kHz (fonction Supabase « pronounce ») ; null si rien n'a été reconnu. */
export async function assessPronunciation(wav: ArrayBuffer, text: string, speechLang: string): Promise<PronunciationScore | null> {
  const { invokeOptional } = await import('../platform/serverCheck');
  return parseAssessment(await invokeOptional('pronounce', { audio: base64(wav), text: text.trim(), lang: speechLang }));
}
