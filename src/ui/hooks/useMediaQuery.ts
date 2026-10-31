import { useSyncExternalStore } from 'react';

/** Téléphone (version web installée) : même seuil que les règles CSS du téléphone. */
export const PHONE_QUERY = '(max-width: 720px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
