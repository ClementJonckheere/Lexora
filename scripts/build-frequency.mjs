// Construit les listes de fréquence utilisées pour estimer le niveau des livres.
// Source : FrequencyWords (Hermit Dave), sous-titres OpenSubtitles 2018 — contenu CC BY-SA 4.0.
// https://github.com/hermitdave/FrequencyWords
//
// Usage : node scripts/build-frequency.mjs <dossier des fichiers xx_50k.txt>
// Sortie : public/reading/freq/<langue>.txt (un mot — ou un caractère pour le chinois et le japonais — par ligne,
// du plus fréquent au moins fréquent).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: build-frequency.mjs <dossier>');
  process.exit(1);
}

const WORDS = 50000;
const CHARS = 5000;
const SPACED = { en: 'en', es: 'es', pt: 'pt', de: 'de', it: 'it', ru: 'ru', ko: 'ko', ar: 'ar', nl: 'nl', fr: 'fr' };
const CHARACTER = { zh: 'zh_cn', ja: 'ja' };
const out = 'public/reading/freq';
mkdirSync(out, { recursive: true });

function entries(file) {
  return readFileSync(join(src, `${file}.txt`), 'utf8')
    .split('\n')
    .map((l) => l.trim().split(' '))
    .filter((p) => p.length === 2)
    .map(([w, n]) => [w.normalize('NFC').toLowerCase(), Number(n)]);
}

for (const [code, file] of Object.entries(SPACED)) {
  const seen = new Set();
  const words = [];
  for (const [w] of entries(file)) {
    if (!/^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(w) || seen.has(w)) continue;
    seen.add(w);
    words.push(w);
    if (words.length >= WORDS) break;
  }
  writeFileSync(join(out, `${code}.txt`), words.join('\n') + '\n');
  console.log(code, words.length);
}

for (const [code, file] of Object.entries(CHARACTER)) {
  const counts = new Map();
  for (const [w, n] of entries(file)) {
    for (const ch of w) if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) counts.set(ch, (counts.get(ch) ?? 0) + n);
  }
  const chars = [...counts].sort((a, b) => b[1] - a[1]).slice(0, CHARS).map(([c]) => c);
  writeFileSync(join(out, `${code}.txt`), chars.join('\n') + '\n');
  console.log(code, chars.length);
}

writeFileSync(
  join(out, 'SOURCE.md'),
  `Listes de fréquence dérivées de [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave),
sous-titres OpenSubtitles 2018. Contenu sous licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Générées par \`scripts/build-frequency.mjs\` : mots en minuscules (${WORDS} max), caractères pour le chinois et le japonais (${CHARS} max).
`,
);
