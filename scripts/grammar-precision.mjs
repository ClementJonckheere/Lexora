// Reporte dans public/grammar/en/points.json la précision mesurée par annotation (export de l'écran
// « Repérage de la grammaire »), puis régénère docs/grammaire-anglais.md.
// Usage : node scripts/grammar-precision.mjs lexora-reperage-grammaire-AAAA-MM-JJ.json [autre-export.json…]
// Plusieurs exports (plusieurs personnes) sont cumulés : un même passage jugé deux fois compte deux fois.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MIN = 50;
const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage : node scripts/grammar-precision.mjs export.json [export2.json…]');
  process.exit(1);
}
const totals = new Map();
for (const f of files) {
  const exp = JSON.parse(readFileSync(f, 'utf8'));
  for (const [id, verdicts] of Object.entries(exp.annotations ?? {})) {
    const t = totals.get(id) ?? { n: 0, correct: 0 };
    for (const v of Object.values(verdicts)) {
      t.n++;
      if (v.v === 1) t.correct++;
    }
    totals.set(id, t);
  }
}
const path = 'public/grammar/en/points.json';
const data = JSON.parse(readFileSync(path, 'utf8'));
for (const p of data.points) {
  const t = totals.get(p.id);
  if (!t) continue;
  p.detectN = t.n;
  p.detect = t.n >= MIN ? Math.round((t.correct / t.n) * 1000) / 1000 : null;
  console.log(`${p.id.padEnd(28)} ${String(t.n).padStart(4)} jugés · ${Math.round((t.correct / t.n) * 100)} %${t.n < MIN ? ' (pas assez de jugements)' : ''}`);
}
writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`);
execFileSync('node', ['scripts/grammar-doc.mjs'], { stdio: 'inherit' });
