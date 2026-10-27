// Génère docs/grammaire-anglais.md à partir de public/grammar/en/points.json (source unique).
// Usage : node scripts/grammar-doc.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8'));
const byId = new Map(data.points.map((p) => [p.id, p]));
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const DETECT = { yes: 'oui', partial: 'en partie', no: 'non' };

const lines = [
  '# Parcours de grammaire anglaise (brouillon à valider)',
  '',
  `Généré depuis [\`public/grammar/en/points.json\`](../public/grammar/en/points.json) par \`node scripts/grammar-doc.mjs\` : modifier le JSON, pas ce fichier.`,
  '',
  `${data.points.length} points, de A1 à C1. Chaque point : une explication courte, 3 à 5 exemples, puis des exercices tirés de phrases réelles (Tatoeba), révisés par FSRS.`,
  '',
  '- **Prérequis** : un point se débloque quand ses prérequis sont acquis ; le test de placement s’en sert pour déduire les points non testés.',
  '- **Piège francophone** : erreur typique testée quel que soit le niveau (on peut être C1 et garder une erreur de A2).',
  '- **Repérable** : peut être surligné dans vos livres de façon fiable (oui), avec des faux positifs (en partie), ou pas sans analyse grammaticale (non).',
  '',
];
for (const level of LEVELS) {
  const pts = data.points.filter((p) => p.level === level);
  lines.push(`## ${level} (${pts.length} points)`, '', '| Point | Exemple | Prérequis | Piège francophone | Repérable |', '|---|---|---|---|---|');
  for (const p of pts) {
    const req = p.requires.length ? p.requires.map((r) => byId.get(r).title.replace(/\|/g, '/')).join(' ; ') : '-';
    lines.push(`| **${p.title}** \`${p.id}\` | ${p.example} | ${req} | ${p.frenchTrap ?? ''} | ${DETECT[p.detect]} |`);
  }
  lines.push('');
}
writeFileSync('docs/grammaire-anglais.md', `${lines.join('\n')}\n`);
console.log(`docs/grammaire-anglais.md : ${data.points.length} points`);
