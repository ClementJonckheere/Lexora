import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Trophy } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { leaderboardName, publishMyScores, setLeaderboard } from '@/app/leaderboard';
import { languageInfo } from '@/core/domain/languages';
import { LEADERBOARD_NAME_MAX } from '@/core/domain/settings';
import { authConfigured, supabase } from '@/core/platform/auth';
import { ordinal, rankLeaderboard, type LeaderboardEntry } from '@/core/progress/leaderboard';
import { rankFor } from '@/core/progress/xp';
import { fetchLeaderboard } from '@/core/sync/leaderboardRemote';
import { Button } from '@/ui/components/ui';
import { Ornament } from '@/ui/features/progress/Ornament';

const fmt = (n: number) => n.toLocaleString('fr-FR');

/** Classement de la langue en cours : position, pseudo, rang, niveau et XP des participants. */
export function Leaderboard() {
  const user = useApp((s) => s.auth.user);
  const universe = useApp((s) => s.universe);
  const settings = useApp((s) => s.settings.leaderboard);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(() => leaderboardName());
  const [editing, setEditing] = useState(false);
  const language = universe?.language ?? 'en';

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      setEntries(rankLeaderboard(await fetchLeaderboard(supabase(), language), user.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [user, language]);

  useEffect(() => {
    if (!settings.enabled || !user) return;
    // Mes chiffres d'abord (à jour), puis le classement.
    void publishMyScores(true)
      .catch(() => undefined)
      .then(load);
  }, [settings.enabled, user, load]);

  const join = async (enabled: boolean) => {
    setBusy(true);
    try {
      await setLeaderboard(enabled, name || leaderboardName());
      setEditing(false);
      if (enabled) await load();
      else setEntries(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const title = `Classement · ${languageInfo(language).name}`;
  if (!authConfigured || !user)
    return (
      <section className="card card-pad leaderboard">
        <h2 className="section-title">{title}</h2>
        <p className="muted small">Connectez-vous avec votre compte (Paramètres) pour participer au classement des utilisateurs de Lexora.</p>
      </section>
    );

  const nameField = (
    <input
      className="input leaderboard-name"
      value={name}
      maxLength={LEADERBOARD_NAME_MAX}
      onChange={(e) => setName(e.target.value)}
      placeholder="Votre pseudo"
      aria-label="Pseudo affiché dans le classement"
    />
  );

  if (!settings.enabled)
    return (
      <section className="card card-pad leaderboard">
        <h2 className="section-title">{title}</h2>
        <p className="muted small">
          Comparez votre progression à celle des autres utilisateurs : position, rang, niveau et XP, par langue. En rejoignant le classement, vous
          partagez avec eux votre pseudo, votre XP et votre niveau, rien d'autre. Vous pouvez le quitter à tout moment.
        </p>
        <div className="row row--wrap">
          {nameField}
          <Button variant="primary" onClick={() => void join(true)} disabled={busy || !name.trim()}>
            <Trophy size={15} /> Rejoindre le classement
          </Button>
        </div>
        {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
      </section>
    );

  const me = entries?.find((e) => e.me);
  // La personne juste devant (la dernière des positions meilleures que la mienne).
  const ahead = me ? entries!.filter((e) => e.position < me.position).at(-1) : undefined;
  return (
    <section className="card card-pad leaderboard">
      <div className="row row--between row--wrap">
        <h2 className="section-title" style={{ margin: 0 }}>
          {title}
        </h2>
        <div className="row">
          <button className="link small" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Fermer' : 'Pseudo'}
          </button>
          <button className="link small" onClick={() => void join(false)} disabled={busy}>
            Quitter le classement
          </button>
          <Button size="sm" variant="ghost" onClick={() => void load()} title="Actualiser" aria-label="Actualiser">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>
      {editing && (
        <div className="row row--wrap" style={{ marginTop: 10 }}>
          {nameField}
          <Button size="sm" onClick={() => void join(true)} disabled={busy || !name.trim()}>
            Enregistrer
          </Button>
        </div>
      )}
      {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
      {!entries && !error && (
        <p className="muted row small">
          <Loader2 size={14} className="spin" /> Chargement du classement…
        </p>
      )}
      {entries && (
        <>
          <p className="leaderboard-me">
            {me ? (
              <>
                Vous êtes <strong>{ordinal(me.position)}</strong> sur {entries.length}
                {ahead && ` · ${fmt(ahead.xp - me.xp)} XP pour gagner une place`}
              </>
            ) : (
              'Votre XP apparaîtra après votre première activité dans cette langue.'
            )}
          </p>
          <ol className="leaderboard-list">
            {entries.map((e) => (
              <li key={e.userId} className={`leaderboard-row${e.me ? ' leaderboard-row--me' : ''}`}>
                <span className="leaderboard-pos mono">{e.position}</span>
                <Ornament rank={rankFor(e.level)} size={30} />
                <span className="leaderboard-who">
                  <strong>{e.name}</strong>
                  {e.me && <span className="muted small"> (vous)</span>}
                  <span className="muted small">
                    {e.rankName} · niveau {e.level}
                  </span>
                </span>
                <span className="leaderboard-xp mono">{fmt(e.xp)} XP</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
