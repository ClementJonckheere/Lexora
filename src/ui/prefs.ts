/** Préférences d'affichage locales (non critiques) : localStorage, avec repli silencieux. */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`lexora.${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`lexora.${key}`, JSON.stringify(value));
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
}
