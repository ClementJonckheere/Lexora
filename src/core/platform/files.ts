import { isTauri } from './env';

export interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * Enregistre un fichier texte. Application : boîte de dialogue native.
 * Aperçu navigateur : téléchargement. Retourne le chemin (ou le nom), null si annulé.
 */
export async function saveTextFile(defaultName: string, contents: string, filters: FileFilter[]): Promise<string | null> {
  if (isTauri()) {
    const [{ save }, { invoke }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/core')]);
    const path = await save({ defaultPath: defaultName, filters });
    if (!path) return null;
    await invoke('write_text_file', { path, contents });
    return path;
  }
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: defaultName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName;
}

export interface PickedFile {
  name: string;
  path: string | null;
  text: () => Promise<string>;
}

/** Ouvre un fichier choisi par l'utilisateur. */
export async function pickFile(filters: FileFilter[]): Promise<PickedFile | null> {
  if (isTauri()) {
    const [{ open }, { invoke }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/core')]);
    const path = await open({ multiple: false, directory: false, filters });
    if (!path || Array.isArray(path)) return null;
    return {
      name: path.split(/[\\/]/).pop() ?? path,
      path,
      text: () => invoke<string>('read_text_file', { path }),
    };
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(','),
    });
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, path: null, text: () => file.text() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export interface AppInfo {
  version: string;
  dbPath: string;
  backupDir: string;
}

export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<AppInfo>('app_info');
}

export async function backupDbFile(): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('backup_now');
}
