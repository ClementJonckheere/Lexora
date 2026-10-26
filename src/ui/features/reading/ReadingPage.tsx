import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Compass, Loader2, Search, Trash2 } from 'lucide-react';
import { attempt, errorMessage, useApp } from '@/app/store';
import { LevelQueue, searchCatalog } from '@/core/reading/catalog';
import type { CatalogBook } from '@/core/reading/gutendex';
import { LEVEL_LABEL, LEVELS, withinLevel, type Level } from '@/core/reading/level';
import type { Book, CachedLevel } from '@/core/repo/booksRepo';
import { languageInfo } from '@/core/domain/languages';
import { Button, EmptyState, Modal, Segmented } from '@/ui/components/ui';
import { confirm } from '@/ui/components/Confirm';
import { readPref, writePref } from '@/ui/prefs';
import { BookCover, LevelBadge } from './BookCover';

type Tab = 'mine' | 'discover';
type MaxLevel = Level | 'all';

/** Nombre minimal de livres affichés avant de charger automatiquement la page suivante (filtre de niveau). */
const MIN_VISIBLE = 12;
/** Pages chargées automatiquement au plus, pour une recherche. */
const AUTO_PAGES = 5;

export function ReadingPage() {
  const universe = useApp((s) => s.universe)!;
  const books = useApp((s) => s.books);
  const mine = useMemo(() => books.filter((b) => b.universeId === universe.id), [books, universe.id]);
  const [tab, setTab] = useState<Tab>(() => (mine.length ? 'mine' : 'discover'));
  const [detail, setDetail] = useState<CatalogBook | null>(null);

  return (
    <div className="page page--wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lecture</h1>
          <p className="page-subtitle">Des livres libres de droits en {languageInfo(universe.language).name.toLowerCase()}, choisis à votre niveau.</p>
        </div>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mine', label: `Mes livres${mine.length ? ` (${mine.length})` : ''}` },
            { value: 'discover', label: 'Découvrir' },
          ]}
        />
      </div>
      {tab === 'mine' ? <MyBooks books={mine} onDiscover={() => setTab('discover')} /> : <Discover language={universe.language} onOpen={setDetail} />}
      {detail && <BookDetail book={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------- Mes livres --- */

function MyBooks({ books, onDiscover }: { books: Book[]; onDiscover: () => void }) {
  const covers = useApp((s) => s.bookCovers);
  const { navigate, removeBook } = useApp.getState();
  if (!books.length) {
    return (
      <div className="card">
        <EmptyState icon={<BookOpen size={36} />} title="Aucun livre pour le moment">
          <p>Choisissez un livre à votre niveau dans le catalogue de Project Gutenberg (plus de 70 000 œuvres libres de droits).</p>
          <Button variant="primary" onClick={onDiscover}>
            <Compass size={16} /> Découvrir des livres
          </Button>
        </EmptyState>
      </div>
    );
  }
  const remove = async (b: Book) => {
    const ok = await confirm({
      title: `Retirer « ${b.title} » ?`,
      message: 'Le livre et votre position de lecture seront retirés de tous vos appareils. Vous pourrez le rajouter depuis le catalogue.',
      confirmLabel: 'Retirer',
      danger: true,
    });
    if (ok) await attempt(() => removeBook(b.key), 'Livre retiré');
  };
  return (
    <div className="book-grid">
      {books.map((b) => (
        <div key={b.key} className="book-card">
          <button className="book-card-main" onClick={() => navigate({ name: 'reader', bookKey: b.key })} title="Lire">
            <BookCover src={covers.get(b.key) ?? b.coverUrl} title={b.title} author={b.authors[0]} />
            <div className="book-progress" aria-label={`${Math.round(b.progress * 100)} % lu`}>
              <span style={{ width: `${Math.round(b.progress * 100)}%` }} />
            </div>
            <span className="book-title">{b.title}</span>
            <span className="book-author">{b.authors.join(', ')}</span>
          </button>
          <div className="book-meta">
            <LevelBadge level={b.level} />
            <span className="muted small">{b.progress > 0 ? `${Math.round(b.progress * 100)} %` : 'Pas commencé'}</span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" icon size="sm" title="Retirer de mes livres" onClick={() => void remove(b)}>
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Découvrir --- */

function Discover({ language, onOpen }: { language: string; onOpen: (b: CatalogBook) => void }) {
  const levels = useApp((s) => s.bookLevels);
  const owned = useApp((s) => s.books);
  const { setBookLevel } = useApp.getState();
  const [maxLevel, setMaxLevelState] = useState<MaxLevel>(() => readPref<MaxLevel>(`reading.maxLevel.${language}`, 'all'));
  const setMaxLevel = (v: MaxLevel) => {
    setMaxLevelState(v);
    writePref(`reading.maxLevel.${language}`, v);
  };
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CatalogBook[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const pagesLoaded = useRef(0);
  const request = useRef<AbortController | null>(null);

  const queue = useMemo(
    () =>
      new LevelQueue((book, estimate) => {
        if (estimate) void setBookLevel(book.key, estimate);
        else setFailed((f) => new Set(f).add(book.key));
        setTick((t) => t + 1);
      }),
    [setBookLevel],
  );
  useEffect(() => () => queue.clear(), [queue]);

  // Recherche tapée : envoyée après une courte pause.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 450);
    return () => clearTimeout(t);
  }, [query]);

  const load = async (pageUrl: string | null) => {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const page = await searchCatalog(language, search, pageUrl, ctrl.signal);
      if (ctrl.signal.aborted) return;
      pagesLoaded.current++;
      setResults((r) => {
        const seen = new Set(r.map((b) => b.key));
        return [...(pageUrl ? r : []), ...page.books.filter((b) => !pageUrl || !seen.has(b.key))];
      });
      setNext(page.next);
      setTotal(page.count);
      const cached = useApp.getState().bookLevels;
      queue.add(page.books.filter((b) => !cached.has(b.key)));
    } catch (err) {
      if (!ctrl.signal.aborted) setError(errorMessage(err));
    } finally {
      if (request.current === ctrl) setLoading(false);
    }
  };

  useEffect(() => {
    queue.clear();
    pagesLoaded.current = 0;
    setResults([]);
    void load(null);
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, search]);

  const levelOf = (b: CatalogBook): CachedLevel | undefined => levels.get(b.key);
  const visible = results.filter((b) => {
    if (maxLevel === 'all') return true;
    const l = levelOf(b);
    if (l) return withinLevel(l.level, maxLevel);
    return !failed.has(b.key); // en cours d'estimation : affiché, en attente
  });
  const pending = results.filter((b) => !levelOf(b) && !failed.has(b.key)).length;

  // Avec un filtre de niveau, on charge la suite tant qu'il y a trop peu de livres adaptés.
  const confirmed = visible.filter((b) => levelOf(b)).length;
  useEffect(() => {
    if (maxLevel === 'all' || loading || !next || pending > 0) return;
    if (confirmed < MIN_VISIBLE && pagesLoaded.current < AUTO_PAGES) void load(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLevel, loading, next, pending, confirmed]);

  const ownedKeys = new Set(owned.map((b) => b.key));

  return (
    <div className="stack">
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <div className="search-box" style={{ flex: '1 1 280px' }}>
          <Search size={16} />
          <input className="input" placeholder="Titre ou auteur…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un livre" />
        </div>
        <span className="muted small">Niveau maximum</span>
        <Segmented<MaxLevel>
          value={maxLevel}
          onChange={setMaxLevel}
          options={[
            { value: 'all', label: 'Tous' },
            ...LEVELS.filter((l) => l !== 'A1' && l !== 'C2').map((l) => ({ value: l as MaxLevel, label: l, title: `Jusqu'à ${l} (${LEVEL_LABEL[l].toLowerCase()})` })),
          ]}
        />
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {loading && !results.length
          ? 'Recherche dans le catalogue…'
          : `${total.toLocaleString('fr-FR')} livre${total > 1 ? 's' : ''} dans le catalogue${pending ? ` · estimation du niveau : ${results.length - pending}/${results.length}` : ''}${
              maxLevel !== 'all' ? ` · ${confirmed} à votre niveau (≤ ${maxLevel}) parmi ${results.length - pending} analysés` : ''
            }`}
      </p>

      {error && (
        <div className="notice notice--error">
          <strong>Catalogue indisponible.</strong> {error}{' '}
          <button className="link" onClick={() => void load(null)}>
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && results.length > 0 && visible.length === 0 && (
        <div className="card">
          <EmptyState icon={<Search size={32} />} title="Aucun livre à ce niveau dans ces résultats">
            <p>Essayez un niveau plus élevé, une autre recherche, ou chargez davantage de livres.</p>
          </EmptyState>
        </div>
      )}

      <div className="book-grid">
        {visible.map((b) => {
          const l = levelOf(b);
          return (
            <div key={b.key} className={`book-card ${!l && maxLevel !== 'all' ? 'book-card--pending' : ''}`}>
              <button className="book-card-main" onClick={() => onOpen(b)}>
                <BookCover src={b.coverUrl} title={b.title} author={b.authors[0]} />
                <span className="book-title">{b.title}</span>
                <span className="book-author">{b.authors.join(', ') || 'Auteur inconnu'}</span>
              </button>
              <div className="book-meta">
                <LevelBadge level={l?.level} pending={!l && !failed.has(b.key)} />
                {b.children && <span className="chip">Jeunesse</span>}
                {ownedKeys.has(b.key) && (
                  <span className="chip chip--primary" title="Dans mes livres">
                    <Check size={12} /> Ajouté
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(loading || next) && (
        <div className="row" style={{ justifyContent: 'center', padding: '8px 0 24px' }}>
          {loading ? (
            <span className="muted row">
              <Loader2 size={16} className="spin" /> Chargement…
            </span>
          ) : (
            <Button onClick={() => void load(next)}>Plus de livres</Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Fiche livre --- */

function BookDetail({ book, onClose }: { book: CatalogBook; onClose: () => void }) {
  const level = useApp((s) => s.bookLevels.get(book.key));
  const owned = useApp((s) => s.books.some((b) => b.key === book.key && b.universeId === s.universe?.id));
  const { addBook, navigate, toast } = useApp.getState();
  const [busy, setBusy] = useState(false);

  const read = async () => {
    if (!owned) {
      setBusy(true);
      try {
        await addBook(book);
      } catch (err) {
        toast('error', `Téléchargement impossible : ${errorMessage(err)}`);
        setBusy(false);
        return;
      }
    }
    onClose();
    navigate({ name: 'reader', bookKey: book.key });
  };

  return (
    <Modal title={book.title} onClose={onClose} size="wide">
      <div className="modal-body book-detail">
        <BookCover src={book.coverUrl} title={book.title} author={book.authors[0]} size="lg" />
        <div className="stack">
          <div>
            <div className="book-detail-author">{book.authors.join(', ') || 'Auteur inconnu'}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <LevelBadge level={level?.level} pending={!level} />
              {level && <strong>{LEVEL_LABEL[level.level]}</strong>}
              {book.children && <span className="chip">Jeunesse</span>}
            </div>
          </div>
          {level ? (
            <p className="text-2 small" style={{ margin: 0 }}>
              Niveau estimé sur le texte : pour comprendre 90 % des mots, il faut connaître environ les{' '}
              <strong>{Math.round(level.vocabRank / 100) * 100 || level.vocabRank}</strong> mots les plus courants de la langue ; phrases de{' '}
              <strong>{Math.round(level.sentenceLength)}</strong> mots en moyenne.
            </p>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              Niveau en cours d'estimation.
            </p>
          )}
          {book.subjects.length > 0 && (
            <div className="row row--wrap">
              {book.subjects.slice(0, 5).map((s) => (
                <span key={s} className="chip">
                  {s.replace(/ -- .*/, '')}
                </span>
              ))}
            </div>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            Project Gutenberg n° {book.gutenbergId} · {book.downloads.toLocaleString('fr-FR')} téléchargements le mois dernier
          </p>
          <div className="row">
            <Button variant="primary" onClick={() => void read()} disabled={busy} autoFocus>
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" /> Téléchargement…
                </>
              ) : (
                <>
                  <BookOpen size={16} /> {owned ? 'Continuer la lecture' : 'Lire ce livre'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
