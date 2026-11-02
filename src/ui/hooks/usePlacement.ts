import { useMemo } from 'react';
import { useApp } from '@/app/store';
import { withMarks } from '@/core/learn/placementResults';
import type { PlacementRecord } from '@/core/domain/settings';

/** Placement de l'univers courant : résultat du test et corrections faites depuis, sur tous les appareils. */
export function usePlacement(): PlacementRecord | undefined {
  const universeId = useApp((s) => s.universe?.id);
  const record = useApp((s) => (universeId ? s.settings.placement[universeId] : undefined));
  const marks = useApp((s) => s.placementMarks);
  return useMemo(() => withMarks(record, marks), [record, marks]);
}
