import { BAND_EDGES, bandOf, bandWidth } from './coverage';
import { decreasing, WORDS_PER_BAND, type TestAnswer } from './vocabTest';

/**
 * Recalage du test de vocabulaire par la lecture.
 *
 * Deux sortes de signaux, qui ne se traitent pas pareil :
 * 1. Décisions dans « Mots du chapitre » (« Je connais » ou « Ajouter ») : des mots présentés, deux issues
 *    possibles. Elles comptent comme des réponses de test supplémentaires.
 * 2. Mots sélectionnés en lisant : un clic prouve que le mot est inconnu, mais ne pas cliquer ne prouve pas qu'on le
 *    connaît (on saute souvent les mots inconnus). Ils ne servent qu'à plafonner une tranche : parmi les mots d'une
 *    tranche rencontrés dans les chapitres ouverts, la part cliquée est une borne basse de la part inconnue.
 *    On prend la borne basse de Wilson de ce taux, pour qu'une poignée de clics ne fasse pas tout basculer.
 */

export type ObservationSource = 'chapter' | 'select' | 'exposure';

export interface Observation {
  source: ObservationSource;
  word: string;
  rank: number | null;
  known: boolean;
}

/** Nombre minimal de mots rencontrés dans une tranche pour que les clics la plafonnent. */
export const MIN_EXPOSURES = 20;

/** Borne basse de l'intervalle de Wilson (unilatéral, 95 %) d'une proportion k / n. */
export function wilsonLower(k: number, n: number, z = 1.645): number {
  if (n <= 0) return 0;
  const p = k / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - margin) / (1 + z2 / n));
}

interface BandEvidence {
  /** Réponses du test (vrais mots). */
  testN: number;
  /** Décisions « Mots du chapitre ». */
  decisions: number;
  decisionsKnown: number;
  /** Mots rencontrés (chapitres ouverts) et, parmi eux, sélectionnés comme inconnus. */
  exposures: number;
  clicks: number;
}

function evidence(answers: TestAnswer[], observations: Observation[]): BandEvidence[] {
  const ev: BandEvidence[] = BAND_EDGES.map(() => ({ testN: 0, decisions: 0, decisionsKnown: 0, exposures: 0, clicks: 0 }));
  if (answers.length) for (const a of answers) if (a.real && a.band >= 0 && a.band < ev.length) ev[a.band].testN++;
  else for (const e of ev) e.testN = WORDS_PER_BAND; // test enregistré sans ses réponses brutes
  const selected = new Map<string, boolean>();
  for (const o of observations) if (o.source === 'select') selected.set(o.word, o.known);
  for (const o of observations) {
    if (o.rank == null) continue;
    const b = bandOf(o.rank);
    if (b >= ev.length) continue;
    if (o.source === 'chapter') {
      ev[b].decisions++;
      if (o.known) ev[b].decisionsKnown++;
    } else if (o.source === 'exposure') {
      ev[b].exposures++;
      if (selected.get(o.word) === false) ev[b].clicks++;
    }
  }
  return ev;
}

export interface RefinedKnowledge {
  bands: number[];
  vocabSize: number;
  /** Nombre de signaux de lecture pris en compte. */
  decisions: number;
  exposures: number;
  clicks: number;
}

/** Tranches du test recalées par la lecture. */
export function refineBands(testBands: number[], answers: TestAnswer[], observations: Observation[]): RefinedKnowledge {
  const ev = evidence(answers, observations);
  const raw = ev.map((e, b) => {
    const pTest = testBands[b] ?? 0;
    const n = e.testN + e.decisions;
    let p = n ? (pTest * e.testN + e.decisionsKnown) / n : pTest;
    if (e.exposures >= MIN_EXPOSURES) p = Math.min(p, 1 - wilsonLower(e.clicks, e.exposures));
    return p;
  });
  const bands = decreasing(
    raw,
    ev.map((e) => e.testN + e.decisions),
  ).map((p) => Math.round(Math.max(0, Math.min(1, p)) * 1000) / 1000);
  const vocabSize = Math.round(bands.reduce((s, p, b) => s + p * bandWidth(b), 0) / 50) * 50;
  return {
    bands,
    vocabSize,
    decisions: ev.reduce((s, e) => s + e.decisions, 0),
    exposures: ev.reduce((s, e) => s + e.exposures, 0),
    clicks: ev.reduce((s, e) => s + e.clicks, 0),
  };
}

export interface CalibrationRow {
  band: number;
  /** Part de mots connus prédite par le test seul. */
  predicted: number;
  /** Décisions « Mots du chapitre » et part « Je connais ». */
  decisions: number;
  observedKnown: number | null;
  /** Mots rencontrés et part sélectionnée (borne basse de la part inconnue). */
  exposures: number;
  clickRate: number | null;
}

/**
 * Validation du test par la lecture : probabilité prédite par le test, tranche par tranche, face à ce que vous faites.
 * `brier` : erreur quadratique moyenne des décisions (0 = parfait ; 0,25 = pas mieux que pile ou face).
 */
export function calibrationReport(testBands: number[], answers: TestAnswer[], observations: Observation[]): { rows: CalibrationRow[]; brier: number | null } {
  const ev = evidence(answers, observations);
  let sq = 0;
  let n = 0;
  for (const o of observations) {
    if (o.source !== 'chapter' || o.rank == null) continue;
    const p = testBands[bandOf(o.rank)] ?? 0;
    sq += (p - (o.known ? 1 : 0)) ** 2;
    n++;
  }
  return {
    rows: ev.map((e, band) => ({
      band,
      predicted: testBands[band] ?? 0,
      decisions: e.decisions,
      observedKnown: e.decisions ? e.decisionsKnown / e.decisions : null,
      exposures: e.exposures,
      clickRate: e.exposures ? e.clicks / e.exposures : null,
    })),
    brier: n ? sq / n : null,
  };
}
