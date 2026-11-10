import { State } from 'ts-fsrs';
import { buildCloze, clozeKeywords, inflections, wordMatches } from '../domain/cloze';
import { primaryDirection, type Settings } from '../domain/settings';
import { tokenize } from '../domain/text';
import type { Note } from '../domain/types';
import { isEvaluationSentence } from '../learn/evaluationSplit';

/**
 * « Écoute et shadowing » : un parcours court par phrase enregistrée (Tatoeba) :
 * écouter sans texte → dire ce qu'on a compris (traduction, autoévaluation ; dictée facultative, comparée mot à mot)
 * → lire la transcription → répéter au micro et comparer les deux enregistrements à l'oreille → redire l'idée avec
 * ses propres mots. Sans notation automatique de la prononciation ; les enregistrements de l'utilisateur ne quittent
 * pas l'appareil et ne sont pas gardés. Sans effet sur FSRS.
 * Les phrases viennent de la banque public/listening/<langue>/sentences.json (scripts/listening-bank.ts) : d'abord
 * celles qui contiennent une expression déjà retenue en révision, puis des phrases du quotidien jamais entendues.
 */

/** Langues dont la banque d'écoute est générée (.github/workflows/listening.yml). */
export const LISTENING_LANGUAGES: readonly string[] = ['en'];

export interface ListeningSentence {
  id: number;
  text: string;
  fr: string;
  audioUrl: string;
  author: string;
  license: string;
}

/** Banque compacte : [id, texte, traduction, id d'enregistrement (0 : ancienne adresse), auteur, licence]. */
export interface ListeningBankFile {
  language: string;
  authors: string[];
  licenses: string[];
  items: [number, string, string, number, number, number][];
}

export interface ListeningAnswer {
  id: string;
  universeId: string;
  sentenceId: number;
  /** Note dont l'expression figure dans la phrase, '' sinon. */
  noteId: string;
  /** Compréhension autoévaluée : 1 pas compris, 2 en partie, 3 compris. */
  comprehension: 1 | 2 | 3;
  /** Dictée facultative (ce qui a été entendu), '' sinon. */
  dictation: string;
  /** Mots de la phrase retrouvés dans la dictée, en %, -1 sans dictée. */
  dictationScore: number;
  /** Nombre d'enregistrements de répétition. */
  shadowed: number;
  /** Idée redite avec ses propres mots. */
  reformulated: boolean;
  createdAt: number;
}

export interface ListeningItem {
  sentence: ListeningSentence;
  /** Note dont l'expression figure dans la phrase. */
  note: Note | null;
}

/** Licence d'enregistrement utilisable : Creative Commons (toutes variantes) ou domaine public ; jamais « pour Tatoeba seulement ». */
export function compatibleLicense(license: string): boolean {
  const l = license.trim();
  return /^CC[\s-]?(0|BY)/i.test(l) || /public domain/i.test(l);
}

/** Adresse de l'enregistrement : par son identifiant, ou l'ancienne adresse par phrase. */
export function audioUrl(audioId: number, sentenceId: number, tatoebaLanguage: string): string {
  return audioId > 0 ? `https://tatoeba.org/audio/download/${audioId}` : `https://audio.tatoeba.org/sentences/${tatoebaLanguage}/${sentenceId}.mp3`;
}

export function parseBank(file: ListeningBankFile, tatoebaLanguage: string): ListeningSentence[] {
  return file.items
    .map(([id, text, fr, audioId, author, license]) => ({
      id,
      text,
      fr,
      audioUrl: audioUrl(audioId, id, tatoebaLanguage),
      author: file.authors[author] ?? '',
      license: file.licenses[license] ?? '',
    }))
    .filter((s) => compatibleLicense(s.license) && !isEvaluationSentence(s.id));
}

