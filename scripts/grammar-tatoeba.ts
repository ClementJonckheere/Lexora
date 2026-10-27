// Compte, pour chaque point de grammaire anglaise, les phrases Tatoeba où son motif trouve une correspondance :
// au total, et parmi celles qui ont une traduction française (indispensable aux exercices : la traduction lève
// l'ambiguïté d'une phrase à trous). Alerte si un point en a moins de MIN_CANDIDATES.
//
// Exécuté par la CI (.github/workflows/grammar.yml), qui télécharge les exports Tatoeba (CC BY 2.0 FR) :
//   eng_sentences.tsv, fra_sentences.tsv (id, langue, texte) et eng-fra_links.tsv (id anglais, id français).
// Usage : npx vite-node scripts/grammar-tatoeba.ts <dossier des exports>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATTERN_IDS, matchSentence } from '../src/core/learn/patterns';

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
const linksFile = existsSync(join(dir, 'eng-fra_links.tsv')) ? 'eng-fra_links.tsv' : null;
if (linksFile) for (const [a] of readTsv(linksFile)) withFrench.add(Number(a));
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
