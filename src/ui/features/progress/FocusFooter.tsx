import { useCallback, useEffect, useRef, useState } from 'react';
import { FocusMeter, type XpEvent } from '@/core/progress/xp';

const mult = (m: number) => `×${String(m).replace('.', ',')}`;

/** Compteur de concentration d'une séance : `add` à chaque réponse, `state` pour le pied de page. */
export function useFocusMeter() {
  const meter = useRef(new FocusMeter());
  const [, setTick] = useState(0);
  // Les minutes avancent entre deux réponses ; une pause de plus de 2 minutes les remet à zéro.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const add = useCallback((e: XpEvent) => {
    meter.current.add(e);
    setTick((t) => t + 1);
  }, []);
  return { add, state: meter.current.state() };
}

/** Pied de page discret de la séance : minutes sans pause, palier atteint et XP gagnée. */
export function FocusFooter({ state }: { state: ReturnType<FocusMeter['state']> }) {
  return (
    <div className="focus-footer" aria-live="off">
      <span>{state.minutes > 0 ? `flux · ${state.minutes} min` : 'flux'}</span>
      <span className={state.multiplier > 1 ? 'gold' : ''}>
        {state.multiplier > 1 ? `${mult(state.multiplier)} · ` : ''}+ {state.gained} XP
      </span>
    </div>
  );
}
