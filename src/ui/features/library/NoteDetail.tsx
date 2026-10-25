import { useEffect, useState } from 'react';
import { Pause, Pencil, Play, Star, Trash2, Volume2, X } from 'lucide-react';
import { State } from 'ts-fsrs';
import { attempt, useApp } from '@/app/store';
import { formatDate, formatDue } from '@/core/domain/dates';
import { activeDirections } from '@/core/domain/settings';
import type { CardRecord, Note } from '@/core/domain/types';
import { directionLabel } from '@/core/domain/types';
import { loadNoteHistory, type ReviewHistoryEntry } from '@/core/repo/reviewRepo';
import { retrievability } from '@/core/srs/scheduler';
import { directionMastery, noteMastery } from '@/core/srs/queue';
import { speechSupported } from '@/core/platform/speech';
import { speakNote } from '@/ui/speech';
import { Button, MasteryBadge } from '@/ui/components/ui';
import { Example } from '@/ui/components/Example';

const RATING_COLOR = ['', 'var(--again)', 'var(--hard)', 'var(--good)', 'var(--easy)'];
const RATING_LABEL = ['', 'Oublié', 'Difficile', 'Retenu', 'Facile'];
const STATE_LABEL: Record<State, string> = {
  [State.New]: 'Jamais révisée',
  [State.Learning]: 'Apprentissage',
  [State.Review]: 'Révision espacée',
  [State.Relearning]: 'Réapprentissage',
};

