import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, GraduationCap, List, Loader2, Maximize2, Minimize2, X } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { chapterDisplay, progressAt, splitChapterTitle, type ParsedBook } from '@/core/reading/gutenberg';
import { isFullscreen, setFullscreen } from '@/core/platform/fullscreen';
import { Button, EmptyState, Modal } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { speakText } from '@/ui/speech';
import { readPref, writePref } from '@/ui/prefs';
import { sourceNote } from '@/core/reading/selection';
import { buildKnownIndex, findKnown, segments } from '@/core/reading/known';
import { SelectionBubble, useReaderSelection, useSelectionTranslation } from './SelectionBubble';
import { ChapterWords, CHAPTER_WORDS } from './ChapterWords';
import { analyzeText } from '@/core/reading/coverage';
import { useKnowledge } from '@/ui/hooks/useKnowledge';

type Paper = 'ivory' | 'white' | 'night';
type FontFamily = 'sans' | 'serif';
/** Où se placer une fois le chapitre mis en page. */
type Target = { kind: 'start' } | { kind: 'end' } | { kind: 'block'; block: number };

const FONT_SIZES = [15, 16, 17, 18, 19, 20, 22, 24, 26, 28];
const PAPERS: { value: Paper; label: string }[] = [
  { value: 'ivory', label: 'Ivoire' },
  { value: 'white', label: 'Blanc' },
  { value: 'night', label: 'Nuit' },
];
/** Marges de la page : intérieure, haut (titre courant), bas (numéro de page). */
const PAD_X = 40;
const PAD_TOP = 56;
const PAD_BOTTOM = 48;
/** En dessous de cette largeur, une seule page à la fois. */
const TWO_PAGES_MIN = 860;

export function ReaderPage({ bookKey }: { bookKey: string }) {
  const book = useApp((s) => s.books.find((b) => b.key === bookKey));
  const { navigate, openBookText, saveBookProgress } = useApp.getState();
  const [text, setText] = useState<ParsedBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    openBookText(bookKey)
      .then((t) => alive && setText(t))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [bookKey, openBookText]);

  const close = () => navigate({ name: 'reading' });

  if (!book) {
    return (
      <div className="reader reader--ivory">
        <EmptyState icon={<BookOpen size={36} />} title="Livre introuvable">
          <Button onClick={close}>Retour</Button>
        </EmptyState>
      </div>
    );
  }
  if (error || !text) {
    return (
      <div className="reader reader--ivory reader--loading">
        {error ? (
          <EmptyState icon={<BookOpen size={36} />} title="Impossible d'ouvrir ce livre">
            <p>{error}</p>
            <Button onClick={close}>Retour</Button>
          </EmptyState>
        ) : (
          <span className="row muted">
            <Loader2 size={18} className="spin" /> Téléchargement du livre…
          </span>
        )}
      </div>
    );
  }
  return (
    <Reader
      text={text}
      title={book.title}
      author={book.authors.join(', ')}
      language={book.language}
      universeId={book.universeId}
      start={{ chapter: book.chapter, block: book.block }}
      onPosition={(chapter, block) => void saveBookProgress(bookKey, chapter, block, progressAt(text, chapter, block))}
      onClose={close}
    />
  );
}

