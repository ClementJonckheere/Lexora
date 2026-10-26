import type { SessionConfig } from '@/app/store';
import { useApp } from '@/app/store';
import { Button, EmptyState } from '@/ui/components/ui';
import { CheckCircle2 } from 'lucide-react';
import { ScheduledSession } from './ScheduledSession';
import { ClozePractice, FlashPractice } from './PracticeSession';
import { buildQueue } from '@/core/srs/queue';
import { scopeIds } from '@/core/srs/scope';
import { settingsFor } from '@/core/domain/settings';
import { useState } from 'react';

export function SessionPage({ config }: { config: SessionConfig }) {
  // Vérifie au démarrage qu'il y a quelque chose à réviser (évite un écran vide).
  const [empty] = useState(() => {
    if (config.kind !== 'scheduled') return false;
    const s = useApp.getState();
    const noteIds = scopeIds(s.notes, config);
    return (
      buildQueue(s.notes, {
        now: Date.now(),
        settings: settingsFor(s.settings, s.universe),
        scheduler: s.scheduler,
        newIntroducedToday: s.newIntroducedToday,
        limit: 1,
        direction: config.direction,
        noteIds,
      }).length === 0
    );
  });

  if (empty) {
    return (
      <div className="session">
        <div className="session-stage">
          <EmptyState icon={<CheckCircle2 size={40} color="var(--mastered)" />} title="Rien à réviser pour le moment">
            <p>Les prochaines révisions sont planifiées automatiquement.</p>
            <Button variant="primary" onClick={() => useApp.getState().navigate({ name: 'review' })}>
              Retour
            </Button>
          </EmptyState>
        </div>
      </div>
    );
  }
  if (config.kind === 'scheduled') return <ScheduledSession config={config} />;
  if (config.mode === 'cloze') return <ClozePractice config={config} />;
  return <FlashPractice config={config} />;
}
