// Génère docs/grammaire-anglais.md à partir de public/grammar/en/points.json (source unique).
// Usage : node scripts/grammar-doc.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8'));
const byId = new Map(data.points.map((p) => [p.id, p]));
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const title = (id) => byId.get(id).title.replace(/\|/g, '/');

/** Nombre de points qui dépendent strictement de chacun (descendants par requires). */
const dependents = new Map(data.points.map((p) => [p.id, new Set()]));
const ancestors = (id, seen = new Set()) => {
  for (const r of byId.get(id).requires) if (!seen.has(r)) ancestors(r, seen.add(r));
  return seen;
};
for (const p of data.points) for (const a of ancestors(p.id)) dependents.get(a).add(p.id);

const detect = (p) => (p.detect === null ? 'à mesurer' : `${Math.round(p.detect * 100)} %`);
const lines = [
  '# Parcours de grammaire anglaise (brouillon à valider)',
  '',
  'Généré depuis [`public/grammar/en/points.json`](../public/grammar/en/points.json) par `node scripts/grammar-doc.mjs` : modifier le JSON, pas ce fichier.',
  '',
  `${data.points.length} points de A1 à C1, ${data.traps.length} pièges francophones, ${data.collections.length} collections de notes.`,
  '',
  '- **Prérequis stricts** (`requires`) : on ne peut pas maîtriser le point sans eux. Seuls ces liens servent à déduire, dans le test de placement, les points non testés.',
  '- **Après** (`after`) : ordre conseillé du parcours, jamais utilisé pour déduire.',
  '- **Dépendants** : nombre de points qui dépendent strictement de celui-ci (impact d’une erreur de déduction).',
  '- **Repérage** : précision mesurée du surlignage dans les livres, sur une cinquantaine de correspondances annotées (surligné seulement à partir de 90 % ; en dessous, le motif sert seulement à trouver des phrases d’exercice).',
  '- **Pièges** : testés à part, chacun sa fiche FSRS, hors déduction (on peut être C1 et garder une erreur de A1).',
  '',
];
for (const level of LEVELS) {
  const pts = data.points.filter((p) => p.level === level);
  lines.push(`## ${level} (${pts.length} points)`, '', '| Point | Exemple | Prérequis stricts | Après | Dépendants | Repérage |', '|---|---|---|---|---|---|');
  for (const p of pts) {
    const req = p.requires.length ? p.requires.map(title).join(' ; ') : '-';
    const after = p.after.length ? p.after.map(title).join(' ; ') : '-';
    const fp = p.falsePositive ? ` (faux positif : ${p.falsePositive})` : '';
    lines.push(`| **${p.title}** \`${p.id}\` | ${p.example} | ${req} | ${after} | ${dependents.get(p.id).size} | ${detect(p)}${fp} |`);
  }
  lines.push('');
}
lines.push(`## Pièges francophones (${data.traps.length})`, '', '| Niveau | Piège | Faux | Juste | Point |', '|---|---|---|---|---|');
for (const t of [...data.traps].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)))
  lines.push(`| ${t.level} | ${t.title} \`${t.id}\` | ~~${t.wrong}~~ | ${t.right} | ${title(t.point)} |`);
lines.push('', '## Hors grammaire : collections de notes', '');
for (const c of data.collections) lines.push(`- **${c.title}** : ${c.note}`);
writeFileSync('docs/grammaire-anglais.md', `${lines.join('\n')}\n`);
console.log(`docs/grammaire-anglais.md : ${data.points.length} points, ${data.traps.length} pièges`);