function Reader({
  text,
  title,
  author,
  language,
  universeId,
  start,
  onPosition,
  onClose,
}: {
  text: ParsedBook;
  title: string;
  author: string;
  language: string;
  universeId: string;
  start: { chapter: number; block: number };
  onPosition: (chapter: number, block: number) => void;
  onClose: () => void;
}) {
  const overlay = useApp((s) => !!s.editor || s.searchOpen || s.bulkOpen || s.shortcutsOpen || s.universesOpen);
  const chapters = text.chapters;
  const [chapter, setChapter] = useState(() => Math.min(Math.max(0, start.chapter), chapters.length - 1));
  const [spread, setSpread] = useState(0);
  const [spreads, setSpreads] = useState(1);
  const [pages, setPages] = useState(1);
  const [fontSize, setFontSizeState] = useState(() => readPref<number>('reader.fontSize', 19));
  const [paper, setPaperState] = useState<Paper>(() => readPref<Paper>('reader.paper', 'ivory'));
  const [font, setFontState] = useState<FontFamily>(() => readPref<FontFamily>('reader.font', 'sans'));
  const [full, setFull] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [wordsOpen, setWordsOpen] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** Bloc en haut de la page de gauche (position de lecture). */
  const [topBlock, setTopBlock] = useState(start.block);

  const stageRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const target = useRef<Target>({ kind: 'block', block: start.block });
  const current = useRef({ chapter, block: start.block });
  /** Première mise en page faite : avant, la position enregistrée ne doit pas être écrasée. */
  const laidOut = useRef(false);
  // Mots déjà enregistrés dans cette langue : surlignés dans le texte, traduction au survol.
  const [highlight, setHighlightState] = useState(() => readPref<boolean>('reader.highlight', true));
  const setHighlight = (v: boolean) => {
    setHighlightState(v);
    writePref('reader.highlight', v);
  };
  const universeNotes = useApp((s) => s.allNotes);
  const knownIndex = useMemo(
    () => buildKnownIndex(universeNotes.filter((n) => n.universeId === universeId), language),
    [universeNotes, universeId, language],
  );
  const notesById = useApp((s) => s.notesById);
  const known = useMemo(
    () => (highlight ? chapters[chapter].blocks.map((b) => findKnown(b.text, knownIndex)) : null),
    [highlight, chapters, chapter, knownIndex],
  );
  const knownInChapter = useMemo(() => new Set(known?.flatMap((r) => r.map((x) => x.noteId)) ?? []).size, [known]);
  // Couverture du chapitre et mots à connaître (après le test de vocabulaire).
  const { knowledge, ranks } = useKnowledge();
  const analysis = useMemo(
    () => (knowledge && ranks ? analyzeText(chapters[chapter].blocks.map((b) => b.text).join('\n'), ranks, knowledge, language) : null),
    [knowledge, ranks, chapters, chapter, language],
  );
  const toLearn = analysis ? Math.min(CHAPTER_WORDS, analysis.unknown.length) : 0;
  const [sel, clearSel] = useReaderSelection(flowRef, stageRef, chapters[chapter].blocks, language);
  const autoTranslate = useApp((s) => s.settings.autoTranslate);
  const deeplKey = useApp((s) => s.settings.deeplKey);
  const selTranslation = useSelectionTranslation(sel, language, autoTranslate, deeplKey);

  /** Expression sélectionnée → fiche pré-remplie (la phrase du livre comme exemple, la source en note). */
  const addSelection = () => {
    if (!sel || sel.error || !sel.expression) return;
    const { openEditor } = useApp.getState();
    if (sel.known) openEditor(sel.known.id, { examples: [sel.sentence] });
    else
      openEditor(null, {
        expression: sel.expression,
        // Traduction proposée (modifiable) ; sinon la fiche la cherche à l'ouverture.
        ...(selTranslation.text ? { translation: selTranslation.text } : {}),
        examples: [sel.sentence],
        comment: sourceNote(title, author, chapters[chapter].title),
      });
    clearSel();
  };

  /** Mot sélectionné marqué « connu » : il ne compte plus parmi les mots à apprendre. */
  const markSelectionKnown = () => {
    if (!sel || sel.error || !sel.expression || sel.known) return;
    const word = sel.expression.trim().toLowerCase();
    const { markWords, toast } = useApp.getState();
    void markWords([word], true).then(() => toast('success', `« ${word} » compté comme connu`, { label: 'Annuler', run: () => void markWords([word], null) }));
    clearSel();
  };

  const twoPages = size.w >= TWO_PAGES_MIN;
  const flowW = Math.max(0, size.w - 2 * PAD_X);
  const flowH = Math.max(0, size.h - PAD_TOP - PAD_BOTTOM);
  const gap = 2 * PAD_X;
  const columns = twoPages ? 2 : 1;
  const colW = (flowW - gap * (columns - 1)) / columns;
  const step = flowW + gap; // décalage d'une double page à la suivante

  const setFontSize = (v: number) => {
    target.current = { kind: 'block', block: current.current.block };
    setFontSizeState(v);
    writePref('reader.fontSize', v);
  };
  const setPaper = (v: Paper) => {
    setPaperState(v);
    writePref('reader.paper', v);
  };
  const setFont = (v: FontFamily) => {
    target.current = { kind: 'block', block: current.current.block };
    setFontState(v);
    writePref('reader.font', v);
  };

  // Plein écran à l'ouverture (si choisi la dernière fois), quitté en refermant le livre.
  useEffect(() => {
    if (readPref<boolean>('reader.fullscreen', true)) void setFullscreen(true).then(() => setFull(true)).catch(() => undefined);
    const sync = () => void isFullscreen().then(setFull).catch(() => undefined);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      void setFullscreen(false).catch(() => undefined);
    };
  }, []);
  const toggleFullscreen = async () => {
    const on = !(await isFullscreen().catch(() => full));
    await setFullscreen(on).catch(() => undefined);
    setFull(on);
    writePref('reader.fullscreen', on);
  };

  // Taille de la zone de lecture.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => {
        if (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1) return s;
        if (laidOut.current) target.current = { kind: 'block', block: current.current.block };
        return { w: r.width, h: r.height };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Page (dans le chapitre) où commence chaque bloc. */
  const blockPages = useCallback((): number[] => {
    const flow = flowRef.current;
    if (!flow) return [];
    const origin = flow.getBoundingClientRect().left;
    return Array.from(flow.querySelectorAll<HTMLElement>('[data-b]')).map((el) => {
      const first = el.getClientRects()[0] ?? el.getBoundingClientRect();
      return Math.max(0, Math.floor((first.left - origin + 1) / (colW + gap)));
    });
  }, [colW, gap]);

  // Mise en page du chapitre : nombre de pages, puis position demandée.
  useLayoutEffect(() => {
    const flow = flowRef.current;
    if (!flow || !flowW || !flowH) return;
    const origin = flow.getBoundingClientRect().left;
    let right = 0;
    for (const el of Array.from(flow.children) as HTMLElement[]) {
      const rects = el.getClientRects();
      const last = rects[rects.length - 1];
      if (last) right = Math.max(right, last.right - origin);
    }
    const nPages = Math.max(1, Math.ceil((right - 1) / (colW + gap)));
    const nSpreads = Math.max(1, Math.ceil(nPages / columns));
    setPages(nPages);
    setSpreads(nSpreads);
    const t = target.current;
    let s = 0;
    if (t.kind === 'end') s = nSpreads - 1;
    else if (t.kind === 'block') {
      const starts = blockPages();
      const page = starts[Math.min(t.block, starts.length - 1)] ?? 0;
      s = Math.floor(page / columns);
    }
    setSpread(Math.min(s, nSpreads - 1));
    target.current = { kind: 'start' };
    laidOut.current = true;
  }, [chapter, fontSize, font, flowW, flowH, colW, gap, columns, blockPages]);

  // Position courante : le bloc visible en haut de la page de gauche.
  useEffect(() => {
    if (!laidOut.current) return;
    const starts = blockPages();
    if (!starts.length) return;
    const firstPage = spread * columns;
    let block = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= firstPage) block = i;
    current.current = { chapter, block };
    setTopBlock(block);
    const t = setTimeout(() => onPosition(chapter, block), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread, chapter, spreads]);

  const goChapter = (c: number, where: Target) => {
    if (c < 0 || c >= chapters.length) return;
    target.current = where;
    setChapter(c);
  };
  const next = () => {
    clearSel();
    if (spread < spreads - 1) setSpread(spread + 1);
    else goChapter(chapter + 1, { kind: 'start' });
  };
  const prev = () => {
    clearSel();
    if (spread > 0) setSpread(spread - 1);
    else goChapter(chapter - 1, { kind: 'end' });
  };
  const atEnd = spread >= spreads - 1 && chapter >= chapters.length - 1;
  const atStart = spread === 0 && chapter === 0;
  const fontIndex = FONT_SIZES.indexOf(fontSize);
  const bigger = () => setFontSize(FONT_SIZES[Math.min(FONT_SIZES.length - 1, (fontIndex < 0 ? 4 : fontIndex) + 1)]);
  const smaller = () => setFontSize(FONT_SIZES[Math.max(0, (fontIndex < 0 ? 4 : fontIndex) - 1)]);

  useHotkeys(
    {
      arrowright: next,
      arrowleft: prev,
      pagedown: next,
      pageup: prev,
      space: next,
      'shift+space': prev,
      home: () => setSpread(0),
      end: () => setSpread(spreads - 1),
      '+': bigger,
      '=': bigger,
      '-': smaller,
      t: () => setTocOpen(true),
      m: () => analysis && setWordsOpen(true),
      f: () => void toggleFullscreen(),
      enter: addSelection,
      a: addSelection,
      p: () => sel?.expression && !sel.error && speakText(sel.expression, universeId),
      escape: () => (sel ? clearSel() : full ? void toggleFullscreen() : onClose()),
    },
    { enabled: !overlay && !tocOpen && !wordsOpen },
  );

  // Molette : une page par cran (avec un court délai pour les pavés tactiles).
  const lastWheel = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheel.current < 350 || Math.abs(e.deltaY) < 8) return;
    lastWheel.current = now;
    if (e.deltaY > 0) next();
    else prev();
  };

  const ch = chapters[chapter];
  const heading = splitChapterTitle(ch.title);
  const runningLeft = heading.label || title;
  const progress = Math.round(progressAt(text, chapter, topBlock) * 100);
  const firstPage = spread * columns;
  const pageNumbers = Array.from({ length: columns }, (_, i) => firstPage + i).map((p) => (p < pages ? p + 1 : null));
  const chapterNo = chapters.length > 1 ? `${chapter + 1}/${chapters.length}` : '';

  return (
    <div className={`reader reader--${paper} reader--${font}`} onWheel={onWheel}>
      <header className="reader-bar">
        <BookOpen size={18} />
        <div className="reader-title">
          <strong>{title}</strong>
          <span>{author}</span>
        </div>
        <span className="reader-hint">Double-clic ou sélection : enregistrer un mot</span>
        <div className="reader-tools">
          <button className="reader-pill" onClick={smaller} disabled={fontIndex === 0} title="Réduire le texte (−)">
            A−
          </button>
          <button className="reader-pill" onClick={bigger} disabled={fontIndex === FONT_SIZES.length - 1} title="Agrandir le texte (+)">
            A+
          </button>
          {analysis && toLearn > 0 && (
            <button className="reader-pill" onClick={() => setWordsOpen(true)} title="Mots à connaître pour ce chapitre (M)">
              <GraduationCap size={15} /> Mots du chapitre<span className="reader-pill-count">{toLearn}</span>
            </button>
          )}
          {chapters.length > 1 && (
            <button className="reader-icon" onClick={() => setTocOpen(true)} title="Chapitres (T)">
              <List size={18} />
            </button>
          )}
          <button className="reader-icon" onClick={() => void toggleFullscreen()} title={full ? 'Quitter le plein écran (F)' : 'Plein écran (F)'}>
            {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <button className="reader-icon" onClick={onClose} title="Fermer le livre (Échap)">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="reader-desk">
        <div className={`reader-spread ${twoPages ? 'reader-spread--two' : ''}`} ref={stageRef}>
          {pageNumbers.map((n, i) => (
            <div key={i} className="reader-page" style={{ left: `${(i * 100) / columns}%`, width: `${100 / columns}%` }}>
              <div className="reader-running">{i === 0 || !twoPages ? runningLeft : author || title}</div>
              <div className="reader-page-no">{n ?? ''}</div>
            </div>
          ))}
          <div className="reader-clip" style={{ left: PAD_X, top: PAD_TOP, width: flowW, height: flowH }}>
            <div
              ref={flowRef}
              className="reader-flow"
              lang={language}
              style={{
                width: flowW,
                height: flowH,
                columnCount: columns,
                columnGap: gap,
                fontSize,
                transform: `translateX(${-spread * step}px)`,
              }}
            >
              {ch.title && (
                <h2 className="reader-chapter" data-b-title="">
                  {heading.name ? (
                    <>
                      <span className="reader-chapter-label">{heading.label}</span>
                      {heading.name}
                    </>
                  ) : (
                    heading.label
                  )}
                </h2>
              )}
              {ch.blocks.map((b, i) => (
                <p key={i} data-b={i} className={b.kind === 'verse' ? 'reader-verse' : undefined}>
                  {known?.[i]?.length
                    ? segments(b.text, known[i]).map((seg, k) => {
                        const note = seg.noteId ? notesById.get(seg.noteId) : undefined;
                        return note ? (
                          <span key={k} className="known-word" title={`${note.expression} : ${note.translation}`}>
                            {seg.text}
                          </span>
                        ) : (
                          seg.text
                        );
                      })
                    : b.text}
                </p>
              ))}
            </div>
          </div>
          {sel && !overlay && (
            <SelectionBubble sel={sel} universeId={universeId} translation={selTranslation} onAdd={addSelection} onKnown={knowledge ? markSelectionKnown : undefined} />
          )}
          <button className="reader-edge reader-edge--prev" onClick={prev} disabled={atStart} aria-label="Page précédente" />
          <button className="reader-edge reader-edge--next" onClick={next} disabled={atEnd} aria-label="Page suivante" />
        </div>
      </div>

      <footer className="reader-nav">
        <button className="reader-pill reader-pill--lg" onClick={prev} disabled={atStart}>
          <ChevronLeft size={18} /> Précédent
        </button>
        <div className="reader-pos">
          <span>
            {spread + 1} / {spreads}
          </span>
          <small>
            {chapterNo && `Chapitre ${chapterNo} · `}
            {progress} % du livre
            {highlight && knownInChapter > 0 && ` · ${knownInChapter} de vos mots dans ce chapitre`}
            {analysis && ` · environ ${Math.round(analysis.coverage * 100)} % de mots connus`}
          </small>
        </div>
        <button className="reader-pill reader-pill--lg" onClick={next} disabled={atEnd}>
          Suivant <ChevronRight size={18} />
        </button>
      </footer>
      <div className="reader-options">
        <span>Couleur du papier</span>
        <div className="reader-choice">
          {PAPERS.map((p) => (
            <button key={p.value} aria-pressed={paper === p.value} onClick={() => setPaper(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 16 }}>Mes mots</span>
        <div className="reader-choice">
          <button aria-pressed={highlight} onClick={() => setHighlight(true)} title="Souligner les mots déjà enregistrés (traduction au survol)">
            Surligner
          </button>
          <button aria-pressed={!highlight} onClick={() => setHighlight(false)}>
            Masquer
          </button>
        </div>
        <span style={{ marginLeft: 16 }}>Police</span>
        <div className="reader-choice">
          <button aria-pressed={font === 'sans'} onClick={() => setFont('sans')}>
            Sans
          </button>
          <button aria-pressed={font === 'serif'} onClick={() => setFont('serif')} style={{ fontFamily: 'Georgia, serif' }}>
            Serif
          </button>
        </div>
      </div>

      {wordsOpen && analysis && (
        <ChapterWords
          words={analysis.unknown}
          coverage={analysis.coverage}
          blocks={chapters[chapter].blocks}
          language={language}
          source={sourceNote(title, author, chapters[chapter].title)}
          onClose={() => setWordsOpen(false)}
        />
      )}
      {tocOpen && (
        <Modal title="Chapitres" onClose={() => setTocOpen(false)}>
          <div className="modal-body toc">
            {chapters.map((c, i) => (
              <button
                key={i}
                className={`toc-item ${i === chapter ? 'toc-item--current' : ''}`}
                onClick={() => {
                  setTocOpen(false);
                  goChapter(i, { kind: 'start' });
                }}
                autoFocus={i === chapter}
              >
                <span className="muted small">{i + 1}</span>
                <span>{chapterDisplay(c.title) || `Partie ${i + 1}`}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
