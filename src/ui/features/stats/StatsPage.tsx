import { useEffect, useState } from 'react';
import { useApp } from '@/app/store';
import { directionShort } from '@/core/domain/types';
import { settingsFor } from '@/core/domain/settings';
import { formatDate } from '@/core/domain/dates';
import { computeStats, type Stats } from '@/core/repo/statsRepo';
import { EmptyState } from '@/ui/components/ui';
import { Leaderboard } from './Leaderboard';
import { PhoneSettingsTabs } from '@/ui/features/settings/PhoneSettingsTabs';

const pct = (v: number | null) => (v == null ? '-' : `${Math.round(v * 100)} %`);
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

export function StatsPage() {
  const db = useApp((s) => s.db);
  const notes = useApp((s) => s.notes);
  const notesById = useApp((s) => s.notesById);
  const settings = useApp((s) => s.settings);
  const scheduler = useApp((s) => s.scheduler);
  const revision = useApp((s) => s.revision);
  const universe = useApp((s) => s.universe);
  const { showNote } = useApp.getState();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    if (!universe) return;
    computeStats(db, notes, settingsFor(settings, universe), scheduler, universe.id)
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [db, notes, settings, scheduler, revision, universe]);

  if (error) return <div className="page"><EmptyState title="Statistiques indisponibles">{error}</EmptyState></div>;
  if (!stats)
    return (
      <div className="page">
        <PhoneSettingsTabs current="stats" />
      </div>
    );

  const maxReviews = Math.max(1, ...stats.activity.map((a) => a.reviews));
  const total30 = stats.activity.reduce((s, a) => s + a.reviews, 0);
  const activeDays = stats.activity.filter((a) => a.reviews > 0).length;

  return (
    <div className="page">
      <PhoneSettingsTabs current="stats" />
      <div className="page-header">
        <div>
          <h1 className="page-title">Statistiques</h1>
          <p className="page-subtitle">Calculées sur vos révisions réelles.</p>
        </div>
      </div>

      <Leaderboard />

      <div className="kpis">
        <Kpi label="Expressions" value={stats.totalNotes} hint={`+${stats.newThisWeek} cette semaine`} />
        <Kpi label="À réviser aujourd'hui" value={stats.due.total} hint={`${stats.due.review} révisions · ${stats.due.new} nouvelles`} />
        <Kpi
          label="Maîtrisées"
          value={stats.mastery.mastered}
          hint={`Stabilité FSRS ≥ ${settings.masteryThresholdDays} j${settings.directions === 'both' ? ' dans les 2 sens' : ''}`}
        />
        <Kpi
          label="Rétention mesurée (30 j)"
          value={pct(stats.retention30d.rate)}
          hint={stats.retention30d.sample ? `sur ${stats.retention30d.sample} révisions espacées` : 'pas encore de données'}
        />
        <Kpi label="Mémorisation estimée" value={pct(stats.estimatedRecall)} hint="probabilité moyenne de rappel aujourd'hui" />
        <Kpi label="Série" value={`${stats.streakDays} j`} hint={`${stats.reviewsToday} révisions aujourd'hui`} />
      </div>

      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row row--between">
          <h2 className="card-title">Révisions par jour</h2>
          <span className="muted small">
            {total30} en 30 jours · {activeDays} jour{activeDays > 1 ? 's' : ''} actif{activeDays > 1 ? 's' : ''} · {stats.totalReviews} au total
          </span>
        </div>
        <div className="bars" aria-label="Révisions par jour sur 30 jours">
          {stats.activity.map((a) => (
            <div
              key={a.day}
              className="bar"
              data-tip={`${formatDate(a.date)} : ${a.reviews} révision${a.reviews > 1 ? 's' : ''}${a.forgotten ? ` · ${a.forgotten} oubli${a.forgotten > 1 ? 's' : ''}` : ''}`}
            >
              <span style={{ height: `${(a.reviews / maxReviews) * 100}%`, minHeight: a.reviews ? 3 : 0, borderRadius: '4px 4px 0 0' }} />
            </div>
          ))}
        </div>
        <div className="bars-axis">
          <span>{formatDate(stats.activity[0].date)}</span>
          <span>Aujourd'hui</span>
        </div>
      </section>

      <div className="grid-2">
        <section className="card card-pad stack">
          <h2 className="card-title">Prochains jours</h2>
          <div className="forecast">
            {stats.forecast.map((f, i) => (
              <div key={f.day} className="forecast-day" title={`${f.count} fiche(s) prévue(s)`}>
                <strong>{f.count}</strong>
                <span>{i === 0 ? "Auj." : WEEKDAY.format(f.date)}</span>
              </div>
            ))}
          </div>
          <div className="stack stack--sm">
            <h3 className="card-title">Répartition</h3>
            <dl className="kv">
              <dt>À apprendre</dt>
              <dd>{stats.mastery.new}</dd>
              <dt>En cours</dt>
              <dd>{stats.mastery.learning}</dd>
              <dt>Maîtrisées</dt>
              <dd>{stats.mastery.mastered}</dd>
              {settings.directions === 'both' && (
                <>
                  <dt>Maîtrisées {directionShort('fr_en', universe?.language)}</dt>
                  <dd>{stats.masteredByDirection.fr_en}</dd>
                  <dt>Maîtrisées {directionShort('en_fr', universe?.language)}</dt>
                  <dd>{stats.masteredByDirection.en_fr}</dd>
                </>
              )}
            </dl>
          </div>
        </section>

        <section className="card">
          <div className="card-header" style={{ paddingBottom: 8 }}>
            <h2 className="card-title">Expressions les plus difficiles</h2>
          </div>
          {stats.hardest.length ? (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Expression</th>
                  <th className="num">Oublis</th>
                </tr>
              </thead>
              <tbody>
                {stats.hardest.map((h) => {
                  const n = notesById.get(h.noteId);
                  if (!n) return null;
                  return (
                    <tr key={h.noteId} onClick={() => showNote(n.id)}>
                      <td>
                        <strong>{n.expression}</strong>
                        <div className="muted small">{n.translation}</div>
                      </td>
                      <td className="num">{h.fails}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="muted small" style={{ padding: '4px 20px 20px' }}>
              Aucune expression oubliée au moins deux fois.
            </p>
          )}
        </section>
      </div>
      <p className="muted small" style={{ marginTop: 20 }}>
        Rétention mesurée : part des fiches en révision espacée que vous avez retrouvées (toute réponse autre que « Oublié »). Mémorisation estimée :
        moyenne de la probabilité de rappel calculée par FSRS pour chaque fiche à cet instant. Objectif réglé : {Math.round(settings.desiredRetention * 100)} %.
      </p>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}
