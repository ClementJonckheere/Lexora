import { useApp } from './store';
import type { FsrsFit } from '@/core/domain/settings';
import { loadReviewHistory } from '@/core/repo/fsrsRepo';
import { fitParameters, type FitResult } from '@/core/srs/optimizer';
import { personalWeights } from '@/core/srs/scheduler';

export interface ScopeOutcome {
  /** « all » ou l'identifiant de l'univers. */
  scope: string;
  name: string;
  /** null : pas assez de révisions pour ce périmètre. */
  fit: FitResult | null;
}

/**
 * Calcule les paramètres FSRS personnels : toutes langues, puis chaque langue qui a assez de révisions. Chaque
 * résultat est comparé, sur les révisions de contrôle, aux paramètres utilisés aujourd'hui pour ce périmètre ; il
 * n'est retenu que s'il prédit mieux. Les échéances déjà fixées ne bougent pas : les nouveaux paramètres comptent à
 * partir de la prochaine révision de chaque fiche.
 */
export async function optimizeFsrs(onProgress?: (done: number) => void): Promise<ScopeOutcome[]> {
  const { db, universes, settings, updateSettings } = useApp.getState();
  if (!db) throw new Error('Base locale indisponible.');
  const rows = await loadReviewHistory(db);
  // Une langue n'a ses propres paramètres que si elle n'est pas tout l'historique (sinon, même calcul que « toutes langues »).
  const perUniverse = universes.map((u) => ({ scope: u.id, name: u.name, rows: rows.filter((r) => r.universeId === u.id) })).filter((u) => u.rows.length < rows.length);
  const scopes = [{ scope: 'all', name: 'Toutes langues', rows }, ...perUniverse];
  const outcomes: ScopeOutcome[] = [];
  const fits: Record<string, FsrsFit> = { ...settings.fsrsParams };
  for (const [i, { scope, name, rows: scoped }] of scopes.entries()) {
    const current = personalWeights({ fsrsParams: fits }, scope === 'all' ? null : scope);
    const fit = await fitParameters(scoped, {
      current,
      onProgress: async (done) => {
        onProgress?.((i + done) / scopes.length);
        // Rendre la main à l'interface entre deux lots.
        await new Promise((r) => setTimeout(r, 0));
      },
    });
    outcomes.push({ scope, name, fit });
    if (!fit) continue;
    const entry: FsrsFit = { w: fit.w, at: Date.now(), applied: fit.better, reviews: fit.reviews, before: fit.before, after: fit.after };
    // Sans gain mesuré, les paramètres déjà retenus restent ; sinon le calcul est gardé pour information.
    if (fit.better || !fits[scope]?.applied) fits[scope] = entry;
  }
  onProgress?.(1);
  await updateSettings({ fsrsParams: fits });
  return outcomes;
}
