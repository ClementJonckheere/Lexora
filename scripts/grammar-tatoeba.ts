// Compte, pour chaque point de grammaire anglaise, les phrases Tatoeba où son motif trouve une correspondance :
// au total, et parmi celles qui ont une traduction française (indispensable aux exercices : la traduction lève
// l'ambiguïté d'une phrase à trous). Alerte si un point en a moins de MIN_CANDIDATES.
//
// Exécuté par la CI (.github/workflows/grammar.yml), qui télécharge les exports Tatoeba (CC BY 2.0 FR) :
//   eng_sentences.tsv, fra_sentences.tsv (id, langue, texte) et eng-fra_links.tsv (id anglais, id français).
// Produit aussi la banque d'exercices de chaque leçon rédigée (public/grammar/en/exercises/<leçon>.json).
// Usage : npx vite-node scripts/grammar-tatoeba.ts <dossier des exports>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATTERN_IDS, matchSentence } from '../src/core/learn/patterns';
import { buildExercise, type Exercise } from '../src/core/learn/exercises';
import { mkdirSync } from 'node:fs';

const MIN_CANDIDATES = 30;
const SAMPLES = 5;
const dir = process.argv[2] ?? 'tatoeba';

function readTsv(file: string): string[][] {
  return readFileSync(join(dir, file), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));
}

const english = readTsv('eng_sentences.tsv').map(([id, , text]) => ({ id: Number(id), text }));
const withFrench = new Set<number>();
const frenchOf = new Map<number, number>();
const linksFile = existsSync(join(dir, 'eng-fra_links.tsv')) ? 'eng-fra_links.tsv' : null;
if (linksFile)
  for (const [a, b] of readTsv(linksFile)) {
    withFrench.add(Number(a));
    if (!frenchOf.has(Number(a))) frenchOf.set(Number(a), Number(b));
  }
const frenchText = new Map<number, string>();
if (existsSync(join(dir, 'fra_sentences.tsv'))) for (const [id, , text] of readTsv('fra_sentences.tsv')) frenchText.set(Number(id), text);
console.log(`${english.length} phrases anglaises, ${withFrench.size} avec une traduction française`);

const points = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8')).points as { id: string; level: string; title: string }[];
const counts: Record<string, { total: number; withFrench: number; samples: string[] }> = {};
for (const id of PATTERN_IDS) counts[id] = { total: 0, withFrench: 0, samples: [] };
for (const s of english) {
  // Phrases courtes à moyennes : celles qui font de bons exercices.
  if (s.text.length > 160) continue;
  for (const id of PATTERN_IDS) {
    if (!matchSentence(id, s.text).length) continue;
    const c = counts[id];
    c.total++;
    if (withFrench.has(s.id)) {
      c.withFrench++;
      if (c.samples.length < SAMPLES) c.samples.push(s.text);
    }
  }
}

const short: string[] = [];
for (const p of points) {
  const c = counts[p.id];
  if (!c) continue;
  console.log(`${p.level} ${p.id.padEnd(28)} ${String(c.total).padStart(7)} phrases, ${String(c.withFrench).padStart(6)} avec traduction`);
  if (c.withFrench < MIN_CANDIDATES) short.push(`${p.id} (${c.withFrench})`);
}
if (short.length) console.log(`::warning::Moins de ${MIN_CANDIDATES} phrases traduites pour : ${short.join(', ')}`);

writeFileSync(
  'public/grammar/en/tatoeba-counts.json',
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), sentences: english.length, withFrench: withFrench.size, minCandidates: MIN_CANDIDATES, short, counts }, null, 1)}\n`,
);

/* ------------------------------------------------- banques d'exercices --- */

const BANK_SIZE = 300;
/** Une même réponse (« said », « for »…) ne dépasse pas cette part de la banque : variété des exercices. */
const MAX_SAME_ANSWER = 0.2;
const freq = readFileSync('public/reading/freq/en.txt', 'utf8').split('\n').map((w) => w.trim()).filter(Boolean);
const vocabulary = new Set(freq);
const known = (w: string) => vocabulary.has(w);

let seed = 7;
const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const lessons = JSON.parse(readFileSync('public/grammar/en/lessons.json', 'utf8')).lessons as { id: string }[];
mkdirSync('public/grammar/en/exercises', { recursive: true });
const translated = english.filter((s) => frenchText.has(frenchOf.get(s.id) ?? -1));
const bankSizes: Record<string, number> = {};
for (const { id } of lessons) {
  const all: Exercise[] = [];
  for (const s of translated) {
    const ex = buildExercise(id, { id: s.id, en: s.text, fr: frenchText.get(frenchOf.get(s.id)!)! }, known);
    if (ex) all.push(ex);
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const perAnswer = new Map<string, number>();
  const cap = Math.max(5, Math.floor(BANK_SIZE * MAX_SAME_ANSWER));
  const items: Exercise[] = [];
  for (const ex of all) {
    if (items.length >= BANK_SIZE) break;
    const n = perAnswer.get(ex.answer) ?? 0;
    if (n >= cap) continue;
    perAnswer.set(ex.answer, n + 1);
    items.push(ex);
  }
  bankSizes[id] = items.length;
  console.log(`leçon ${id.padEnd(22)} ${String(all.length).padStart(6)} exercices possibles, ${items.length} gardés`);
  if (items.length < MIN_CANDIDATES) console.log(`::warning::Leçon ${id} : seulement ${items.length} exercices`);
  writeFileSync(`public/grammar/en/exercises/${id}.json`, `${JSON.stringify({ version: 1, lesson: id, generatedAt: new Date().toISOString(), source: 'Tatoeba (CC BY 2.0 FR)', items })}\n`);
}
writeFileSync('public/grammar/en/exercises/index.json', `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), sizes: bankSizes })}\n`);
