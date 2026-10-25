import { useMemo, useState } from 'react';
import { ArrowLeft, FolderPlus, Layers, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { attempt, errorMessage, useApp } from '@/app/store';
import type { Collection } from '@/core/domain/types';
import { noteMastery } from '@/core/srs/queue';
import { Button, EmptyState, Field, Modal } from '@/ui/components/ui';
import { confirm } from '@/ui/components/Confirm';
import { LibraryPage } from '@/ui/features/library/LibraryPage';
import { useDueCounts } from '@/ui/features/review/ReviewPage';

const SUGGESTIONS = ['Business English', 'Everyday Expressions', 'Phrasal Verbs', 'Vocabulary from Movies', 'Advanced Vocabulary'];

export function CollectionsPage() {
  const collections = useApp((s) => s.collections);
  const notes = useApp((s) => s.notes);
  const settings = useApp((s) => s.settings);
  const { navigate } = useApp.getState();
  const [editing, setEditing] = useState<Collection | 'new' | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { total: number; mastered: number }>();
    for (const c of collections) m.set(c.id, { total: 0, mastered: 0 });
    for (const n of notes) {
      for (const id of n.collectionIds) {
        const s = m.get(id);
        if (!s) continue;
        s.total++;
        if (noteMastery(n, settings) === 'mastered') s.mastered++;
      }
    }
    return m;
  }, [collections, notes, settings]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Collections</h1>
          <p className="page-subtitle">Des listes personnalisées. Une expression peut appartenir à plusieurs collections.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <FolderPlus size={16} /> Nouvelle collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Layers size={36} />} title="Aucune collection">
            <p>Regroupez vos expressions par thème, source ou objectif. Idées :</p>
            <div className="row row--wrap" style={{ justifyContent: 'center' }}>
              {SUGGESTIONS.map((name) => (
                <button key={name} className="chip chip--clickable" onClick={() => void attempt(() => useApp.getState().createCollection(name), `Collection « ${name} » créée`)}>
                  <Plus size={12} /> {name}
                </button>
              ))}
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="collection-grid">
          {collections.map((c) => {
            const s = stats.get(c.id) ?? { total: 0, mastered: 0 };
            return (
              <button key={c.id} className="card collection-card" onClick={() => navigate({ name: 'collection', id: c.id })}>
                <div className="collection-name">{c.name}</div>
                {c.description && <p className="muted small">{c.description}</p>}
                <div className="progress-bar" style={{ height: 6 }}>
                  <span style={{ width: `${s.total ? (s.mastered / s.total) * 100 : 0}%`, background: '#10b981' }} />
                </div>
                <span className="muted small">
                  {s.total} expression{s.total > 1 ? 's' : ''} · {s.mastered} maîtrisée{s.mastered > 1 ? 's' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {editing && <CollectionDialog collection={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function CollectionDialog({ collection, onClose }: { collection: Collection | null; onClose: () => void }) {
  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [error, setError] = useState('');
  const { createCollection, updateCollection, navigate, toast } = useApp.getState();

  const submit = async () => {
    try {
      if (collection) {
        await updateCollection(collection.id, name, description);
        toast('success', 'Collection mise à jour');
      } else {
        const id = await createCollection(name, description);
        toast('success', `Collection « ${name.trim()} » créée`);
        navigate({ name: 'collection', id });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      title={collection ? 'Modifier la collection' : 'Nouvelle collection'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="modal-body stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Nom" error={error}>
          <input className="input" autoFocus value={name} list="collection-suggestions" onChange={(e) => (setName(e.target.value), setError(''))} placeholder="Business English" />
          <datalist id="collection-suggestions">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Description" optional>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Réunions, e-mails, présentations…" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function CollectionPage({ id }: { id: string }) {
  const collection = useApp((s) => s.collections.find((c) => c.id === id));
  const notes = useApp((s) => s.notes);
  const { navigate, openEditor, deleteCollection, toast } = useApp.getState();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const due = useDueCounts(id);
  const count = useMemo(() => notes.filter((n) => n.collectionIds.includes(id)).length, [notes, id]);

  if (!collection) {
    return (
      <div className="page">
        <EmptyState title="Collection introuvable">
          <Button onClick={() => navigate({ name: 'collections' })}>Retour aux collections</Button>
        </EmptyState>
      </div>
    );
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Supprimer « ${collection.name} » ?`,
      message: 'Les expressions ne sont pas supprimées : elles restent dans la bibliothèque.',
      confirmLabel: 'Supprimer la collection',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCollection(collection.id);
      toast('success', 'Collection supprimée');
      navigate({ name: 'collections' });
    } catch (err) {
      toast('error', errorMessage(err));
    }
  };

  return (
    <div className="page page--wide">
      <button className="link small" style={{ marginBottom: 10, color: 'var(--text-2)' }} onClick={() => navigate({ name: 'collections' })}>
        <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Collections
      </button>
      <div className="page-header">
        <div>
          <h1 className="page-title">{collection.name}</h1>
          <p className="page-subtitle">
            {collection.description ? `${collection.description} · ` : ''}
            {count} expression{count > 1 ? 's' : ''} · {due.total} à réviser
          </p>
        </div>
        <div className="row row--wrap">
          <Button variant="ghost" icon onClick={() => setEditing(true)} title="Renommer">
            <Pencil size={15} />
          </Button>
          <Button variant="danger-ghost" icon onClick={remove} title="Supprimer la collection">
            <Trash2 size={15} />
          </Button>
          <Button onClick={() => setAdding(true)}>Ajouter des expressions existantes</Button>
          <Button onClick={() => openEditor(null, { collectionIds: [id] })}>
            <Plus size={15} /> Nouvelle
          </Button>
          <Button
            variant="primary"
            disabled={due.total === 0}
            onClick={() => navigate({ name: 'session', config: { kind: 'scheduled', limit: null, collectionId: id } })}
          >
            <Zap size={15} /> Réviser ({due.total})
          </Button>
          <Button
            disabled={count === 0}
            onClick={() => navigate({ name: 'session', config: { kind: 'practice', mode: 'random', limit: Math.min(count, 20), collectionId: id } })}
          >
            Aléatoire
          </Button>
        </div>
      </div>
      <LibraryPage collectionId={id} embedded />
      {editing && <CollectionDialog collection={collection} onClose={() => setEditing(false)} />}
      {adding && <AddExistingDialog collectionId={id} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddExistingDialog({ collectionId, onClose }: { collectionId: string; onClose: () => void }) {
  const notes = useApp((s) => s.notes);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { addToCollection, toast } = useApp.getState();
  const q = query.trim().toLowerCase();
  const candidates = notes
    .filter((n) => !n.collectionIds.includes(collectionId))
    .filter((n) => !q || n.expression.toLowerCase().includes(q) || n.translation.toLowerCase().includes(q))
    .slice(0, 200);

  const submit = async () => {
    if (!picked.size) return;
    await attempt(() => addToCollection(collectionId, [...picked]));
    toast('success', `${picked.size} expression${picked.size > 1 ? 's' : ''} ajoutée${picked.size > 1 ? 's' : ''}`);
    onClose();
  };

  return (
    <Modal
      title="Ajouter à la collection"
      onClose={onClose}
      footer={
        <>
          <span className="muted small">{picked.size} sélectionnée(s)</span>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} disabled={!picked.size}>
            Ajouter
          </Button>
        </>
      }
    >
      <div className="modal-body stack">
        <input className="input" autoFocus placeholder="Filtrer…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="bulk-preview" style={{ maxHeight: 340 }}>
          <table>
            <tbody>
              {candidates.map((n) => (
                <tr key={n.id} style={{ cursor: 'pointer' }} onClick={() => setPicked((p) => (p.has(n.id) ? (p.delete(n.id), new Set(p)) : new Set(p).add(n.id)))}>
                  <td style={{ width: 28 }}>
                    <input type="checkbox" readOnly checked={picked.has(n.id)} />
                  </td>
                  <td>
                    <strong>{n.expression}</strong>
                  </td>
                  <td className="muted">{n.translation}</td>
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr>
                  <td className="muted">Aucune expression disponible.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
