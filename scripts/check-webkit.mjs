// Contrôle du JavaScript livré (dist/) pour les WebKit plus anciens que Safari 16.4 (Mac sous macOS 11 et 12 non à
// jour) : une expression régulière avec lookbehind (?<! / (?<=) y est une erreur de syntaxe qui empêche toute
// l'interface de démarrer. Usage : node scripts/check-webkit.mjs [dossier]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.argv[2] ?? 'dist', 'assets');
const bad = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(join(dir, f), 'utf8');
  for (const m of text.matchAll(/\(\?<[!=]/g)) bad.push(`${f} : ${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}`);
}
if (bad.length) {
  console.error(`Lookbehind dans le JavaScript livré (refusé avant Safari 16.4) :\n${bad.join('\n')}`);
  process.exit(1);
}
console.log('JavaScript livré : aucun lookbehind.');
