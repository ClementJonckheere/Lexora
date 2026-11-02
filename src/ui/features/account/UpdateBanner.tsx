import { Download } from 'lucide-react';
import { useApp } from '@/app/store';
import { installUpdate } from '@/app/desktop';
import { Button } from '@/ui/components/ui';

/** Nouvelle version disponible : installation en un clic (téléchargement signé puis redémarrage). */
export function UpdateBanner() {
  const update = useApp((s) => s.update);
  const progress = useApp((s) => s.updateProgress);
  if (!update) return null;
  const installing = progress !== undefined;
  return (
    <div className="update-banner">
      <div className="label">
        <strong>Version {update.version}</strong>
        <span className="muted small">{installing ? (progress != null ? `Téléchargement… ${progress} %` : 'Téléchargement…') : 'Nouvelle version disponible'}</span>
      </div>
      <Button size="sm" variant="primary" onClick={() => void installUpdate(update)} disabled={installing} title="Installer et redémarrer">
        <Download size={14} /> <span className="label">{installing ? '…' : 'Installer'}</span>
      </Button>
    </div>
  );
}
