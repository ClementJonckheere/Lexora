// Banque du placement grammatical (public/grammar/en/placement.json), tirée des banques d'exercices des leçons.
// Exécuté par la CI après la génération des banques (.github/workflows/grammar.yml), ou à la main :
//   npx vite-node scripts/placement-bank.ts
// Les points sans leçon (ni banque) sont listés dans le fichier : ils attendent des questions générées ou rédigées.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { placementItems, type PlacementItem } from '../src/core/learn/placementBank';
import type { Exercise } from '../src/core/learn/exercises';

const DIR = 'public/grammar/en';
const points = JSON.parse(readFileSync(`${DIR}/points.json`, 'utf8')).points as { id: string; level: string; title: string }[];
const lessons = JSON.parse(readFileSync(`${DIR}/lessons.json`, 'utf8')).lessons as { id: string }[];
const counts = JSON.parse(readFileSync(`${DIR}/tatoeba-counts.json`, 'utf8')).counts as Record<string, { withFrench: number }>;
const excludedFile = `${DIR}/exercises/excluded.json`;
const excluded = new Set<string>(existsSync(excludedFile) ? JSON.parse(readFileSync(excludedFile, 'utf8')).items : []);

const items: PlacementItem[] = [];
const covered: Record<string, { typed: number; choice2: number; choice3plus: number }> = {};
/** Points du parcours servis par la banque d'une leçon : la leçon elle-même, et be-used-to (phrases de la leçon used to). */
const sources = [...lessons.map(({ id }) => ({ target: id, lesson: id })), { target: 'be-used-to', lesson: 'used-to' }];
for (const { target: id, lesson } of sources) {
  const file = `${DIR}/exercises/${lesson}.json`;
  if (!existsSync(file)) continue;
  const bank = JSON.parse(readFileSync(file, 'utf8')).items as Exercise[];
  const chosen = placementItems(lesson, bank, excluded, id);
  if (chosen.length < 2) continue; // le moteur pose au moins deux questions par point
  items.push(...chosen);
  covered[id] = {
    typed: chosen.filter((q) => q.mode === 'typed').length,
    choice2: chosen.filter((q) => q.mode === 'choice' && q.choices === 2).length,
    choice3plus: chosen.filter((q) => q.mode === 'choice' && q.choices! >= 3).length,
  };
}

const missing = points
  .filter((p) => !covered[p.id])
  .map((p) => ({ id: p.id, level: p.level, title: p.title, tatoebaWithFrench: counts[p.id]?.withFrench ?? 0 }));
for (const p of points)
  if (covered[p.id]) {
    const c = covered[p.id];
    console.log(`${p.level} ${p.id.padEnd(28)} ${c.typed} tapées, ${c.choice3plus} choix ≥ 3, ${c.choice2} choix à 2`);
  }
console.log(`${items.length} questions pour ${Object.keys(covered).length} points ; ${missing.length} points sans questions`);

writeFileSync(
  `${DIR}/placement.json`,
  `${JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: 'Tatoeba (CC BY 2.0 FR), banques des leçons',
      status: 'généré automatiquement, à relire avant activation',
      covered,
      missing,
      items,
    },
    null,
    1,
  )}\n`,
);