/** Index des mots de la banque : mot normalisé → phrases qui le contiennent. */
export function wordIndex(sentences: readonly ListeningSentence[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  sentences.forEach((s, i) => {
    for (const w of new Set(tokenize(s.text))) {
      const xs = index.get(w);
      if (xs) xs.push(i);
      else index.set(w, [i]);
    }
  });
  return index;
}

/** Phrases de la banque qui contiennent l'expression (formes conjuguées comprises). */
export function sentencesWith(
  note: Note,
  sentences: readonly ListeningSentence[],
  index: Map<string, number[]>,
  language: string,
): ListeningSentence[] {
  const keywords = clozeKeywords(note.expression, language);
  if (!keywords.length) return [];
  // Le mot-clé le plus long réduit le plus les candidates ; la phrase est ensuite vérifiée en entier.
  const key = [...keywords].sort((a, b) => b.length - a.length)[0];
  const forms = language === 'en' ? [key, ...inflections(key)] : [...index.keys()].filter((w) => wordMatches(key, w, language));
  const candidates = new Set<number>();
  for (const f of forms) for (const i of index.get(f) ?? []) candidates.add(i);
  return [...candidates].map((i) => sentences[i]).filter((s) => buildCloze(note.expression, s.text, language) !== null);
}

/**
 * Séance : d'abord des phrases contenant une expression déjà retenue (une par note, les notes les moins écoutées
 * d'abord), puis des phrases du quotidien ; jamais une phrase déjà entendue tant qu'il en reste d'autres, ni une
 * phrase de ses propres exemples. Moitié au plus de phrases « avec vos expressions » quand la banque en offre peu.
 */
export function pickListening(
  sentences: readonly ListeningSentence[],
  notes: readonly Note[],
  answers: readonly ListeningAnswer[],
  settings: Pick<Settings, 'directions'>,
  language: string,
  max = 5,
  rng: () => number = Math.random,
  index: Map<string, number[]> = wordIndex(sentences),
): ListeningItem[] {
  const heard = new Set(answers.map((a) => a.sentenceId));
  const lastHeard = new Map<string, number>();
  for (const a of answers) if (a.noteId) lastHeard.set(a.noteId, Math.max(lastHeard.get(a.noteId) ?? 0, a.createdAt));
  const primary = primaryDirection(settings);
  const known = notes
    .filter((n) => !n.suspended && n.cards[primary]?.state === State.Review)
    .map((n) => ({ n, r: rng() }))
    .sort((a, b) => (lastHeard.get(a.n.id) ?? 0) - (lastHeard.get(b.n.id) ?? 0) || a.r - b.r)
    .map((x) => x.n);
  const out: ListeningItem[] = [];
  const used = new Set<number>();
  // Au plus 40 notes examinées : la recherche reste instantanée avec une grande bibliothèque.
  for (const note of known.slice(0, 40)) {
    if (out.length >= max) break;
    const own = new Set(note.examples.map((e) => tokenize(e).join(' ')));
    const found = sentencesWith(note, sentences, index, language).filter((s) => !used.has(s.id) && !own.has(tokenize(s.text).join(' ')));
    const fresh = found.filter((s) => !heard.has(s.id));
    const pool = fresh.length ? fresh : [];
    if (!pool.length) continue;
    const s = pool[Math.floor(rng() * pool.length)];
    used.add(s.id);
    out.push({ sentence: s, note });
  }
  // Phrases du quotidien : jamais entendues, de longueur moyenne d'abord (plus faciles à répéter).
  const rest = sentences
    .filter((s) => !used.has(s.id))
    .map((s) => ({ s, k: (heard.has(s.id) ? 2 : 0) + (s.text.length >= 20 && s.text.length <= 90 ? 0 : 1) + rng() }))
    .sort((a, b) => a.k - b.k);
  for (const { s } of rest) {
    if (out.length >= max) break;
    out.push({ sentence: s, note: null });
  }
  // Ordre mélangé : les phrases avec vos expressions ne viennent pas toutes d'abord.
  return out
    .map((x) => ({ x, r: rng() }))
    .sort((a, b) => a.r - b.r)
    .map(({ x }) => x);
}

export interface DictationWord {
  text: string;
  /** Retrouvé dans la dictée (ou ponctuation seule). */
  heard: boolean;
}

/** Dictée comparée mot à mot (plus longue sous-suite commune ; casse, accents et ponctuation ignorés). */
export function dictationDiff(expected: string, typed: string): { words: DictationWord[]; score: number } {
  const words = expected.split(/\s+/).filter(Boolean);
  const keys = words.map((w) => tokenize(w).join(' '));
  const got = tokenize(typed);
  const n = keys.length;
  const m = got.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = keys[i] && keys[i] === got[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const heard = new Array<boolean>(n).fill(false);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (keys[i] && keys[i] === got[j]) {
      heard[i] = true;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  const counted = keys.filter(Boolean).length;
  const matched = heard.filter((h, i) => h && keys[i]).length;
  return {
    words: words.map((text, i) => ({ text, heard: heard[i] || !keys[i] })),
    score: counted ? Math.round((100 * matched) / counted) : 0,
  };
}
