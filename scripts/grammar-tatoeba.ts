// Compte, pour chaque point de grammaire anglaise, les phrases Tatoeba où son motif trouve une correspondance :
// au total, et parmi celles qui ont une traduction française (indispensable aux exercices : la traduction lève
// l'ambiguïté d'une phrase à trous). Alerte si un point en a moins de MIN_CANDIDATES.
//
// Exécuté par la CI (.github/workflows/grammar.yml), qui télécharge les exports Tatoeba (CC BY 2.0 FR) :
//   eng_sentences.tsv, fra_sentences.tsv (id, langue, texte) et eng-fra_links.tsv (id anglais, id français).
// Produit aussi la banque d'exercices de chaque leçon rédigée (public/grammar/en/exercises/<leçon>.json), et celle des
// questions de placement des points sans leçon (public/grammar/en/placement/<point>.json).
// Écarte les phrases de la liste de mots bloqués (scripts/grammar-blocklist.txt) et celles que les utilisateurs ont
// signalées (<dossier des exports>/reported.json, lu par la CI dans Supabase), gardées d'une génération à l'autre dans
// public/grammar/en/exercises/excluded.json.
// Usage : npx vite-node scripts/grammar-tatoeba.ts <dossier des exports>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATTERN_IDS, matchSentence } from '../src/core/learn/patterns';
import { buildExercise, type Exercise } from '../src/core/learn/exercises';
import { PLACEMENT_BUILDERS, buildPlacementExercise } from '../src/core/learn/placementBuilders';
import { LESSON_BUILDERS, buildLessonExercise } from '../src/core/learn/lessonBuilders';
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
const MAX_FORM_SHARE = 0.6;
const freq = readFileSync('public/reading/freq/en.txt', 'utf8')
  .split('\n')
  .map((w) => w.trim())
  .filter(Boolean);
const vocabulary = new Set(freq);
const known = (w: string) => vocabulary.has(w);

let seed = 7;
const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

/** Thèmes à écarter (violences, suicide, sexualité, affirmations politiques contestées), en anglais et en français. */
const blocklist = readFileSync('scripts/grammar-blocklist.txt', 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => new RegExp(l, 'i'));
const blocked = (text: string) => blocklist.some((re) => re.test(text));

/** Exercices signalés (« ne correspond pas à la leçon ») : exclus pour de bon, et à chaque génération. */
const EXCLUDED_FILE = 'public/grammar/en/exercises/excluded.json';
const excluded = new Set<string>(existsSync(EXCLUDED_FILE) ? (JSON.parse(readFileSync(EXCLUDED_FILE, 'utf8')).items as string[]) : []);
const before = excluded.size;
if (existsSync(join(dir, 'reported.json'))) {
  const reported = JSON.parse(readFileSync(join(dir, 'reported.json'), 'utf8')) as { item_id: string; reporters: number }[];
  for (const r of Array.isArray(reported) ? reported : []) if (typeof r.item_id === 'string') excluded.add(r.item_id);
}
console.log(`${excluded.size} exercices exclus après signalement (${excluded.size - before} nouveaux)`);

/** Questions du placement écartées à la relecture (réponse discutable, phrase sans repère) : écartées des leçons aussi. */
const REVIEW_FILE = 'public/grammar/en/placement-excluded.json';
const rejected = new Set<string>(
  existsSync(REVIEW_FILE) ? (JSON.parse(readFileSync(REVIEW_FILE, 'utf8')).items as { id: string }[]).map((i) => i.id.split(':').slice(2).join(':')) : [],
);
console.log(`${rejected.size} exercices écartés à la relecture du placement`);

const lessons = JSON.parse(readFileSync('public/grammar/en/lessons.json', 'utf8')).lessons as { id: string }[];
mkdirSync('public/grammar/en/exercises', { recursive: true });
const translated = english.filter((s) => frenchText.has(frenchOf.get(s.id) ?? -1));
const kept = translated.filter((s) => !blocked(s.text) && !blocked(frenchText.get(frenchOf.get(s.id)!)!));
console.log(`${translated.length - kept.length} phrases traduites écartées par la liste de mots bloqués`);
/** Identifiants des exercices du fichier existant, dans leur ordre (banque stable d'une génération à l'autre). */
function previousIds(file: string): string[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).items as { id: string }[]).map((ex) => ex.id) : [];
}

/**
 * Banque équilibrée d'un générateur : tour à tour dans chaque nature de réponse, une même réponse plafonnée.
 * Stable : les exercices déjà présents (`previous`) restent en tête tant que le générateur les produit encore et qu'ils
 * ne sont ni bloqués ni exclus ; les nouveaux, tirés au hasard, complètent. Sans cela, retirer quelques phrases (liste de
 * mots bloqués, signalements) redistribuait tout le tirage et remplaçait les questions déjà relues.
 */