export function NoteDetail({
  note,
  onDelete,
  masked,
  onReveal,
  collectionId = null,
}: {
  note: Note;
  onDelete: () => void;
  masked: boolean;
  onReveal: () => void;
  /** Affichée depuis une collection : propose de l'en retirer. */
  collectionId?: string | null;
}) {
  const settings = useApp((s) => s.settings);
  const scheduler = useApp((s) => s.scheduler);
  const collections = useApp((s) => s.collections);
  const language = useApp((s) => s.universes.find((u) => u.id === note.universeId)?.language ?? 'en');
  const db = useApp((s) => s.db);
  const revision = useApp((s) => s.revision);
  const { openEditor, toggleFavorite, selectNote, navigate, removeFromCollection, setSuspended } = useApp.getState();
  const [history, setHistory] = useState<ReviewHistoryEntry[]>([]);

  useEffect(() => {
    if (!db) return;
    let alive = true;
    loadNoteHistory(db, note.id)
      .then((h) => alive && setHistory(h))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [db, note.id, revision]);

  const collName = new Map(collections.map((c) => [c.id, c.name]));
  const now = Date.now();

  return (
    <aside className="card card-pad detail stack" aria-label="Détail de la note">
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div className="stack stack--sm" style={{ minWidth: 0 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <h2 className="detail-en" lang={language}>
              {note.expression}
            </h2>
            {speechSupported() && (
              <Button variant="ghost" icon size="sm" title="Écouter (P)" onClick={() => speakNote(note)}>
                <Volume2 size={16} />
              </Button>
            )}
          </div>
          {note.pronunciation && <p className="muted small">{note.pronunciation}</p>}
          {masked ? (
            <button className="link" style={{ alignSelf: 'flex-start' }} onClick={onReveal}>
              Afficher la traduction
            </button>
          ) : (
            <p className="detail-fr">{note.translation}</p>
          )}
        </div>
        <Button variant="ghost" icon size="sm" aria-label="Fermer" onClick={() => selectNote(null)}>
          <X size={16} />
        </Button>
      </div>

      {note.examples.length > 0 && (
        <div className="stack stack--sm">
          {note.examples.map((ex, i) => (
            <Example key={i} sentence={ex} expression={note.expression} language={language} />
          ))}
        </div>
      )}
      {note.comment && <p className="text-2 small" style={{ whiteSpace: 'pre-wrap' }}>{note.comment}</p>}

      <div className="row row--wrap">
        <MasteryBadge mastery={noteMastery(note, settings)} />
        {note.suspended && (
          <span className="chip" title="Exclue des révisions">
            Suspendue
          </span>
        )}
        {note.category && <span className="chip">{note.category}</span>}
        {note.tags.map((t) => (
          <span key={t} className="chip chip--primary">
            {t}
          </span>
        ))}
        {note.collectionIds.map((id) => (
          <button key={id} className="chip chip--clickable" onClick={() => navigate({ name: 'collection', id })}>
            {collName.get(id)}
          </button>
        ))}
      </div>

      <div className="row">
        <Button size="sm" variant="primary" onClick={() => openEditor(note.id)} shortcut="E">
          <Pencil size={14} /> Modifier
        </Button>
        <Button size="sm" onClick={() => void attempt(() => toggleFavorite(note.id))} shortcut="F">
          <Star size={14} fill={note.isFavorite ? '#f59e0b' : 'none'} color={note.isFavorite ? '#f59e0b' : 'currentColor'} />
          {note.isFavorite ? 'Retirer' : 'Favori'}
        </Button>
        <Button
          size="sm"
          icon
          title={note.suspended ? 'Réactiver les révisions' : 'Suspendre (exclure des révisions)'}
          onClick={() => void attempt(() => setSuspended([note.id], !note.suspended), note.suspended ? 'Révisions réactivées' : 'Note suspendue')}
        >
          {note.suspended ? <Play size={15} /> : <Pause size={15} />}
        </Button>
        <Button size="sm" variant="danger-ghost" icon onClick={onDelete} title="Supprimer (Suppr)">
          <Trash2 size={15} />
        </Button>
      </div>
      {collectionId != null && note.collectionIds.includes(collectionId) && (
        <button
          className="link small"
          style={{ alignSelf: 'flex-start', color: 'var(--text-2)' }}
          onClick={() => {
            selectNote(null);
            void attempt(() => removeFromCollection(collectionId, [note.id]), 'Retirée de la collection');
          }}
        >
          Retirer de cette collection
        </button>
      )}

      <hr className="divider" />

      <div className="stack">
        {activeDirections(settings).map((d) => (
          <CardStatus key={d} label={directionLabel(d, language)} card={note.cards[d]} mastery={directionMastery(note.cards[d], settings)} recall={note.cards[d] ? retrievability(scheduler, note.cards[d]!, now) : 0} />
        ))}
      </div>

      {history.length > 0 && (
        <div className="stack stack--sm">
          <div className="section-title" style={{ marginBottom: 0 }}>
            Historique ({history.length})
          </div>
          <div className="history" aria-label="Historique des réponses, de la plus ancienne à la plus récente">
            {[...history].reverse().map((h) => (
              <span
                key={h.id}
                style={{ background: RATING_COLOR[h.rating] }}
                title={`${formatDate(h.reviewedAt)} · ${directionLabel(h.direction, language)} · ${RATING_LABEL[h.rating]}`}
              />
            ))}
          </div>
        </div>
      )}
      <p className="muted small">
        Ajoutée {formatDate(note.createdAt).toLowerCase()}
        {note.updatedAt > note.createdAt + 1000 ? ` · modifiée ${formatDate(note.updatedAt).toLowerCase()}` : ''}
      </p>
    </aside>
  );
}

function CardStatus({ label, card, mastery, recall }: { label: string; card?: CardRecord; mastery: ReturnType<typeof directionMastery>; recall: number }) {
  if (!card) return null;
  return (
    <div className="stack stack--sm">
      <div className="row row--between">
        <strong className="small">{label}</strong>
        <MasteryBadge mastery={mastery} />
      </div>
      <dl className="kv">
        <dt>Phase</dt>
        <dd>{STATE_LABEL[card.state as State]}</dd>
        {card.state !== State.New && (
          <>
            <dt>Prochaine révision</dt>
            <dd>{formatDue(card.due)}</dd>
            <dt>Mémorisation</dt>
            <dd>
              {Math.round(recall * 100)} % aujourd'hui · stabilité {card.stability < 1 ? '< 1' : Math.round(card.stability)} j
            </dd>
            <dt>Révisions</dt>
            <dd>
              {card.reps} · {card.lapses} oubli{card.lapses > 1 ? 's' : ''}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
