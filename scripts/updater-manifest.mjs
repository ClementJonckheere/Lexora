// Génère latest.json pour la mise à jour automatique (tauri-plugin-updater), Windows et, s'il a été construit, macOS.
// Usage : node scripts/updater-manifest.mjs <url de base des fichiers de la release> <sortie> --windows <dossier> [--macos <dossier>]
// Dossier Windows : nsis/*.exe(.sig) et msi/*.msi(.sig). Dossier macOS : macos/*.app.tar.gz(.sig), nommé avec la version.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const [baseUrl, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const windowsDir = option('--windows');
const macosDir = option('--macos');
if (!baseUrl || !out || !windowsDir) {
  console.error('usage: updater-manifest.mjs <baseUrl> <out> --windows <dir> [--macos <dir>]');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));

function signed(dir, ext) {
  const file = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(ext) && f.includes(version)) : undefined;
  if (!file) throw new Error(`Fichier ${ext} ${version} introuvable dans ${dir}`);
  const signature = readFileSync(join(dir, `${file}.sig`), 'utf8').trim();
  return { signature, url: `${baseUrl}/${encodeURIComponent(file)}` };
}

const nsis = signed(join(windowsDir, 'nsis'), '.exe');
const msi = signed(join(windowsDir, 'msi'), '.msi');
const platforms = {
  'windows-x86_64': nsis,
  'windows-x86_64-nsis': nsis,
  'windows-x86_64-msi': msi,
};
if (macosDir) {
  // Application universelle (Apple Silicon et Intel) : la même archive pour les deux architectures.
  const app = signed(join(macosDir, 'macos'), '.app.tar.gz');
  for (const arch of ['darwin-aarch64', 'darwin-x86_64']) {
    platforms[arch] = app;
    platforms[`${arch}-app`] = app;
  }
}
writeFileSync(out, JSON.stringify({ version, notes: `Lexora ${version}`, pub_date: new Date().toISOString(), platforms }, null, 2));
console.log(`latest.json ${version} (${Object.keys(platforms).join(', ')}) → ${out}`);
