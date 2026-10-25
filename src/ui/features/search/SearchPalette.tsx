import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useApp } from '@/app/store';
import { buildIndex, scoreMatch } from '@/core/domain/search';
import { noteMastery } from '@/core/srs/queue';
import { Kbd, MasteryBadge, Modal } from '@/ui/components/ui';

const MAX = 40;

/** Recherche instantanée (Ctrl+K) dans l'univers courant : expression, traduction, exemples, tags. */
export function SearchPalette() {
  const open = useApp((s) => s.searchOpen);
  if (!open) return null;
  return <Palette />;
}

function Palette() {
  const notes = useApp((s) => s.notes);
  const settings = useApp((s) => s.settings);
  const universeName = useApp((s) => s.universe?.name ?? '');
  const { setSearchOpen, showNote, openEditor } = useApp.getState();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const index = useMemo(() => buildIndex(notes), [notes]);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    if (!query.trim()) return notes.slice(0, 8);
    return notes
      .map((n) => ({ n, s: scoreMatch(index.get(n.id)!, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.n.createdAt - a.n.createdAt)
      .slice(0, MAX)
      .map((x) => x.n);
  }, [notes, index, query]);

  const canAdd = query.trim().length > 0;
  const total = results.length + (canAdd ? 1 : 0);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (i: number, edit = false) => {
    if (i < results.length) {
      if (edit) openEditor(results[i].id);
      else showNote(results[i].id);
      setSearchOpen(false);
    } else if (canAdd) {
      setSearchOpen(false);
      openEditor(null, { expression: query.trim() });
    }
  };

  return (
    <Modal onClose={() => setSearchOpen(false)} className="palette">
      <div className="palette-input">
        <Search size={18} className="muted" />
        <input
          ref={inputRef}
          value={query}
          placeholder={`Rechercher dans « ${universeName} »…`}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(total - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(active, e.ctrlKey || e.metaKey);
            }
          }}
        />
        <Kbd>Échap</Kbd>
      </div>
      <div className="palette-list" ref={listRef}>
        {!query.trim() && results.length > 0 && <div className="section-title" style={{ padding: '6px 12px 2px' }}>Ajouts récents</div>}
        {results.map((n, i) => (
          <button
            key={n.id}
            data-idx={i}
            className={`palette-item ${i === active ? 'palette-item--active' : ''}`}
            onMouseMove={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <span className="en">{n.expression}</span>
            <span className="fr">{n.translation}</span>
            <MasteryBadge mastery={noteMastery(n, settings)} />
          </button>
        ))}
        {query.trim() && results.length === 0 && <div className="empty" style={{ padding: 20 }}>Aucune expression ne correspond.</div>}
        {canAdd && (
          <button
            data-idx={results.length}
            className={`palette-item ${active === results.length ? 'palette-item--active' : ''}`}
            style={{ gridTemplateColumns: 'auto 1fr' }}
            onMouseMove={() => setActive(results.length)}
            onClick={() => choose(results.length)}
          >
            <Plus size={16} className="muted" />
            <span>
              Ajouter <strong>« {query.trim()} »</strong> comme nouvelle expression
            </span>
          </button>
        )}
      </div>
      <div className="palette-footer">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> naviguer
        </span>
        <span>
          <Kbd>Entrée</Kbd> ouvrir
        </span>
        <span>
          <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd> modifier
        </span>
      </div>
    </Modal>
  );
}
