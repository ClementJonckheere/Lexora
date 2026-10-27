import { useEffect, useRef } from 'react';

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Combinaison normalisée : « mod+k », « shift+?», « space », « 1 », « escape », « mod+enter ».
 * `mod` = Ctrl (ou Cmd sur macOS).
 */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  // Maj seule sur un caractère (« ? », « A ») est portée par la touche elle-même.
  if (e.shiftKey && (e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey)) parts.push('shift');
  let key = e.key === ' ' ? 'space' : e.key.toLowerCase();
  // Pavé numérique / AZERTY : les chiffres arrivent via e.code.
  // AZERTY : « 1 » arrive comme « & » ; on se fie à la touche physique pour les chiffres.
  if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  if (/^Numpad\d$/.test(e.code)) key = e.code.slice(6);
  parts.push(key);
  return parts.join('+');
}

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

interface Options {
  enabled?: boolean;
  /** Déclencher même pendant la saisie dans un champ (pour les combinaisons avec mod). */
  allowInInputs?: boolean | string[];
  capture?: boolean;
}

/** Raccourcis clavier actifs tant que le composant est monté. */
export function useHotkeys(map: HotkeyMap, { enabled = true, allowInInputs = false, capture = false }: Options = {}) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      const combo = comboOf(e);
      const handler = ref.current[combo];
      if (!handler) return;
      if (isTypingTarget(e.target)) {
        const ok = allowInInputs === true || (Array.isArray(allowInInputs) && allowInInputs.includes(combo));
        if (!ok) return;
      }
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    };
    window.addEventListener('keydown', onKey, { capture });
    return () => window.removeEventListener('keydown', onKey, { capture });
  }, [enabled, allowInInputs, capture]);
}
