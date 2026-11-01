import { useState } from 'react';
import { Flame, Shield } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { SHIELD_EVERY } from '@/core/progress/streak';
import type { DailyProgress } from '@/core/repo/progressRepo';
import { useDailyProgress } from '@/ui/hooks/useDailyProgress';
import { Button } from '@/ui/components/ui';

const days = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;

/** Série perdue que les boucliers disponibles peuvent sauver. */
export function canRepair(p: DailyProgress): boolean {
  return p.missedDays.length > 0 && p.shields >= p.missedDays.length;
}

/** Utilise les boucliers nécessaires pour couvrir les jours manqués. */
export async function repairStreak(p: DailyProgress): Promise<void> {
  const { spendShields, toast } = useApp.getState();
  try {
    await spendShields(p.missedDays);
    const kept = p.lostStreak + (p.streakAtRisk || p.streakDays === 0 ? 0 : p.streakDays);
    toast('success', `Série sauvée : ${days(kept)} d'affilée`);
  } catch (err) {
    toast('error', errorMessage(err));
  }
}

/** Offre de bouclier : la série d'avant le trou, ce qu'il faut pour la sauver. */
export function ShieldOffer({ progress, onDone }: { progress: DailyProgress; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const { missedDays, lostStreak, shields } = progress;
  if (!missedDays.length) return null;
  const need = missedDays.length;
  return (
    <div className="shield-offer">
      <p>
        Votre série de {days(lostStreak)} s'est arrêtée ({need > 1 ? `${need} jours manqués` : 'un jour manqué'}).
      </p>
      {canRepair(progress) ? (
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void repairStreak(progress).finally(() => {
              setBusy(false);
              onDone?.();
            });
          }}
        >
          <Shield size={14} /> Utiliser {need > 1 ? `${need} boucliers` : 'un bouclier'}
        </Button>
      ) : (
        <p className="muted small">
          Il faudrait {need > 1 ? `${need} boucliers` : 'un bouclier'} pour la sauver ; vous en avez {shields}.
        </p>
      )}
    </div>
  );
}

/** Petite flamme en haut à gauche : jours d'affilée, boucliers, rattrapage d'un jour manqué. */
export function StreakFlame() {
  const progress = useDailyProgress();
  const [open, setOpen] = useState(false);
  const { streakDays, streakAtRisk, shields, nextShieldIn } = progress;
  const lit = streakDays > 0 && !streakAtRisk;
  const repair = canRepair(progress);
  return (
    <div className="streak">
      <button
        type="button"
        className={`streak-flame${lit ? ' streak-flame--lit' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${days(streakDays)} d'affilée, ${shields} bouclier${shields > 1 ? 's' : ''}`}
        title={`${days(streakDays)} d'affilée`}
      >
        <Flame size={15} />
        <span>{streakDays}</span>
        {repair && <Shield size={12} className="streak-alert" />}
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="popover streak-popover" role="dialog" aria-label="Série">
            <div className="streak-head">
              <Flame size={20} className={lit ? 'streak-icon--lit' : 'muted'} />
              <div>
                <strong>{streakDays ? `${days(streakDays)} d'affilée` : 'Pas de série en cours'}</strong>
                <p className="muted small">
                  {streakAtRisk
                    ? "Révisez aujourd'hui pour la continuer."
                    : streakDays
                      ? "Révision du jour faite."
                      : "Révisez aujourd'hui pour en commencer une."}
                </p>
              </div>
            </div>
            <div className="streak-shields">
              <Shield size={16} />
              <span>
                {shields} bouclier{shields > 1 ? 's' : ''}
              </span>
              <span className="muted small">
                Un bouclier tous les {SHIELD_EVERY} jours d'affilée ; le prochain dans {days(nextShieldIn)} de révision.
              </span>
            </div>
            <ShieldOffer progress={progress} onDone={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
