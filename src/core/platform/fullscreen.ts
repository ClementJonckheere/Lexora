import { isTauri } from './env';

/** Plein écran de la fenêtre (application) ou du document (aperçu navigateur). */
export async function setFullscreen(on: boolean): Promise<void> {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setFullscreen(on);
    return;
  }
  if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  if (!on && document.fullscreenElement) await document.exitFullscreen?.();
}

export async function isFullscreen(): Promise<boolean> {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().isFullscreen();
  }
  return !!document.fullscreenElement;
}
