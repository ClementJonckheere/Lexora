export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Adresse d'un fichier de public/ (grammar, reading…) : relative à la base de l'application, pour que la version web
 * fonctionne aussi dans un sous-dossier (GitHub Pages : /Lexora/).
 */
export function assetUrl(path: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\//, '')}`;
}
