import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, Zap } from 'lucide-react';
import { useApp } from '@/app/store';
import { addDays, dayKey, formatDate, startOfLocalDay } from '@/core/domain/dates';
import { noteMastery } from '@/core/srs/queue';
import { Button, EmptyState } from '@/ui/components/ui';
import { useDueCounts } from '@/ui/features/review/ReviewPage';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { DAY } from '@/core/domain/dates';
import { UniversesOverview } from '@/ui/features/universes/Universes';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5 || h >= 18) return 'Bonsoir';
  return 'Bonjour';
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function HomePage() {
  const notes = useApp((s) => s.notes);
  const settings = useApp((s) => s.settings);
  const forgetCounts = useApp((s) => s.forgetCounts);
  const db = useApp((s) => s.db);
  const revision = useApp((s) => s.revision);
  const overlay = useApp((s) => !!s.editor || s.searchOpen || s.bulkOpen || s.shortcutsOpen);
  const { navigate, openEditor, showNote } = useApp.getState();
  const due = useDueCounts();

  const recentCount = useMemo(() => notes.filter((n) => n.createdAt >= Date.now() - 7 * DAY).length, [notes]);
  const latest = notes.slice(0, 6);
  const forgotten = useMemo(
    () =>
      notes
        .filter((n) => (forgetCounts.get(n.id) ?? 0) >= 2)
        .sort((a, b) => (forgetCounts.get(b.id) ?? 0) - (forgetCounts.get(a.id) ?? 0))
        .slice(0, 6),
    [notes, forgetCounts],
  );
  const mastery = useMemo(() => {
    const m = { new: 0, learning: 0, mastered: 0 };
    for (const n of notes) m[noteMastery(n, settings)]++;
    return m;
  }, [notes, settings]);

  // Activité des 14 derniers jours (révisions validées).
  const [activity, setActivity] = useState<{ day: string; count: number }[]>([]);
  useEffect(() => {
    if (!db) return;
    const since = startOfLocalDay(addDays(Date.now(), -13));
    db.select<{ reviewed_at: number }>('SELECT reviewed_at FROM review_logs WHERE reviewed_at >= ?', [since])
      .then((rows) => {
        const days = Array.from({ length: 14 }, (_, i) => ({ day: dayKey(addDays(since, i)), count: 0 }));
        const idx = new Map(days.map((d, i) => [d.day, i]));
        for (const r of rows) {
          const i = idx.get(dayKey(Number(r.reviewed_at)));
          if (i !== undefined) days[i].count++;
        }
        setActivity(days);
      })
      .catch(() => setActivity([]));
  }, [db, revision]);
  const maxActivity = Math.max(1, ...activity.map((a) => a.count));

  const startAll = () => navigate({ name: 'session', config: { kind: 'scheduled', limit: null } });
  const start5 = () => navigate({ name: 'session', config: { kind: 'scheduled', limit: 5 } });

  useHotkeys(
    {
      enter: () => (due.total > 0 ? startAll() : navigate({ name: 'review' })),
      space: () => due.total > 0 && start5(),
    },
    { enabled: !overlay },
  );

  const total = notes.length || 1;

  return (
    <div className="page">
      <section className="card hero">
        <h1 className="hero-title">{greeting()}, prêt à réviser ?</h1>
        <div className="hero-facts">
          <span>
            <strong>{due.total}</strong> {due.total > 1 ? 'fiches à réviser' : 'fiche à réviser'} aujourd'hui
          </span>
          <span>
            <strong>{recentCount}</strong> {recentCount > 1 ? 'nouveaux mots enregistrés' : 'nouveau mot enregistré'} ces 7 derniers jours
          </span>
          <span>
            <strong>{notes.length}</strong> {notes.length > 1 ? 'expressions' : 'expression'} dans la bibliothèque
          </span>
        </div>
        <div className="hero-actions">
          <Button variant="primary" size="lg" onClick={due.total > 0 ? startAll : () => navigate({ name: 'review' })} shortcut="Entrée">
            {due.total > 0 ? 'Commencer les révisions' : 'Tout est à jour — s’entraîner'} <ArrowRight size={17} />
          </Button>
          <Button size="lg" onClick={() => openEditor()} shortcut="N">
            <Plus size={17} /> Ajouter du vocabulaire
          </Button>
          {due.total > 5 && (
            <Button variant="ghost" size="lg" onClick={start5} shortcut="Espace">
              <Zap size={16} /> 5 mots
            </Button>
          )}
        </div>
        <UniversesOverview />
      </section>

      {notes.length === 0 ? (
        <div className="card">
          <EmptyState title="Commencez votre carnet de vocabulaire">
            <p>Ajoutez une expression rencontrée aujourd'hui : elle sera automatiquement programmée pour révision.</p>
            <div className="row">
              <Button variant="primary" onClick={() => openEditor()}>
                <Plus size={16} /> Ajouter une expression
              </Button>
              <Button onClick={() => useApp.getState().setBulkOpen(true)}>Coller une liste</Button>
            </div>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <section className="card">
              <div className="card-header" style={{ paddingBottom: 10 }}>
                <h2 className="card-title">Derniers ajouts</h2>
                <button className="link small" onClick={() => navigate({ name: 'library' })}>
                  Bibliothèque
                </button>
              </div>
              <div className="mini-list">
                {latest.map((n) => (
                  <button key={n.id} className="mini-item" onClick={() => showNote(n.id)}>
                    <span style={{ minWidth: 0 }}>
                      <div className="en">{n.expression}</div>
                      <div className="fr">{n.translation}</div>
                    </span>
                    <span className="muted small">{formatDate(n.createdAt)}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="card">
              <div className="card-header" style={{ paddingBottom: 10 }}>
                <h2 className="card-title">Souvent oubliés</h2>
                {forgotten.length > 0 && (
                  <button
                    className="link small"
                    onClick={() => navigate({ name: 'session', config: { kind: 'practice', mode: 'difficult', limit: 20 } })}
                  >
                    S'entraîner
                  </button>
                )}
              </div>
              {forgotten.length ? (
                <div className="mini-list">
                  {forgotten.map((n) => (
                    <button key={n.id} className="mini-item" onClick={() => showNote(n.id)}>
                      <span style={{ minWidth: 0 }}>
                        <div className="en">{n.expression}</div>
                        <div className="fr">{n.translation}</div>
                      </span>
                      <span className="muted small">{plural(forgetCounts.get(n.id) ?? 0, 'oubli', 'oublis')}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted small" style={{ padding: '4px 20px 20px' }}>
                  Les expressions oubliées au moins deux fois apparaîtront ici.
                </p>
              )}
            </section>
          </div>

          <section className="card card-pad stack">
            <div className="row row--between">
              <h2 className="card-title">Progression</h2>
              <button className="link small" onClick={() => navigate({ name: 'stats' })}>
                Statistiques
              </button>
            </div>
            <div className="progress-bar" aria-label="Répartition par niveau de maîtrise">
              <span style={{ width: `${(mastery.mastered / total) * 100}%`, background: '#10b981' }} />
              <span style={{ width: `${(mastery.learning / total) * 100}%`, background: '#f59e0b' }} />
              <span style={{ width: `${(mastery.new / total) * 100}%`, background: 'var(--border-strong)' }} />
            </div>
            <div className="row row--between row--wrap">
              <div className="legend">
                <span>
                  <i style={{ background: '#10b981' }} />
                  {mastery.mastered} maîtrisées
                </span>
                <span>
                  <i style={{ background: '#f59e0b' }} />
                  {mastery.learning} en cours
                </span>
                <span>
                  <i style={{ background: 'var(--border-strong)' }} />
                  {mastery.new} à apprendre
                </span>
              </div>
              <MasteryHint />
            </div>
            {activity.length > 0 && activity.every((a) => a.count === 0) && (
              <p className="muted small">Aucune révision ces 14 derniers jours.</p>
            )}
            {activity.some((a) => a.count > 0) && (
              <div>
                <div className="bars bars--sm" aria-label="Révisions des 14 derniers jours">
                  {activity.map((a) => (
                    <div key={a.day} className="bar" data-tip={`${formatDate(new Date(a.day + 'T12:00').getTime())} : ${a.count}`}>
                      <span style={{ height: `${(a.count / maxActivity) * 100}%`, minHeight: a.count ? 3 : 0 }} />
                    </div>
                  ))}
                </div>
                <div className="bars-axis">
                  <span>Il y a 14 jours</span>
                  <span>Révisions par jour</span>
                  <span>Aujourd'hui</span>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MasteryHint() {
  const settings = useApp((s) => s.settings);
  return (
    <span className="muted small" title="Une fiche est maîtrisée quand FSRS estime que vous la retiendrez au moins ce nombre de jours avec 90 % de probabilité.">
      Maîtrisé : mémorisation stable ≥ {settings.masteryThresholdDays} jours
    </span>
  );
}
