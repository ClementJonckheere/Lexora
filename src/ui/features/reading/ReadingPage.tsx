import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Compass, Loader2, Search, Trash2 } from 'lucide-react';
import { attempt, errorMessage, useApp } from '@/app/store';
import { COMFORT_MAX, COMFORT_MIN, coverageFromProfile, coverageLabel, supportsCoverage } from '@/core/reading/coverage';
import { useKnowledge } from '@/ui/hooks/useKnowledge';
import { LevelQueue, loadBundledCatalog, matchesSearch, pageAfter, searchCatalog, type BundledBook, type BundledCatalog } from '@/core/reading/catalog';
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

interface CachedPage {
  books: CatalogBook[];
  next: string | null;
  count: number | null;
  source: 'gutendex' | 'gutenberg';
}
/** Pages déjà chargées pendant cette session (recherches comprises). */
const memoryCache = new Map<string, CachedPage>();
/** Première page de chaque langue, gardée d'une session à l'autre : affichage immédiat. */
const storedKey = (language: string) => `reading.catalog.v1.${language}`;

function cachedPage(language: string, search: string): CachedPage | null {
  const mem = memoryCache.get(`${language}|${search.toLowerCase()}`);
  if (mem) return mem;
  if (search) return null;
  const stored = readPref<CachedPage | null>(storedKey(language), null);
  return stored && Array.isArray(stored.books) ? stored : null;
}