function makeBank(
  label: string,
  build: (s: { id: number; en: string; fr: string }) => Exercise | null,
  size: number,
  previous: readonly string[],
  skip?: Set<string>,
): Exercise[] {
  const all: Exercise[] = [];
  for (const s of kept) {
    const ex = build({ id: s.id, en: s.text, fr: frenchText.get(frenchOf.get(s.id)!)! });
    if (ex && !excluded.has(ex.id) && !skip?.has(ex.id)) all.push(ex);
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const rank = new Map(previous.map((id, i) => [id, i]));
  all.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  // Tour à tour dans chaque nature de réponse (will / présent…), pour une banque aussi équilibrée que possible.
  const byForm = new Map<string, Exercise[]>();
  for (const ex of all) byForm.set(ex.form ?? '', [...(byForm.get(ex.form ?? '') ?? []), ex]);
  const queues = [...byForm.values()];
  const perAnswer = new Map<string, number>();
  const cap = Math.max(5, Math.floor(size * MAX_SAME_ANSWER));
  const items: Exercise[] = [];
  while (items.length < size && queues.some((q) => q.length))
    for (const q of queues) {
      if (items.length >= size) break;
      // Prochain exercice de cette nature dont la réponse n'a pas atteint son plafond.
      while (q.length) {
        const ex = q.shift()!;
        const n = perAnswer.get(ex.answer) ?? 0;
        if (n >= cap) continue;
        perAnswer.set(ex.answer, n + 1);
        items.push(ex);
        break;
      }
    }
  // Aucune nature de réponse au-delà de 60 % de la banque (contrôle de bankChecks.ts) : répondre toujours pareil ne
  // doit pas suffire. Les derniers exercices de la nature dominante sont retirés.
  for (;;) {
    const counts = new Map<string, number>();
    for (const ex of items) counts.set(ex.form ?? '', (counts.get(ex.form ?? '') ?? 0) + 1);
    if (counts.size < 2) break;
    const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (n <= MAX_FORM_SHARE * items.length) break;
    items.splice(items.map((ex) => ex.form ?? '').lastIndexOf(top), 1);
  }
  const forms = [...byForm.keys()].filter(Boolean);
  const share = forms.map((f) => `${f} ${items.filter((ex) => ex.form === f).length}`).join(', ');
  const reused = items.filter((ex) => rank.has(ex.id)).length;
  console.log(
    `${label.padEnd(32)} ${String(all.length).padStart(6)} exercices possibles, ${items.length} gardés dont ${reused} de la génération précédente${share ? ` (${share})` : ''}`,
  );
  // Échantillon dans le journal, pour la relecture : 6 exercices par nature de réponse.
  for (const f of forms.length ? forms : ['']) {
    const sample = items.filter((ex) => (ex.form ?? '') === f).slice(0, 6);
    for (const ex of sample)
      console.log(
        `  [${f || '-'}] ${ex.before}⟦${ex.answer}${ex.hint ? ` (${ex.hint})` : ''}${ex.choices ? ` {${ex.choices.join(' | ')}}` : ''}${ex.accept ? ` +${ex.accept.join('/')}` : ''}⟧${ex.after}  ‖ ${ex.fr}`,
      );
  }
  return items;
}

const bankSizes: Record<string, number> = {};
for (const { id } of lessons) {
  // Leçons A1 et A2 : mêmes générateurs que les questions du placement (placementBuilders.ts), banque plus grande ;
  // leçons B1 ajoutées en 2.29 : lessonBuilders.ts.
  const build = id in PLACEMENT_BUILDERS ? buildPlacementExercise : id in LESSON_BUILDERS ? buildLessonExercise : buildExercise;
  const items = makeBank(`leçon ${id}`, (s) => build(id, s, known), BANK_SIZE, previousIds(`public/grammar/en/exercises/${id}.json`), rejected);
  bankSizes[id] = items.length;
  if (items.length < MIN_CANDIDATES) console.log(`::warning::Leçon ${id} : seulement ${items.length} exercices`);
  writeFileSync(
    `public/grammar/en/exercises/${id}.json`,
    `${JSON.stringify({ version: 1, lesson: id, generatedAt: new Date().toISOString(), source: 'Tatoeba (CC BY 2.0 FR)', items })}\n`,
  );
}

/* ------------------------------------------- questions du placement A1, A2 --- */

// Points A1 et A2 : une petite banque par point, dont scripts/placement-bank.ts tire ses questions (relues, stables
// d'une génération à l'autre ; la banque de la leçon, plus grande, sert aux exercices).
const PLACEMENT_BANK_SIZE = 60;
mkdirSync('public/grammar/en/placement', { recursive: true });
const placementSizes: Record<string, number> = {};
for (const id of Object.keys(PLACEMENT_BUILDERS)) {
  const items = makeBank(`placement ${id}`, (s) => buildPlacementExercise(id, s, known), PLACEMENT_BANK_SIZE, previousIds(`public/grammar/en/placement/${id}.json`));
  placementSizes[id] = items.length;
  if (items.length < 8) console.log(`::warning::Placement ${id} : seulement ${items.length} questions possibles`);
  writeFileSync(
    `public/grammar/en/placement/${id}.json`,
    `${JSON.stringify({ version: 1, point: id, generatedAt: new Date().toISOString(), source: 'Tatoeba (CC BY 2.0 FR)', items })}\n`,
  );
}
writeFileSync(
  EXCLUDED_FILE,
  `${JSON.stringify({ version: 1, note: 'Exercices signalés par les utilisateurs, exclus des banques.', items: [...excluded].sort() }, null, 1)}\n`,
);
writeFileSync('public/grammar/en/exercises/index.json', `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), sizes: bankSizes })}\n`);
writeFileSync('public/grammar/en/placement/index.json', `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), sizes: placementSizes })}\n`);
