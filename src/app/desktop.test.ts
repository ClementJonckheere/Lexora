import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/domain/settings';

const install = vi.fn<(onProgress?: (p: number | null) => void) => Promise<void>>();
vi.mock('@/core/platform/desktop', () => ({
  checkForUpdate: async () => ({ version: '9.9.9', notes: '', install }),
  notify: async () => true,
  onTrayAction: async () => () => {},
  setCloseToTray: async () => {},
  setTrayTooltip: async () => {},
}));
// Préférences locales (localStorage) en mémoire.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });

const { checkUpdates } = await import('./desktop');
const { useApp } = await import('./store');

describe('mises à jour de l’application Windows', () => {
  beforeEach(() => {
    install.mockReset();
    store.clear();
    useApp.setState({ update: null, updateProgress: undefined, settings: { ...DEFAULT_SETTINGS, autoUpdate: true }, toast: () => {} });
  });

  it('au démarrage, une nouvelle version s’installe d’elle-même', async () => {
    install.mockResolvedValue();
    await checkUpdates(false, true);
    expect(useApp.getState().update?.version).toBe('9.9.9');
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('réglage désactivé, ou vérification périodique : la version est proposée, pas installée', async () => {
    useApp.setState({ settings: { ...DEFAULT_SETTINGS, autoUpdate: false } });
    await checkUpdates(false, true);
    useApp.setState({ settings: { ...DEFAULT_SETTINGS, autoUpdate: true } });
    await checkUpdates();
    expect(useApp.getState().update?.version).toBe('9.9.9');
    expect(install).not.toHaveBeenCalled();
  });

  it('une installation ratée n’est pas retentée en boucle au redémarrage suivant', async () => {
    install.mockRejectedValue(new Error('réseau'));
    await checkUpdates(false, true);
    expect(useApp.getState().updateProgress).toBeUndefined();
    await checkUpdates(false, true);
    expect(install).toHaveBeenCalledTimes(1);
  });
});
