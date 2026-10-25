import { useState } from 'react';
import { Pause, Play, Tag, Trash2, X } from 'lucide-react';
import { attempt, useApp } from '@/app/store';
import { Button } from '@/ui/components/ui';

/** Actions sur plusieurs notes cochées dans la bibliothèque. */
export function BulkBar({ ids, total, onSelectAll, onClear }: { ids: string[]; total: number; onSelectAll: () => void; onClear: () => void }) {
  const collections = useApp((s) => s.collections);
  const universes = useApp((s) => s.universes);
  const current = useApp((s) => s.universe?.id);
  const notesById = useApp((s) => s.notesById);
  const { addToCollection, addTag, moveNotes, setSuspended, deleteNotes } = useApp.getState();
  const [tag, setTag] = useState('');
  const n = ids.length;
  const label = `${n} expression${n > 1 ? 's' : ''}`;
  const allSuspended = ids.every((id) => notesById.get(id)?.suspended);
  const others = universes.filter((u) => u.id !== current);

  const submitTag = () => {
    const t = tag.trim();
    if (!t) return;
    void attempt(() => addTag(ids, t), `Tag « ${t} » ajouté à ${label}`).then(() => setTag(''));
  };

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Actions sur la sélection">
      <span className="bulk-count">
        {n} sélectionnée{n > 1 ? 's' : ''}
      </span>
      {n < total && (
        <button className="link small" onClick={onSelectAll}>
          Tout sélectionner ({total})
        </button>
      )}
      {collections.length > 0 && (
        <select
          className="select select--sm"
          value=""
          aria-label="Ajouter à une collection"
          onChange={(e) => {
            const c = collections.find((x) => x.id === e.target.value);
            if (c) void attempt(() => addToCollection(c.id, ids), `${label} ajoutée${n > 1 ? 's' : ''} à « ${c.name} »`);
          }}
        >
          <option value="">Ajouter à une collection…</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <form
        className="row"
        style={{ gap: 4 }}
        onSubmit={(e) => {
          e.preventDefault();
          submitTag();
        }}
      >
        <input className="input" style={{ width: 130 }} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Ajouter un tag" aria-label="Tag à ajouter" />
        <Button size="sm" type="submit" icon title="Ajouter le tag" disabled={!tag.trim()}>
          <Tag size={14} />
        </Button>
      </form>
      {others.length > 0 && (
        <select
          className="select select--sm"
          value=""
          aria-label="Déplacer vers un autre univers"
          onChange={(e) => {
            const u = others.find((x) => x.id === e.target.value);
            if (u) void attempt(() => moveNotes(ids, u.id), `${label} déplacée${n > 1 ? 's' : ''} vers « ${u.name} »`).then(onClear);
          }}
        >
          <option value="">Déplacer vers…</option>
          {others.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
      <Button
        size="sm"
        onClick={() => void attempt(() => setSuspended(ids, !allSuspended), allSuspended ? 'Révisions réactivées' : `${label} suspendue${n > 1 ? 's' : ''}`)}
        title={allSuspended ? 'Réactiver les révisions' : 'Exclure des révisions'}
      >
        {allSuspended ? <Play size={14} /> : <Pause size={14} />} {allSuspended ? 'Réactiver' : 'Suspendre'}
      </Button>
      <Button size="sm" variant="danger-ghost" onClick={() => void attempt(() => deleteNotes(ids)).then(onClear)} title="Supprimer (Suppr)">
        <Trash2 size={14} /> Supprimer
      </Button>
      <span style={{ flex: 1 }} />
      <Button size="sm" variant="ghost" icon onClick={onClear} title="Désélectionner (Échap)">
        <X size={14} />
      </Button>
    </div>
  );
}
