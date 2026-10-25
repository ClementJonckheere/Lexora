import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BookOpen, Eye, EyeOff, Plus, Search, Star, Upload } from 'lucide-react';
import { attempt, DEFAULT_FILTERS, useApp, type LibraryFilters } from '@/app/store';
import { formatDate } from '@/core/domain/dates';
import { buildIndex, filterNotes } from '@/core/domain/search';
import { activeDirections } from '@/core/domain/settings';
import type { Note } from '@/core/domain/types';
import { directionLabel } from '@/core/domain/types';
import { directionMastery, noteMastery } from '@/core/srs/queue';
import { Button, DirectionDots, EmptyState, Kbd, MasteryBadge } from '@/ui/components/ui';
import { confirm } from '@/ui/components/Confirm';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { NoteDetail } from './NoteDetail';
import { speakNote } from '@/ui/speech';

const ROW_HEIGHT = 40;

export function LibraryPage({ collectionId = null, embedded = false }: { collectionId?: string | null; embedded?: boolean }) {
  const notes = useApp((s) => s.notes);
  const settings = useApp((s) => s.settings);
  const collections = useApp((s) => s.collections);
  const storedFilters = useApp((s) => s.libraryFilters);
  const hide = useApp((s) => s.hideTranslation);
  const selectedId = useApp((s) => s.selectedNoteId);
  const overlay = useApp((s) => !!s.editor || s.searchOpen || s.bulkOpen || s.shortcutsOpen);
  const { setLibraryFilters, setHideTranslation, selectNote, openEditor, toggleFavorite, deleteNotes, setBulkOpen } = useApp.getState();

  // Dans une collection, les filtres sont locaux et la collection est imposée.
  const [localFilters, setLocalFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const filters = embedded ? { ...localFilters, collectionId } : storedFilters;
  const setFilters = (patch: Partial<LibraryFilters>) => (embedded ? setLocalFilters((f) => ({ ...f, ...patch })) : setLibraryFilters(patch));

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  useEffect(() => setRevealed(new Set()), [hide]);

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => buildIndex(notes), [notes]);
  const masteryOf = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof noteMastery>>();
    return (n: Note) => {
      let m = cache.get(n.id);
      if (!m) cache.set(n.id, (m = noteMastery(n, settings)));
      return m;
    };
  }, [settings, notes]);
  const rows = useMemo(() => filterNotes(notes, index, filters, masteryOf), [notes, index, filters, masteryOf]);

  const categories = useMemo(() => [...new Set(notes.map((n) => n.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [notes]);
  const tags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b)), [notes]);
  const dirs = activeDirections(settings);
  const language = useApp((s) => s.universe?.language ?? 'en');
  const universeName = useApp((s) => s.universe?.name ?? 'Expression');

  // Le détail ne s'affiche que pour une note visible avec les filtres courants.
  const selectedIndex = selectedId != null ? rows.findIndex((r) => r.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : undefined;
  const inCollection = useMemo(
    () => (embedded && collectionId != null ? notes.filter((n) => n.collectionIds.includes(collectionId)).length : notes.length),
    [notes, embedded, collectionId],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, virtualizer]);

  const move = (delta: number) => {
    if (!rows.length) return;
    const next = selectedIndex < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, selectedIndex + delta));
    selectNote(rows[next].id);
  };

  const removeSelected = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: 'Supprimer cette note ?',
      message: `« ${selected.expression} » et son historique de révision seront définitivement supprimés.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok) {
      const next = rows[selectedIndex + 1] ?? rows[selectedIndex - 1];
      await attempt(() => deleteNotes([selected.id]), 'Note supprimée');
      selectNote(next && next.id !== selected.id ? next.id : null);
    }
  };

  useHotkeys(
    {
      '/': () => searchRef.current?.focus(),
      'mod+f': () => searchRef.current?.focus(),
      arrowdown: () => move(1),
      j: () => move(1),
      arrowup: () => move(-1),
      k: () => move(-1),
      enter: () => selected && openEditor(selected.id),
      e: () => selected && openEditor(selected.id),
      f: () => selected && void attempt(() => toggleFavorite(selected.id)),
      delete: () => void removeSelected(),
      h: () => setHideTranslation(!hide),
      p: () => selected && speakNote(selected),
      escape: () => selectNote(null),
    },
    { enabled: !overlay },
  );

  const activeFilterCount =
    (filters.category ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (!embedded && filters.collectionId != null ? 1 : 0) +
    (filters.mastery !== 'all' ? 1 : 0) +
    (filters.date !== 'all' ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0);

  const resetFilters = () => setFilters({ ...DEFAULT_FILTERS, query: filters.query, sort: filters.sort, collectionId: embedded ? collectionId : null });

  const body = (
    <>
      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            ref={searchRef}
            className="input"
            placeholder={`Rechercher (${universeName.toLowerCase()} ou français)…`}
            value={filters.query}
            onChange={(e) => setFilters({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (filters.query) setFilters({ query: '' });
                else (e.target as HTMLInputElement).blur();
                e.stopPropagation();
              } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
                if (rows.length) selectNote(rows[0].id);
              }
            }}
          />
          {!filters.query && <Kbd>/</Kbd>}
        </div>
        <select
          className="select select--sm"
          style={{ width: 'auto' }}
          value={filters.mastery}
          onChange={(e) => setFilters({ mastery: e.target.value as LibraryFilters['mastery'] })}
          aria-label="Maîtrise"
        >
          <option value="all">Toute maîtrise</option>
          <option value="not_mastered">Non maîtrisées</option>
          <option value="new">À apprendre</option>
          <option value="learning">En cours</option>
          <option value="mastered">Maîtrisées</option>
        </select>
        <select
          className="select select--sm"
          style={{ width: 'auto' }}
          value={filters.date}
          onChange={(e) => setFilters({ date: e.target.value as LibraryFilters['date'] })}
          aria-label="Date d'ajout"
        >
          <option value="all">Toutes dates</option>
          <option value="today">Aujourd'hui</option>
          <option value="7d">7 derniers jours</option>
          <option value="30d">30 derniers jours</option>
          <option value="90d">3 derniers mois</option>
        </select>
        {categories.length > 0 && (
          <select
            className="select select--sm"
            style={{ width: 'auto' }}
            value={filters.category}
            onChange={(e) => setFilters({ category: e.target.value })}
            aria-label="Catégorie"
          >
            <option value="">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        {tags.length > 0 && (
          <select className="select select--sm" style={{ width: 'auto' }} value={filters.tag} onChange={(e) => setFilters({ tag: e.target.value })} aria-label="Tag">
            <option value="">Tous tags</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        )}
        {!embedded && collections.length > 0 && (
          <select
            className="select select--sm"
            style={{ width: 'auto' }}
            value={filters.collectionId ?? ''}
            onChange={(e) => setFilters({ collectionId: e.target.value || null })}
            aria-label="Collection"
          >
            <option value="">Toutes collections</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          variant={filters.favoritesOnly ? 'primary' : 'secondary'}
          onClick={() => setFilters({ favoritesOnly: !filters.favoritesOnly })}
          aria-pressed={filters.favoritesOnly}
          title="Favoris uniquement"
        >
          <Star size={14} /> Favoris
        </Button>
        <select
          className="select select--sm"
          style={{ width: 'auto' }}
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as LibraryFilters['sort'] })}
          aria-label="Tri"
        >
          <option value="recent">Plus récentes</option>
          <option value="oldest">Plus anciennes</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="mastery">Par maîtrise</option>
        </select>
        <Button size="sm" variant={hide ? 'primary' : 'secondary'} onClick={() => setHideTranslation(!hide)} title="Masquer le français pour s'autoévaluer (H)">
          {hide ? <EyeOff size={14} /> : <Eye size={14} />} {hide ? 'Français masqué' : 'Masquer le français'}
        </Button>
        {activeFilterCount > 0 && (
          <button className="link small" onClick={resetFilters}>
            Réinitialiser ({activeFilterCount})
          </button>
        )}
      </div>

      <div className={`library ${selected ? 'library--detail' : ''}`}>
        <div className="card table">
          <div className="table-head">
            <span />
            <span>{universeName}</span>
            <span>Français</span>
            <span className="col-category">Catégorie</span>
            <span>Maîtrise</span>
            <span className="col-date">Ajout</span>
          </div>
          {rows.length === 0 ? (
            inCollection === 0 ? (
              <EmptyState icon={<BookOpen size={36} />} title={embedded ? 'Cette collection est vide' : 'Votre bibliothèque est vide'}>
                <p>{embedded ? 'Ajoutez une nouvelle expression ou des expressions existantes.' : 'Ajoutez votre première expression : quelques secondes suffisent.'}</p>
                <div className="row">
                  <Button variant="primary" onClick={() => openEditor(null, embedded && collectionId ? { collectionIds: [collectionId] } : undefined)}>
                    <Plus size={16} /> Ajouter
                  </Button>
                  <Button onClick={() => setBulkOpen(true)}>
                    <Upload size={15} /> Coller une liste
                  </Button>
                </div>
              </EmptyState>
            ) : (
              <EmptyState icon={<Search size={32} />} title="Aucun résultat">
                <p>Aucune expression ne correspond à ces critères.</p>
                {filters.query.trim() && (
                  <Button variant="primary" onClick={() => openEditor(null, { expression: filters.query.trim() })}>
                    <Plus size={16} /> Ajouter « {filters.query.trim()} »
                  </Button>
                )}
              </EmptyState>
            )
          ) : (
            <div className="table-body" ref={scrollRef}>
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const n = rows[v.index];
                  const isSel = n.id === selectedId;
                  const masked = hide && !revealed.has(n.id);
                  return (
                    <div
                      key={n.id}
                      className={`table-row ${isSel ? 'table-row--selected' : ''}`}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${v.start}px)` }}
                      onClick={() => selectNote(isSel ? null : n.id)}
                      onDoubleClick={() => openEditor(n.id)}
                      role="row"
                      aria-selected={isSel}
                    >
                      <button
                        className={`star ${n.isFavorite ? 'star--on' : ''}`}
                        aria-label={n.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        onClick={(e) => {
                          e.stopPropagation();
                          void attempt(() => toggleFavorite(n.id));
                        }}
                      >
                        <Star size={14} fill={n.isFavorite ? 'currentColor' : 'none'} />
                      </button>
                      <span className="en" title={n.expression}>
                        {n.expression}
                      </span>
                      <span
                        className="fr"
                        title={masked ? 'Cliquer pour afficher' : n.translation}
                        onClick={(e) => {
                          if (!masked) return;
                          e.stopPropagation();
                          setRevealed((r) => new Set(r).add(n.id));
                        }}
                      >
                        <span className={masked ? 'masked' : ''}>{n.translation}</span>
                      </span>
                      <span className="col-category">{n.category}</span>
                      <span className="row" style={{ gap: 6 }}>
                        <MasteryBadge mastery={masteryOf(n)} />
                        {dirs.length > 1 && (
                          <DirectionDots
                            levels={dirs.map((d) => directionMastery(n.cards[d], settings))}
                            title={dirs.map((d) => `${directionLabel(d, language)} : ${directionMastery(n.cards[d], settings)}`).join('\n')}
                          />
                        )}
                      </span>
                      <span className="col-date">{formatDate(n.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {rows.length > 0 && (
            <div className="table-footer">
              <span>
                {rows.length} expression{rows.length > 1 ? 's' : ''}
                {rows.length !== notes.length && !embedded ? ` sur ${notes.length}` : ''}
              </span>
              <span className="row">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> parcourir · <Kbd>E</Kbd> modifier · <Kbd>F</Kbd> favori · <Kbd>H</Kbd> masquer le français
              </span>
            </div>
          )}
        </div>
        {selected && <NoteDetail note={selected} collectionId={embedded ? collectionId : null} onDelete={removeSelected} masked={hide && !revealed.has(selected.id)} onReveal={() => setRevealed((r) => new Set(r).add(selected.id))} />}
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <div className="page page--wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bibliothèque</h1>
          <p className="page-subtitle">
            {notes.length} expression{notes.length > 1 ? 's' : ''} enregistrée{notes.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="row">
          <Button onClick={() => setBulkOpen(true)}>
            <Upload size={15} /> Coller une liste
          </Button>
          <Button variant="primary" onClick={() => openEditor()} shortcut="N">
            <Plus size={16} /> Ajouter
          </Button>
        </div>
      </div>
      {body}
    </div>
  );
}
