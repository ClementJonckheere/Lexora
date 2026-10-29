import { useEffect, useState } from 'react';
import { useApp } from '@/app/store';
import { computeXp, type XpSummary } from '@/core/progress/xp';
import { loadXpEvents } from '@/core/repo/xpRepo';

/** XP, niveau et rang de l'univers en cours, recalculés après chaque révision ou exercice. */
export function useXp(): XpSummary | null {
  const db = useApp((s) => s.db);
  const universe = useApp((s) => s.universe);
  const revision = useApp((s) => s.revision);
  const grammar = useApp((s) => s.grammarAnswers);
  const [xp, setXp] = useState<XpSummary | null>(null);

  useEffect(() => {
    if (!db || !universe) return;
    let alive = true;
    loadXpEvents(db, universe.id, grammar)
      .then((events) => alive && setXp(computeXp(events)))
      .catch(() => alive && setXp(null));
    return () => {
      alive = false;
    };
  }, [db, universe, revision, grammar]);

  return xp;
}
