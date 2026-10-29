import { CloudOff, LogOut, RefreshCw } from 'lucide-react';
import { useApp } from '@/app/store';
import { formatDate } from '@/core/domain/dates';
import { Button } from '@/ui/components/ui';
import { confirm } from '@/ui/components/Confirm';
import { Avatar, SyncLabel } from './SyncIndicator';

/** Compte et synchronisation (page Paramètres). */
export function AccountSection() {
  const auth = useApp((s) => s.auth);
  const sync = useApp((s) => s.sync);
  const { syncNow, signOut } = useApp.getState();

  if (auth.phase === 'local') {
    return (
      <section className="card card-pad stack stack--sm">
        <h2 className="card-title">Compte</h2>
        <div className="notice">
          <CloudOff size={16} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            Synchronisation non configurée : les données restent sur cet appareil. Renseignez <span className="code">VITE_SUPABASE_URL</span> et{' '}
            <span className="code">VITE_SUPABASE_ANON_KEY</span> (voir le guide <span className="code">docs/SUPABASE.md</span>).
          </span>
        </div>
      </section>
    );
  }
  if (!auth.user) return null;

  const logout = async () => {
    const ok = await confirm({
      title: 'Se déconnecter ?',
      message:
        'Vos données restent sur cet appareil et dans votre compte. Les modifications pas encore synchronisées seront envoyées à la prochaine connexion.',
      confirmLabel: 'Se déconnecter',
    });
    if (ok) await signOut();
  };

  return (
    <section className="card card-pad stack">
      <div className="row row--between row--wrap">
        <div className="row" style={{ gap: 12 }}>
          <Avatar user={auth.user} size={40} />
          <div>
            <div style={{ fontWeight: 500 }}>{auth.user.name}</div>
            <div className="muted small">{auth.user.email}</div>
          </div>
        </div>
        <div className="row">
          <Button onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>
            <RefreshCw size={15} className={sync.state === 'syncing' ? 'spin' : ''} /> Synchroniser
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>
            <LogOut size={15} /> Déconnexion
          </Button>
        </div>
      </div>
      <div className="muted small">
        <SyncLabel /> {sync.lastSync ? `· dernière synchronisation ${formatDate(sync.lastSync).toLowerCase()} à ${new Date(sync.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        {sync.state === 'error' && sync.error ? <div className="field-error">{sync.error}</div> : null}
      </div>
    </section>
  );
}
