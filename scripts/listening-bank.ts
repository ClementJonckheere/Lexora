// Banque d'écoute (« Écoute et shadowing », src/core/srs/listening.ts) : phrases Tatoeba d'une langue qui ont à la fois
// une traduction française, un enregistrement et une licence d'enregistrement compatible avec Lexora (licences
// Creative Commons ou domaine public : écoute sans modification, auteur et licence affichés). Les enregistrements
// « pour Tatoeba seulement » ou sans licence sont écartés.
//
// Exécuté par la CI (.github/workflows/listening.yml), qui télécharge les exports Tatoeba :
//   <l3>_sentences.tsv et fra_sentences.tsv (id, langue, texte), <l3>-fra_links.tsv (id, id français),
//   sentences_with_audio.csv (id de phrase, id d'enregistrement, auteur, licence, adresse d'attribution).
// Produit public/listening/<l2>/ :
//   - sentences.json : phrases d'entraînement (src/core/learn/evaluationSplit.ts) ;
//   - evaluation.json : un échantillon des phrases réservées à l'évaluation (mesure future de la compréhension d'un
//     enregistrement jamais entendu), jamais proposées à l'entraînement ;
//   - index.json : l'entonnoir des comptes (phrases, traduites, enregistrées, licence compatible, retenues).
// Écarte les phrases de scripts/grammar-blocklist.txt (thèmes sensibles), en langue étudiée et en français.
// Usage : npx vite-node scripts/listening-bank.ts <dossier des exports> <code ISO 639-3> <code ISO 639-1>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isEvaluationSentence } from '../src/core/learn/evaluationSplit';
import { compatibleLicense } from '../src/core/srs/listening';

const dir = process.argv[2] ?? 'tatoeba';
const l3 = process.argv[3] ?? 'eng';
const l2 = process.argv[4] ?? 'en';
/** Au-delà, la banque grossit sans gain pour une séance de quelques phrases : tirage stable par identifiant. */
const MAX_TRAINING = 30_000;
const MAX_EVALUATION = 1_000;
const MIN_LENGTH = 12;
const MAX_LENGTH = 140;

function lines(file: string): string[][] {
  return readFileSync(join(dir, file), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));
}

const sentences = new Map<number, string>();
for (const [id, , text] of lines(`${l3}_sentences.tsv`)) sentences.set(Number(id), text);
const french = new Map<number, string>();
for (const [id, , text] of lines('fra_sentences.tsv')) french.set(Number(id), text);
const frenchOf = new Map<number, string>();
for (const [a, b] of lines(`${l3}-fra_links.tsv`)) {
  const fr = french.get(Number(b));
  if (fr && sentences.has(Number(a)) && !frenchOf.has(Number(a))) frenchOf.set(Number(a), fr);
}


interface Audio {
  audioId: number;
  author: string;
  license: string;
}
const audios = new Map<number, Audio[]>();
const licenseCounts: Record<string, number> = {};
let format = '';
for (const cols of lines('sentences_with_audio.csv')) {
  const id = Number(cols[0]);
  if (!sentences.has(id)) continue;
  // Format actuel : id, id d'enregistrement, auteur, licence, attribution ; ancien : id, auteur, licence, attribution.
  const withAudioId = cols.length >= 5 && /^\d+$/.test(cols[1]);
  format ||= withAudioId ? 'id, audio_id, auteur, licence, attribution' : `ancien (${cols.length} colonnes)`;
  const a: Audio = withAudioId
    ? { audioId: Number(cols[1]), author: cols[2] ?? '', license: (cols[3] ?? '').replace(/^\\N$/, '') }
    : { audioId: 0, author: cols[1] ?? '', license: (cols[2] ?? '').replace(/^\\N$/, '') };
  licenseCounts[a.license || '(aucune)'] = (licenseCounts[a.license || '(aucune)'] ?? 0) + 1;
  const xs = audios.get(id);
  if (xs) xs.push(a);
  else audios.set(id, [a]);
}

const blocklist = readFileSync('scripts/grammar-blocklist.txt', 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => new RegExp(l, 'i'));
const blocked = (text: string) => blocklist.some((re) => re.test(text));

const funnel = {
  sentences: sentences.size,
  withFrench: frenchOf.size,
  withAudio: audios.size,
  withFrenchAndAudio: 0,
  compatibleLicense: 0,
  keptLength: 0,
  keptTopics: 0,
  training: 0,
  evaluation: 0,
};
type Item = { id: number; text: string; fr: string; audio: Audio };
const training: Item[] = [];
const evaluation: Item[] = [];
for (const [id, list] of audios) {
  const fr = frenchOf.get(id);
  if (!fr) continue;
  funnel.withFrenchAndAudio++;
  const audio = list.find((a) => compatibleLicense(a.license));
  if (!audio) continue;
  funnel.compatibleLicense++;
  const text = sentences.get(id)!;
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) continue;
  funnel.keptLength++;
  if (blocked(text) || blocked(fr)) continue;
  funnel.keptTopics++;
  (isEvaluationSentence(id) ? evaluation : training).push({ id, text, fr, audio });
}
funnel.training = training.length;
funnel.evaluation = evaluation.length;

/** Tirage stable (même résultat d'une génération à l'autre) quand il faut limiter la taille. */
const stable = (id: number) => Math.imul(id ^ 0x9e3779b9, 2654435761) >>> 0;
function compact(items: Item[], max: number) {
  const kept = items.length > max ? [...items].sort((a, b) => stable(a.id) - stable(b.id)).slice(0, max) : items;
  kept.sort((a, b) => a.id - b.id);
  const authors: string[] = [];
  const licenses: string[] = [];
  const index = (list: string[], v: string) => {
    const i = list.indexOf(v);
    return i >= 0 ? i : list.push(v) - 1;
  };
  return {
    language: l2,
    source: 'Tatoeba (https://tatoeba.org) : phrases CC BY 2.0 FR ; enregistrements sous la licence indiquée pour chacun',
    authors,
    licenses,
    // [id de phrase, texte, traduction française, id d'enregistrement (0 : ancienne adresse), auteur, licence]
    items: kept.map((s) => [s.id, s.text, s.fr, s.audio.audioId, index(authors, s.audio.author), index(licenses, s.audio.license)]),
  };
}

const out = join('public', 'listening', l2);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'sentences.json'), JSON.stringify(compact(training, MAX_TRAINING)));
writeFileSync(join(out, 'evaluation.json'), JSON.stringify(compact(evaluation, MAX_EVALUATION)));
const topLicenses = Object.entries(licenseCounts).sort((a, b) => b[1] - a[1]);
writeFileSync(
  join(out, 'index.json'),
  JSON.stringify(
    {
      language: l2,
      generated: new Date().toISOString().slice(0, 10),
      audioFormat: format,
      funnel,
      shipped: { training: Math.min(training.length, MAX_TRAINING), evaluation: Math.min(evaluation.length, MAX_EVALUATION) },
      licenses: Object.fromEntries(topLicenses),
    },
    null,
    2,
  ) + '\n',
);
console.log(`Format des enregistrements : ${format}`);
console.log(JSON.stringify(funnel, null, 2));
console.log('Licences des enregistrements :', topLicenses.slice(0, 12));
if (!existsSync(join(out, 'sentences.json')) || training.length === 0) {
  console.error('Aucune phrase retenue : vérifier le format des exports.');
  process.exit(1);
}