function rememberPage(language: string, search: string, page: CachedPage) {
  memoryCache.set(`${language}|${search.toLowerCase()}`, page);
  if (!search) writePref(storedKey(language), page);
}

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
  const [total, setTotal] = useState<number | null>(0);
  const [source, setSource] = useState<'gutendex' | 'gutenberg'>('gutendex');
  const [loading, setLoading] = useState(false);
  /** Chargement plus long que d'habitude (Gutendex est parfois lent). */
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const pagesLoaded = useRef(0);
  const request = useRef<AbortController | null>(null);
  /** Catalogue fourni avec l'application (undefined : en cours de lecture, null : absent pour cette langue). */
  const [bundle, setBundle] = useState<BundledCatalog | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setBundle(undefined);
    void loadBundledCatalog(language).then((b) => alive && setBundle(b));
    return () => {
      alive = false;
    };
  }, [language]);
  const profiles = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const b of bundle?.books ?? []) if (b.profile) m.set(b.key, b.profile);
    return m;
  }, [bundle]);
  const [forMe, setForMeState] = useState(() => readPref<boolean>(`reading.forMe.${language}`, true));
  const setForMe = (v: boolean) => {
    setForMeState(v);
    writePref(`reading.forMe.${language}`, v);
  };
  const bundleLevels = useMemo(() => {
    const m = new Map<string, CachedLevel>();
    for (const b of bundle?.books ?? []) if (b.level) m.set(b.key, { level: b.level, vocabRank: b.vocabRank, sentenceLength: b.sentenceLength });
    return m;
  }, [bundle]);
  /** Livres affichés avant ceux du réseau (catalogue fourni filtré par la recherche). */
  const base = useRef<CatalogBook[]>([]);

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
    setSlow(false);
    setError(null);
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const page = await searchCatalog(language, search, pageUrl, ctrl.signal);
      if (ctrl.signal.aborted) return;
      pagesLoaded.current = pageUrl ? pagesLoaded.current + 1 : 1;
      setResults((r) => {
        const kept = pageUrl ? r : base.current;
        const seen = new Set(kept.map((b) => b.key));
        return [...kept, ...page.books.filter((b) => !seen.has(b.key))];
      });
      setNext(page.next);
      if (!base.current.length || page.count != null) setTotal((t) => (base.current.length ? Math.max(t ?? 0, page.count ?? 0) : page.count));
      setSource(page.source);
      if (!pageUrl && !base.current.length) rememberPage(language, search, page);
      const cached = useApp.getState().bookLevels;
      queue.add(page.books.filter((b) => !cached.has(b.key) && !bundleLevels.has(b.key)));
    } catch (err) {
      if (!ctrl.signal.aborted) setError(errorMessage(err));
    } finally {
      clearTimeout(slowTimer);
      if (request.current === ctrl) {
        setLoading(false);
        setSlow(false);
      }
    }
  };

  useEffect(() => {
    if (bundle === undefined) return; // catalogue fourni pas encore lu (quelques millisecondes)
    queue.clear();
    pagesLoaded.current = 0;
    setError(null);
    if (bundle) {
      // Catalogue fourni : affichage immédiat, sans réseau. Une recherche interroge en plus tout le catalogue.
      const local = search ? bundle.books.filter((b) => matchesSearch(b, search)) : bundle.books;
      base.current = local;
      setResults(local);
      setTotal(bundle.total);
      setSource('gutendex');
      const known = useApp.getState().bookLevels;
      queue.add(local.filter((b) => !b.level && !known.has(b.key)));
      if (!search) {
        setNext(pageAfter(language, bundle.books.length));
        return;
      }
      setNext(null);
      void load(null);
      return () => request.current?.abort();
    }
    base.current = [];
    // Dernier résultat connu affiché tout de suite, puis actualisé en arrière-plan.
    const cached = cachedPage(language, search);
    setResults(cached?.books ?? []);
    setNext(cached?.next ?? null);
    setTotal(cached?.count ?? 0);
    if (cached) {
      setSource(cached.source);
      const levels = useApp.getState().bookLevels;
      queue.add(cached.books.filter((b) => !levels.has(b.key)));
    }
    void load(null);
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, search, bundle]);

  const levelOf = (b: CatalogBook): CachedLevel | undefined => levels.get(b.key) ?? bundleLevels.get(b.key);
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

  // Couverture de vocabulaire (livres du catalogue fourni, après le test).
  const { knowledge } = useKnowledge();
  const coverageOf = (b: CatalogBook): number | null => {
    const profile = profiles.get(b.key);
    return knowledge && profile ? coverageFromProfile(profile, knowledge.bands) : null;
  };
  const recommendable = !!knowledge && profiles.size > 0;
  const forMeActive = forMe && recommendable;
  let shown = visible;
  let nearest = false;
  if (forMeActive) {
    const scored = visible.map((b) => ({ b, c: coverageOf(b) })).filter((x): x is { b: CatalogBook; c: number } => x.c !== null);
    const inZone = scored.filter((x) => x.c >= COMFORT_MIN && x.c <= COMFORT_MAX).sort((a, b) => b.c - a.c);
    if (inZone.length) shown = inZone.map((x) => x.b);
    else {
      // Aucun livre dans la zone : les plus proches.
      nearest = true;
      const mid = (COMFORT_MIN + COMFORT_MAX) / 2;
      shown = scored
        .sort((a, b) => Math.abs(a.c - mid) - Math.abs(b.c - mid))
        .slice(0, MIN_VISIBLE)
        .map((x) => x.b);
    }
  }

  return (
    <div className="stack">
      <VocabCard />
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <div className="search-box" style={{ flex: '1 1 280px' }}>
          <Search size={16} />
          <input className="input" placeholder="Titre ou auteur…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un livre" />
        </div>
        {recommendable && (
          <label
            className="switch-inline"
            title="Livres dont vous connaissez 95 à 98 % des mots : lecture confortable, sans dictionnaire, avec assez de mots nouveaux pour progresser"
          >
            <input type="checkbox" checked={forMe} onChange={(e) => setForMe(e.target.checked)} /> Recommandés pour vous
          </label>
        )}
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
      <p className="muted small row" style={{ margin: 0, gap: 6 }}>
        {loading && <Loader2 size={13} className="spin" />}
        {bundle === undefined
          ? 'Chargement…'
          : loading && !results.length
          ? slow
            ? 'Le catalogue répond lentement, encore un instant…'
            : 'Recherche dans le catalogue…'
          : [
              total != null ? `${total.toLocaleString('fr-FR')} livre${total > 1 ? 's' : ''} dans le catalogue` : `${results.length} livres`,
              source === 'gutenberg' ? 'via gutenberg.org (Gutendex ne répond pas)' : null,
              loading ? (base.current.length ? 'recherche dans tout le catalogue…' : 'actualisation…') : null,
              error && results.length ? `actualisation impossible (${error})` : null,
              pending ? `estimation du niveau : ${results.length - pending}/${results.length}` : null,
              maxLevel !== 'all' ? `${confirmed} à votre niveau (≤ ${maxLevel}) parmi ${results.length - pending} analysés` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
      </p>

      {error && !results.length && (
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

      {forMeActive && (
        <p className="muted small" style={{ margin: 0 }}>
          {nearest
            ? `Aucun livre de cette liste entre ${Math.round(COMFORT_MIN * 100)} et ${Math.round(COMFORT_MAX * 100)} % de mots connus : voici les plus proches.`
            : `${shown.length} livre${shown.length > 1 ? 's' : ''} dont vous connaissez ${Math.round(COMFORT_MIN * 100)} à ${Math.round(COMFORT_MAX * 100)} % des mots : lecture confortable, sans dictionnaire.`}
        </p>
      )}

      <div className="book-grid">
        {shown.map((b) => {
          const l = levelOf(b);
          const cov = coverageOf(b);
          return (
            <div key={b.key} className={`book-card ${!l && maxLevel !== 'all' ? 'book-card--pending' : ''}`}>
              <button className="book-card-main" onClick={() => onOpen(b)}>
                <BookCover src={b.coverUrl} title={b.title} author={b.authors[0]} />
                <span className="book-title">{b.title}</span>
                <span className="book-author">{b.authors.join(', ') || 'Auteur inconnu'}</span>
              </button>
              <div className="book-meta">
                <LevelBadge level={l?.level} pending={!l && !failed.has(b.key)} />
                {cov !== null && <CoverageBadge coverage={cov} />}
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

      {((loading && results.length === 0) || next) && (
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
  const stored = useApp((s) => s.bookLevels.get(book.key));
  // Livre du catalogue fourni : niveau déjà estimé à la préparation du catalogue.
  const bundled = book as Partial<BundledBook>;
  const level: CachedLevel | undefined =
    stored ?? (bundled.level ? { level: bundled.level, vocabRank: bundled.vocabRank ?? 0, sentenceLength: bundled.sentenceLength ?? 0 } : undefined);
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

/* --------------------------------------------------- Vocabulaire et couverture --- */

function CoverageBadge({ coverage }: { coverage: number }) {
  const { label, tone } = coverageLabel(coverage);
  const pct = Math.floor(coverage * 1000) / 10;
  return (
    <span className={`chip coverage-badge coverage-badge--${tone}`} title={`Vous connaissez environ ${pct.toLocaleString('fr-FR')} % des mots de ce livre : ${label}`}>
      {Math.round(coverage * 100)} % connus
    </span>
  );
}

/** Résultat du test de vocabulaire, ou invitation à le faire. */
function VocabCard() {
  const test = useApp((s) => s.vocabTest);
  const language = useApp((s) => s.universe?.language ?? 'en');
  const { navigate } = useApp.getState();
  if (!supportsCoverage(language)) return null;
  const start = () => navigate({ name: 'vocab-test' });
  if (!test) {
    return (
      <div className="card card-pad vocab-card">
        <div className="stack stack--sm" style={{ flex: '1 1 320px' }}>
          <strong>Quels livres pouvez-vous lire sans dictionnaire ?</strong>
          <span className="muted small">
            Un test de 3 à 4 minutes estime votre vocabulaire. Chaque livre indique ensuite la part de ses mots que vous connaissez, et Lexora recommande ceux
            entre 95 et 98 % : assez faciles pour lire sans s'arrêter, avec assez de mots nouveaux pour progresser.
          </span>
        </div>
        <Button variant="primary" onClick={start}>
          Faire le test
        </Button>
      </div>
    );
  }
  return (
    <div className="card card-pad vocab-card">
      <span className="small">
        <strong>Votre vocabulaire : environ {test.vocabSize.toLocaleString('fr-FR')} mots</strong>
        <span className="muted"> · test du {new Date(test.takenAt).toLocaleDateString('fr-FR')}, affiné par les mots que vous marquez en lisant</span>
      </span>
      <Button size="sm" onClick={start}>
        Refaire le test
      </Button>
    </div>
  );
}
