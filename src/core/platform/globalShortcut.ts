import { isTauri } from './env';

let current: string | null = null;

/**
 * Raccourci système (fonctionne même quand Lexora est en arrière-plan) :
 * ramène la fenêtre au premier plan puis appelle `onTrigger`.
 */
export async function registerGlobalShortcut(shortcut: string, onTrigger: () => void): Promise<string | null> {
  if (!isTauri()) return null;
  const [{ register, unregister }, { getCurrentWindow }] = await Promise.all([
    import('@tauri-apps/plugin-global-shortcut'),
    import('@tauri-apps/api/window'),
  ]);
  if (current) {
    await unregister(current).catch(() => undefined);
    current = null;
  }
  if (!shortcut) return null;
  await register(shortcut, async (event) => {
    if (event.state !== 'Pressed') return;
    const w = getCurrentWindow();
    await w.unminimize().catch(() => undefined);
    await w.show().catch(() => undefined);
    await w.setFocus().catch(() => undefined);
    onTrigger();
  });
  current = shortcut;
  return shortcut;
}
