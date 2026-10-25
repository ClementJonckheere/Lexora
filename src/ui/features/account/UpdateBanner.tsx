import { useState } from 'react';
import { Download } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { Button } from '@/ui/components/ui';

/** Nouvelle version disponible : installation en un clic (téléchargement signé puis redémarrage). */
export function UpdateBanner() {
  const update = useApp((s) => s.update);
  const [progress, setProgress] = useState<number | null | undefined>(undefined);
  if (!update) return null;
  const installing = progress !== undefined;

  const install = async () => {
    setProgress(null);
    try {
      await update.install((p) => setProgress(p));
    } catch (err) {
      setProgress(undefined);
      useApp.getState().toast('error', `Mise à jour impossible : ${errorMessage(err)}`);
    }
  };

  return (
    <div className="update-banner">
      <div className="label">
        <strong>Version {update.version}</strong>
        <span className="muted small">{installing ? (progress != null ? `Téléchargement… ${progress} %` : 'Téléchargement…') : 'Nouvelle version disponible'}</span>
      </div>
      <Button size="sm" variant="primary" onClick={() => void install()} disabled={installing} title="Installer et redémarrer">
        <Download size={14} /> <span className="label">{installing ? '…' : 'Installer'}</span>
      </Button>
    </div>
  );
}
