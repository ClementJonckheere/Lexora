import { Check, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useApp } from '@/app/store';
import type { AccountUser } from '@/core/platform/auth';

export function Avatar({ user, size = 28 }: { user: AccountUser; size?: number }) {
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return user.avatarUrl ? (
    <img className="avatar" src={user.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar avatar--initials" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

export function SyncLabel() {
  const sync = useApp((s) => s.sync);
  switch (sync.state) {
    case 'syncing':
      return (
        <span className="sync-label">
          <RefreshCw size={12} className="spin" /> Synchronisation…
        </span>
      );
    case 'offline':
      return (
        <span className="sync-label">
          <CloudOff size={12} /> Hors ligne
        </span>
      );
    case 'error':
      return (
        <span className="sync-label sync-label--error" title={sync.error ?? ''}>
          <TriangleAlert size={12} /> Synchronisation en échec
        </span>
      );
    case 'disabled':
      return null;
    default:
      return (
        <span className="sync-label">
          <Check size={12} /> {sync.lastSync ? 'Synchronisé' : 'Prêt'}
        </span>
      );
  }
}

/** Bloc compte en bas de la barre latérale : avatar + état de synchronisation. */
export function SidebarAccount() {
  const user = useApp((s) => s.auth.user);
  const { navigate, syncNow } = useApp.getState();
  if (!user) return null;
  return (
    <div className="sidebar-account">
      <button className="sidebar-account-main" onClick={() => navigate({ name: 'settings' })} title={user.email}>
        <Avatar user={user} />
        <span className="label" style={{ minWidth: 0 }}>
          <span className="sidebar-account-name">{user.name}</span>
          <SyncLabel />
        </span>
      </button>
      <button className="btn btn--ghost btn--icon btn--sm label" title="Synchroniser maintenant" onClick={() => void syncNow()}>
        <RefreshCw size={14} />
      </button>
    </div>
  );
}
