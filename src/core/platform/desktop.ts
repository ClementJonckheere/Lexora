import { isTauri } from './env';

/**
 * Intégration au bureau Windows : mise à jour automatique, démarrage avec Windows,
 * zone de notification, presse-papiers, notifications. Sans effet dans l'aperçu navigateur.
 */

export interface AvailableUpdate {
  version: string;
  notes: string;
  install(onProgress?: (percent: number | null) => void): Promise<void>;
}

/** Vérifie la présence d'une nouvelle version (GitHub Releases, signée). */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri()) return null;
  const [{ check }, { relaunch }] = await Promise.all([import('@tauri-apps/plugin-updater'), import('@tauri-apps/plugin-process')]);
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? '',
    async install(onProgress) {
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0;
        if (e.event === 'Progress') {
          received += e.data.chunkLength;
          onProgress?.(total ? Math.round((received / total) * 100) : null);
        }
      });
      await relaunch();
    },
  };
}

export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  const { isEnabled } = await import('@tauri-apps/plugin-autostart');
  return isEnabled();
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const { enable, disable } = await import('@tauri-apps/plugin-autostart');
  await (enabled ? enable() : disable());
}

export async function setCloseToTray(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_close_to_tray', { enabled });
}

export async function setTrayTooltip(text: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_tray_tooltip', { text });
}

/** Actions du menu de l'icône (« Ajouter une expression », « Réviser »). */
export async function onTrayAction(handler: (action: 'add' | 'review') => void): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen<'add' | 'review'>('tray-action', (e) => handler(e.payload));
}

/** Texte du presse-papiers, uniquement s'il ressemble à une expression (court, une ligne). */
export async function readClipboardExpression(): Promise<string | null> {
  let text = '';
  try {
    if (isTauri()) {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      text = (await readText()) ?? '';
    } else if (navigator.clipboard?.readText) {
      text = await navigator.clipboard.readText();
    }
  } catch {
    return null;
  }
  return clipboardExpression(text);
}

export function clipboardExpression(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || /\r|\n/.test(text.trim()) || /^https?:\/\//i.test(t)) return null;
  // Évite de pré-remplir avec un nombre, un code, un chemin…
  if (!/\p{L}/u.test(t) || /[\\/{}<>=]|^\d/.test(t)) return null;
  return t.replace(/^[«"“'‘(]+|[»"”'’).,;:!?]+$/g, '').trim() || null;
}

export async function notify(title: string, body: string): Promise<boolean> {
  try {
    if (isTauri()) {
      const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === 'granted';
      if (!granted) return false;
      sendNotification({ title, body });
      return true;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
      return true;
    }
  } catch {
    /* notifications indisponibles */
  }
  return false;
}

/** Ouvre une adresse dans le navigateur par défaut. */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}
