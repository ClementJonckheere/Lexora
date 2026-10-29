import { useEffect } from 'react';
import type { ThemeMode } from '@/core/domain/settings';

/**
 * Fond de l'interface : clair (papier) ou sombre (nuit). Le réglage « système » suit Windows et change avec lui.
 * Le dernier fond appliqué est retenu sur l'appareil pour le reprendre dès le démarrage, avant le chargement des
 * réglages (sinon l'écran clignoterait en clair une fraction de seconde).
 */

const CACHE_KEY = 'lexora.theme';

const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function resolveTheme(mode: ThemeMode, prefersDark = systemDark()): 'light' | 'dark' {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

function apply(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    /* stockage indisponible : le fond sera recalculé au prochain démarrage */
  }
}

/** Au démarrage : le dernier fond connu, sinon celui du système. */
export function applyInitialTheme() {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(CACHE_KEY);
  } catch {
    cached = null;
  }
  document.documentElement.dataset.theme = cached === 'dark' || cached === 'light' ? cached : resolveTheme('system');
}

/** Applique le réglage, et suit les changements du système quand il est sur « système ». */
export function useTheme(mode: ThemeMode) {
  useEffect(() => {
    apply(resolveTheme(mode));
    if (mode !== 'system' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply(resolveTheme('system', query.matches));
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mode]);
}
