import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useApp } from '@/app/store';
import { buildIndex, scoreMatch } from '@/core/domain/search';
import { noteMastery } from '@/core/srs/queue';
import { Kbd, MasteryBadge, Modal } from '@/ui/components/ui';
import { LanguageBadge } from '@/ui/features/universes/Universes';

const MAX = 40;

/** Recherche instantanée (Ctrl+K) dans tous les univers : expression, traduction, exemples, tags. */
export function SearchPalette() {
  const open = useApp((s) => s.searchOpen);
  if (!open) return null;
  return <Palette />;
}

function Palette() {
  // Recherche dans tous les univers ; l'univers courant passe en premier à pertinence égale.
  const allNotes = useApp((s) => s.allNotes);
  const notes = useApp((s) => s.notes);
  const universes = useApp((s) => s.universes);
  const currentId = useApp((s) => s.universe?.id);
  const settings = useApp((s) => s.settings);
  const universeName = useApp((s) => s.universe?.name ?? '');
  const languageOf = useMemo(() => new Map(universes.map((u) => [u.id, u.language])), [universes]);
  const several = universes.length > 1;
  const { setSearchOpen, showNote, openEditor } = useApp.getState();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const index = useMemo(() => buildIndex(allNotes), [allNotes]);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    if (!query.trim()) return notes.slice(0, 8);
    return allNotes
      .map((n) => ({ n, s: scoreMatch(index.get(n.id)!, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || Number(b.n.universeId === currentId) - Number(a.n.universeId === currentId) || b.n.createdAt - a.n.createdAt)
      .slice(0, MAX)
      .map((x) => x.n);
  }, [allNotes, notes, index, query, currentId]);

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
          placeholder={several ? 'Rechercher dans toutes vos langues…' : `Rechercher dans « ${universeName} »…`}
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
            <span className="en row" style={{ gap: 8 }}>
              {several && <LanguageBadge language={languageOf.get(n.universeId) ?? 'en'} size={18} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.expression}</span>
            </span>
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
              Ajouter <strong>« {query.trim()} »</strong> dans « {universeName} »
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
