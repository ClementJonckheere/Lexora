// Génère latest.json pour la mise à jour automatique (tauri-plugin-updater).
// Usage : node scripts/updater-manifest.mjs <dossier bundle> <url de base des fichiers de la release> <sortie>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [bundleDir, baseUrl, out] = process.argv.slice(2);
if (!bundleDir || !baseUrl || !out) {
  console.error('usage: updater-manifest.mjs <bundleDir> <baseUrl> <out>');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));

function signed(sub, ext) {
  const dir = join(bundleDir, sub);
  const file = readdirSync(dir).find((f) => f.endsWith(ext) && f.includes(version));
  if (!file) throw new Error(`Installateur ${ext} ${version} introuvable dans ${dir}`);
  const signature = readFileSync(join(dir, `${file}.sig`), 'utf8').trim();
  return { signature, url: `${baseUrl}/${encodeURIComponent(file)}` };
}

const nsis = signed('nsis', '.exe');
const msi = signed('msi', '.msi');
const manifest = {
  version,
  notes: `Lexora ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': nsis,
    'windows-x86_64-nsis': nsis,
    'windows-x86_64-msi': msi,
  },
};
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`latest.json ${version} → ${out}`);
