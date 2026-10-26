import { useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Flame, PencilLine, Shuffle, Zap } from 'lucide-react';
import { useApp, type SessionConfig } from '@/app/store';
import { formatDue } from '@/core/domain/dates';
import { directionShort, type Direction } from '@/core/domain/types';
import { countDue } from '@/core/srs/queue';
import { settingsFor } from '@/core/domain/settings';
import { clozeCandidates, difficultNotes } from '@/core/srs/practice';
import { hasScope, scopeIds, scopeNotes, type ReviewScope } from '@/core/srs/scope';
import { readPref, writePref } from '@/ui/prefs';
import { Button, Kbd, Segmented } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { State } from 'ts-fsrs';

export function useDueCounts(scope: ReviewScope = {}, direction: Direction | null = null) {
  const notes = useApp((s) => s.notes);
  const baseSettings = useApp((s) => s.settings);
  const universe = useApp((s) => s.universe);
  const settings = useMemo(() => settingsFor(baseSettings, universe), [baseSettings, universe]);
  const scheduler = useApp((s) => s.scheduler);
  const newIntroducedToday = useApp((s) => s.newIntroducedToday);
  const collections = useApp((s) => s.collections);
  const { collectionId = null, category = null, tag = null } = scope;
  return useMemo(() => {
    const noteIds = scopeIds(notes, { collectionId, category, tag });
    return countDue(notes, { now: Date.now(), settings, scheduler, newIntroducedToday, noteIds, direction });
    // `collections` : recalcul quand une collection change.
  }, [notes, settings, scheduler, newIntroducedToday, collectionId, category, tag, direction, collections]);
}

/** Prochaine échéance (pour « tout est à jour »). */
function useNextDue() {
  const notes = useApp((s) => s.notes);
  return useMemo(() => {
    let min = Infinity;
    for (const n of notes) for (const c of Object.values(n.cards)) if (c && c.state !== State.New && c.due < min) min = c.due;
    return Number.isFinite(min) ? min : null;
  }, [notes]);
}

