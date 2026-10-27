import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, Kbd } from '@/ui/components/ui';

/** Cadre épuré d'une session (barre de progression + bouton quitter). */
export function SessionFrame({
  completed,
  total,
  onQuit,
  badge,
  children,
}: {
  completed: number;
  total: number;
  onQuit: () => void;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const pct = total ? Math.min(100, (completed / total) * 100) : 0;
  return (
    <div className="session">
      <div className="session-top">
        <Button variant="ghost" size="sm" onClick={onQuit} title="Quitter (Échap)">
          <X size={16} /> Quitter <Kbd>Échap</Kbd>
        </Button>
        {badge}
        <div className="session-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="session-count">
          {completed} / {total}
        </span>
      </div>
      <div className="session-stage">{children}</div>
    </div>
  );
}

export interface Tally {
  1: number;
  2: number;
  3: number;
  4: number;
}

export function SessionSummary({
  title,
  tally,
  startedAt,
  labels = ['Oublié', 'Difficile', 'Retenu', 'Facile'],
  children,
  note,
  details,
}: {
  title: string;
  tally: Tally;
  startedAt: number;
  labels?: string[];
  children: ReactNode;
  note?: ReactNode;
  /** Bilan détaillé (mots maîtrisés, à surveiller…). */
  details?: ReactNode;
}) {
  const total = tally[1] + tally[2] + tally[3] + tally[4];
  const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
  const success = total ? Math.round(((total - tally[1]) / total) * 100) : 0;
  // Un libellé vide masque la case (phrases à trous, écoute : seulement « Ratées » et « Justes »).
  const shown = ([1, 2, 3, 4] as const).filter((g) => labels[g - 1]);
  return (
    <div className="card summary">
      <div className="summary-title">{title}</div>
      <p className="muted" style={{ marginTop: 6 }}>
        {total} réponse{total > 1 ? 's' : ''} · {success} % de réussite · {minutes} min
      </p>
      <div className="summary-stats" style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)` }}>
        {shown.map((g) => (
          <div key={g}>
            <strong style={{ color: ['', 'var(--again)', 'var(--hard)', 'var(--good)', 'var(--easy)'][g] }}>{tally[g]}</strong>
            <span>{labels[g - 1]}</span>
          </div>
        ))}
      </div>
      {details}
      {note && <p className="muted small" style={{ marginBottom: 16 }}>{note}</p>}
      <div className="row" style={{ justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}
