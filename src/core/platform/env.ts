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

/** Ordinateur Apple (application macOS, ou navigateur sur Mac). */
export function isMac(): boolean {
  // Un iPad se présente aussi comme « Macintosh » : on l'écarte par l'écran tactile.
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) && !/iPhone|iPad|iPod/i.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1);
}

/**
 * Mots propres au système de l'ordinateur, pour les textes de l'interface : nom du système, endroit où vit l'icône
 * de Lexora (zone de notification de Windows, barre des menus du Mac), où ajouter une voix.
 */
export function systemWords(): { name: string; tray: string; trayHint: string; addVoice: string } {
  return isMac()
    ? {
        name: 'macOS',
        tray: 'la barre des menus',
        trayHint: "Lexora reste actif dans la barre des menus, en haut de l'écran. Pour quitter : clic sur l'icône → Quitter.",
        addVoice: 'macOS : Réglages Système → Accessibilité → Contenu énoncé → Voix du système → Gérer les voix',
      }
    : {
        name: 'Windows',
        tray: 'la zone de notification',
        trayHint: "Lexora reste actif près de l'horloge. Pour quitter : clic droit sur l'icône → Quitter.",
        addVoice: 'Windows : Paramètres → Heure et langue → Voix → Ajouter des voix',
      };
}

/** Libellé de raccourci adapté au Mac : Ctrl → ⌘, Alt → ⌥ (les raccourcis eux-mêmes acceptent déjà ⌘ : `mod`). */
export function keyLabel(text: string): string {
  return isMac() ? text.replace(/\bCtrl\b/g, '⌘').replace(/\bAlt\b/g, '⌥') : text;
}