export function ReviewPage() {
  const settings = useApp((s) => s.settings);
  const universe = useApp((s) => s.universe);
  const notes = useApp((s) => s.notes);
  const collections = useApp((s) => s.collections);
  const forgetCounts = useApp((s) => s.forgetCounts);
  const overlay = useApp((s) => !!s.editor || s.searchOpen || s.bulkOpen || s.shortcutsOpen);
  const { navigate, openEditor } = useApp.getState();

  const [direction, setDirection] = useState<'mix' | Direction>('mix');
  // Filtres (collection, catégorie, tag) mémorisés par univers.
  const prefKey = `review.scope.${universe?.id ?? ''}`;
  const [stored, setStored] = useState<ReviewScope>(() => readPref<ReviewScope>(prefKey, {}));
  const categories = useMemo(() => [...new Set(notes.map((n) => n.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [notes]);
  const tags = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const n of notes) for (const t of n.tags) if (!byKey.has(t.toLowerCase())) byKey.set(t.toLowerCase(), t);
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [notes]);
  // Une valeur disparue (collection supprimée, tag retiré) est ignorée.
  const scope: ReviewScope = {
    collectionId: stored.collectionId && collections.some((c) => c.id === stored.collectionId) ? stored.collectionId : null,
    category: stored.category && categories.includes(stored.category) ? stored.category : null,
    tag: stored.tag && tags.some((t) => t.toLowerCase() === stored.tag!.toLowerCase()) ? stored.tag : null,
  };
  const setScope = (patch: Partial<ReviewScope>) => {
    const next = { ...scope, ...patch };
    setStored(next);
    writePref(prefKey, next);
  };
  const dir = direction === 'mix' ? null : direction;
  const due = useDueCounts(scope, dir);
  const nextDue = useNextDue();

  const scoped = useMemo(() => scopeNotes(notes, scope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, scope.collectionId, scope.category, scope.tag]);
  const hardCount = useMemo(() => difficultNotes(scoped, forgetCounts).length, [scoped, forgetCounts]);
  const language = useApp((s) => s.universe?.language ?? 'en');
  const universeName = useApp((s) => s.universe?.name ?? '');
  const clozeCount = useMemo(() => clozeCandidates(scoped, language).length, [scoped, language]);

  const start = (config: SessionConfig) => navigate({ name: 'session', config });
  const startScheduled = (limit: number | null) => start({ kind: 'scheduled', limit, direction: dir, ...scope });

  useHotkeys(
    {
      enter: () => due.total > 0 && startScheduled(null),
      space: () => due.total > 0 && startScheduled(5),
    },
    { enabled: !overlay },
  );

  // Tailles proposées : inutile d'afficher « 20 mots » s'il n'y en a que 7.
  const sizes = [5, 10, 20].filter((_, i, arr) => i === 0 || arr[i - 1] < due.total);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Réviser</h1>
          <p className="page-subtitle">Rappel actif et répétition espacée (FSRS). Les révisions se planifient toutes seules.</p>
        </div>
      </div>

      <section className="card card-pad stack" style={{ marginBottom: 28 }}>
        <div className="row row--between row--wrap" style={{ gap: 16 }}>
          <div>
            <h2 className="card-title" style={{ fontSize: 16 }}>
              Révisions du jour
            </h2>
            <p className="muted">
              {due.total > 0 ? (
                <>
                  {due.review} à revoir · {due.new} nouveau{due.new > 1 ? 'x' : ''} · {due.learning} en apprentissage
                  {due.newWaiting > 0 && ` · ${due.newWaiting} nouveaux en attente (plafond ${settingsFor(settings, universe).newPerDay}/jour)`}
                </>
              ) : notes.length === 0 ? (
                'Ajoutez du vocabulaire : chaque expression devient automatiquement une fiche.'
              ) : (
                <>Tout est à jour{nextDue ? ` — prochaine révision ${formatDue(nextDue)}` : ''}.</>
              )}
            </p>
          </div>
          <div className="row row--wrap">
            {settings.directions === 'both' && (
              <Segmented
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'mix', label: 'Les deux' },
                  { value: 'fr_en', label: directionShort('fr_en', language), title: `Retrouver l’expression (${universeName}) à partir du français` },
                  { value: 'en_fr', label: directionShort('en_fr', language), title: 'Retrouver le sens français' },
                ]}
              />
            )}
            {collections.length > 0 && (
              <select
                className="select select--sm"
                style={{ width: 'auto' }}
                value={scope.collectionId ?? ''}
                onChange={(e) => setScope({ collectionId: e.target.value || null })}
                aria-label="Collection"
              >
                <option value="">Toute la bibliothèque</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {categories.length > 0 && (
              <select
                className="select select--sm"
                style={{ width: 'auto' }}
                value={scope.category ?? ''}
                onChange={(e) => setScope({ category: e.target.value || null })}
                aria-label="Catégorie"
              >
                <option value="">Toutes catégories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
            {tags.length > 0 && (
              <select
                className="select select--sm"
                style={{ width: 'auto' }}
                value={scope.tag ?? ''}
                onChange={(e) => setScope({ tag: e.target.value || null })}
                aria-label="Tag"
              >
                <option value="">Tous tags</option>
                {tags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            )}
            {hasScope(scope) && (
              <button className="link small" onClick={() => setScope({ collectionId: null, category: null, tag: null })}>
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {due.total > 0 ? (
          <div className="size-buttons">
            {sizes.map((n, i) => (
              <Button key={n} size="lg" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => startScheduled(n)} shortcut={i === 0 ? 'Espace' : undefined}>
                <Zap size={16} /> {n} mots
              </Button>
            ))}
            <Button size="lg" onClick={() => startScheduled(null)} shortcut="Entrée">
              Toutes ({due.total})
            </Button>
          </div>
        ) : (
          <div className="row" style={{ color: 'var(--mastered)' }}>
            <CheckCircle2 size={18} /> <span>Rien à réviser pour le moment. Vous pouvez vous entraîner librement ci-dessous.</span>
          </div>
        )}
      </section>

      <div className="row row--between" style={{ marginBottom: 10 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Entraînement libre
        </h2>
        <span className="practice-banner">Ne modifie pas la planification</span>
      </div>
      <div className="mode-grid">
        <ModeCard
          icon={<Flame size={18} />}
          title="Mots difficiles"
          desc="Les expressions que vous oubliez régulièrement (au moins 2 oublis)."
          count={hardCount}
          empty="Aucun mot difficile pour l’instant."
          onStart={(limit) => start({ kind: 'practice', mode: 'difficult', limit, direction: dir, ...scope })}
        />
        <ModeCard
          icon={<PencilLine size={18} />}
          title="Phrases à trous"
          desc="Complétez vos propres exemples. Utilise uniquement les phrases de vos notes."
          count={clozeCount}
          empty="Ajoutez des exemples contenant l’expression pour activer ce mode."
          onStart={(limit) => start({ kind: 'practice', mode: 'cloze', limit, ...scope })}
        />
        <ModeCard
          icon={<Shuffle size={18} />}
          title="Aléatoire"
          desc="Parcourez votre bibliothèque au hasard, y compris les mots non programmés."
          count={scoped.length}
          empty="Votre bibliothèque est vide."
          onStart={(limit) => start({ kind: 'practice', mode: 'random', limit, direction: dir, ...scope })}
        />
      </div>

      {notes.length === 0 && (
        <div style={{ marginTop: 24 }}>
          <Button variant="primary" onClick={() => openEditor()}>
            Ajouter une première expression
          </Button>
        </div>
      )}
      <p className="muted small" style={{ marginTop: 24 }}>
        Pendant une session : <Kbd>Espace</Kbd> afficher la réponse · <Kbd>1</Kbd> Oublié · <Kbd>2</Kbd> Difficile · <Kbd>3</Kbd> Retenu ·{' '}
        <Kbd>4</Kbd> Facile · <Kbd>Z</Kbd> annuler · <Kbd>E</Kbd> modifier · <Kbd>P</Kbd> prononcer · <Kbd>Échap</Kbd> quitter
      </p>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  desc,
  count,
  empty,
  onStart,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  count: number;
  empty: string;
  onStart: (limit: number | null) => void;
}) {
  const disabled = count === 0;
  return (
    <div className="mode-card" aria-disabled={disabled} style={disabled ? { opacity: 0.6 } : undefined}>
      <div className="row row--between">
        <span className="mode-icon">{icon}</span>
        <span className="muted small">{count}</span>
      </div>
      <div className="mode-title">{title}</div>
      <p className="muted small" style={{ flex: 1 }}>
        {disabled ? empty : desc}
      </p>
      <div className="row">
        <Button size="sm" variant="primary" disabled={disabled} onClick={() => onStart(Math.min(count, 10))}>
          {count < 10 ? `Commencer (${count})` : '10 mots'}
        </Button>
        {count > 10 && (
          <Button size="sm" disabled={disabled} onClick={() => onStart(Math.min(count, 25))}>
            {count < 25 ? `Tous (${count})` : '25'}
          </Button>
        )}
      </div>
    </div>
  );
}

