import { useEffect, useRef, useState, type RefObject } from 'react';
import { translate } from '@/core/translate/translate';
import { sharedDeepl } from '@/core/translate/shared';
import { BookmarkPlus, Check, Loader2, PenLine, Volume2 } from 'lucide-react';
import { useApp } from '@/app/store';
import { expressionKey } from '@/core/domain/text';
import type { Note } from '@/core/domain/types';
import type { Block } from '@/core/reading/gutenberg';
import { cleanSelection, sentenceAround, startsSentence, wordAt } from '@/core/reading/selection';
import { speechSupported } from '@/core/platform/speech';
import { speakText } from '@/ui/speech';
import { Kbd } from '@/ui/components/ui';

export interface ReaderSelection {
  expression: string;
  sentence: string;
  error?: string;
  /** Position de la bulle, relative à la zone de lecture. */
  x: number;
  y: number;
  below: boolean;
  /** Note déjà enregistrée pour cette expression (même univers). */
  known?: Note;
  /** Choisie en touchant un mot (écran tactile) : un second mot touché étend l'expression. */
  tapped?: boolean;
}

const BUBBLE_H = 46;
/** Surlignage du mot touché (CSS Custom Highlight), sans le menu de sélection du téléphone. */
const TAP_HIGHLIGHT = 'lexora-tap';

/** Position (en caractères) d'un point de la sélection dans le texte de l'élément. */
function textOffset(el: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** Plage couvrant les caractères [start, end[ du texte de l'élément (découpé ou non en mots surlignés). */
function rangeIn(el: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  let pos = 0;
  let started = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0;
    if (!started && start <= pos + len) {
      r.setStart(n, start - pos);
      started = true;
    }
    if (started && end <= pos + len) {
      r.setEnd(n, end - pos);
      return r;
    }
    pos += len;
  }
  return null;
}

/** Point du texte sous le doigt. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof d.caretPositionFromPoint === 'function') {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  if (typeof d.caretRangeFromPoint === 'function') {
    const r = d.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

function setTapHighlight(range: Range | null) {
  const highlights = (globalThis.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights;
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (highlights && HighlightCtor) {
    if (range) highlights.set(TAP_HIGHLIGHT, new HighlightCtor(range));
    else highlights.delete(TAP_HIGHLIGHT);
    return;
  }
  // Navigateur sans surlignage personnalisé : la sélection ordinaire montre le mot.
  if (range) {
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
  }
}

const blockOf = (node: Node) => (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest<HTMLElement>('[data-b]') ?? null;

/**
 * Suit la sélection de texte dans le livre : expression nettoyée, phrase qui la contient,
 * position de la bulle. Rien n'est envoyé à un service externe.
 *
 * Sur écran tactile, toucher un mot le choisit (le menu « Copier, Tout sélectionner » du téléphone n'apparaît pas) ;
 * toucher un second mot du même paragraphe étend le choix à l'expression entre les deux ; toucher le choix l'annule.
 */
export function useReaderSelection(
  flowRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>,
  blocks: Block[],
  language: string,
): [ReaderSelection | null, () => void] {
  const [sel, setSel] = useState<ReaderSelection | null>(null);
  /** Choix au toucher : paragraphe, étendue, et premier mot touché. */
  const tap = useRef<{ block: number; start: number; end: number; first: [number, number] } | null>(null);

  useEffect(() => {
    tap.current = null;
    setTapHighlight(null);

    const describe = (range: Range, tapped: boolean): ReaderSelection | null => {
      const stage = stageRef.current;
      const startEl = blockOf(range.startContainer);
      const endEl = blockOf(range.endContainer);
      if (!stage || !startEl) return null;

      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left + rect.width / 2 - box.left, 150), box.width - 150);
      const below = rect.top - box.top < BUBBLE_H + 16;
      const y = below ? rect.bottom - box.top + 10 : rect.top - box.top - 10;

      if (startEl !== endEl) {
        return { expression: '', sentence: '', error: 'Sélectionnez un mot ou une expression dans un seul paragraphe.', x, y, below };
      }
      const block = blocks[Number(startEl.dataset.b)];
      if (!block) return null;
      // Décalages dans le texte du paragraphe, même s'il est découpé (mots connus surlignés).
      const startOffset = textOffset(startEl, range.startContainer, range.startOffset);
      const endOffset = textOffset(startEl, range.endContainer, range.endOffset);
      const raw = block.text.slice(startOffset, endOffset);
      const lead = raw.length - raw.trimStart().length;
      const { expression, error } = cleanSelection(raw, language, startsSentence(block.text, startOffset + lead));
      const sentence = sentenceAround(block.text, startOffset, endOffset);
      const key = expression ? expressionKey(expression, language) : '';
      const known = key ? useApp.getState().notes.find((n) => n.expressionKey === key) : undefined;
      return { expression, sentence, error, x, y, below, known, tapped };
    };

    const clearTap = () => {
      tap.current = null;
      setTapHighlight(null);
      setSel(null);
    };

    let keepUntil = 0;
    const read = () => {
      const s = window.getSelection();
      const flow = flowRef.current;
      const collapsed = !s || s.isCollapsed || !s.rangeCount;
      // Un mot touché reste choisi tant qu'aucune vraie sélection ne le remplace ; de même pendant un appui sur la bulle.
      if (collapsed && (tap.current || Date.now() < keepUntil)) return;
      if (collapsed || !flow) return setSel(null);
      const range = s.getRangeAt(0);
      if (!flow.contains(range.commonAncestorContainer)) return tap.current ? undefined : setSel(null);
      const t = tap.current;
      if (t) {
        const el = blockOf(range.startContainer);
        // Sélection posée par setTapHighlight (navigateur sans surlignage personnalisé) : déjà décrite.
        if (el && Number(el.dataset.b) === t.block && textOffset(el, range.startContainer, range.startOffset) === t.start) return;
        tap.current = null;
        setTapHighlight(null);
      }
      setSel(describe(range, false));
    };

    const onTap = (x: number, y: number) => {
      const flow = flowRef.current;
      const pos = caretAt(x, y);
      const el = pos && blockOf(pos.node);
      if (!flow || !pos || !el || !flow.contains(el)) return clearTap();
      const b = Number(el.dataset.b);
      const text = blocks[b]?.text;
      const word = text ? wordAt(text, textOffset(el, pos.node, pos.offset)) : null;
      if (!word) return clearTap();
      const t = tap.current;
      let next = { block: b, start: word[0], end: word[1], first: word };
      if (t && t.block === b) {
        if (word[0] >= t.start && word[1] <= t.end) return clearTap();
        // Un seul mot choisi : le second touché ferme l'expression (dans un sens ou dans l'autre).
        if (t.start === t.first[0] && t.end === t.first[1]) next = { block: b, start: Math.min(t.start, word[0]), end: Math.max(t.end, word[1]), first: t.first };
      }
      let range = rangeIn(el, next.start, next.end);
      let described = range && describe(range, true);
      // Second mot trop loin (expression trop longue) : on repart de ce mot.
      if (described?.error && next.first !== word) {
        next = { block: b, start: word[0], end: word[1], first: word };
        range = rangeIn(el, word[0], word[1]);
        described = range && describe(range, true);
      }
      if (!range) return;
      window.getSelection()?.removeAllRanges();
      tap.current = next;
      setTapHighlight(range);
      setSel(described);
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    // Après le relâchement de la souris (ou Maj+flèches), pas à chaque caractère sélectionné.
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 180);
    };
    // Toucher bref, sans glisser : choix d'un mot. Un appui long laisse la sélection du téléphone.
    let down: { x: number; y: number; at: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('.reader-bubble')) keepUntil = Date.now() + 600;
      down = e.pointerType === 'touch' && flowRef.current?.contains(e.target as Node) ? { x: e.clientX, y: e.clientY, at: Date.now() } : null;
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || Date.now() - d.at > 450) return;
      const s = window.getSelection();
      if (s && !s.isCollapsed && !tap.current) return;
      onTap(e.clientX, e.clientY);
    };
    const onCancel = () => {
      down = null;
    };
    document.addEventListener('selectionchange', onChange);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      setTapHighlight(null);
    };
  }, [flowRef, stageRef, blocks, language]);

  const clear = () => {
    tap.current = null;
    setTapHighlight(null);
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };
  return [sel, clear];
}

export interface SelectionTranslation {
  text: string | null;
  loading: boolean;
}

/** Traduction de la sélection (MyMemory), après une courte pause, mise en cache. */
export function useSelectionTranslation(sel: ReaderSelection | null, language: string, enabled: boolean, deeplKey: string): SelectionTranslation {
  const [state, setState] = useState<{ for: string; text: string | null; loading: boolean }>({ for: '', text: null, loading: false });
  const expression = sel && !sel.error && !sel.known ? sel.expression : '';
  // La phrase du livre sert de contexte (DeepL) : « at last turned sulky » → « a fini par bouder ».
  const context = sel?.sentence ?? '';
  useEffect(() => {
    if (!enabled || !expression) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setState({ for: expression, text: null, loading: true });
      translate(expression, language, 'fr', { signal: ctrl.signal, deeplKey, shared: sharedDeepl, context })
        .then((r) => !ctrl.signal.aborted && setState({ for: expression, text: r.text, loading: false }))
        .catch(() => !ctrl.signal.aborted && setState({ for: expression, text: null, loading: false }));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [expression, language, enabled, deeplKey, context]);
  return state.for === expression ? state : { text: null, loading: enabled && !!expression };
}

export function SelectionBubble({
  sel,
  universeId,
  translation,
  onAdd,
  onKnown,
}: {
  sel: ReaderSelection;
  universeId: string;
  translation: SelectionTranslation;
  onAdd: () => void;
  /** « Je connais » (un seul mot, absent de vos fiches) : ne compte plus parmi les mots à apprendre. */
  onKnown?: () => void;
}) {
  const singleWord = !sel.error && !sel.known && /^[\p{L}\p{M}'’-]+$/u.test(sel.expression.trim());
  return (
    <div
      className={`reader-bubble ${sel.below ? 'reader-bubble--below' : ''}`}
      style={{ left: sel.x, top: sel.y }}
      role="toolbar"
      aria-label="Expression sélectionnée"
      onMouseDown={(e) => e.preventDefault() /* garde la sélection */}
    >
      {sel.error ? (
        <span className="reader-bubble-text">{sel.error}</span>
      ) : (
        <>
          {sel.known && (
            <span className="reader-bubble-text" title="Déjà dans vos fiches">
              <strong>{sel.known.expression}</strong> : {sel.known.translation}
            </span>
          )}
          {!sel.known && (translation.loading || translation.text) && (
            <span className="reader-bubble-translation" title={translation.text ?? 'Traduction…'}>
              {translation.loading ? <Loader2 size={13} className="spin" /> : translation.text}
            </span>
          )}
          <button className="reader-bubble-btn reader-bubble-btn--primary" onClick={onAdd}>
            {sel.known ? <PenLine size={15} /> : <BookmarkPlus size={15} />}
            {sel.known ? 'Ajouter cet exemple' : `Ajouter « ${sel.expression.length > 28 ? `${sel.expression.slice(0, 27)}…` : sel.expression} »`}
            <Kbd>Entrée</Kbd>
          </button>
          {onKnown && singleWord && (
            <button className="reader-bubble-btn" onClick={onKnown} title="Je connais ce mot : il ne sera plus proposé parmi les mots à apprendre">
              <Check size={15} /> Je connais
            </button>
          )}
          {sel.tapped && singleWord && <span className="reader-bubble-hint">Touchez un autre mot de la phrase pour prendre toute l'expression.</span>}
          {speechSupported() && (
            <button className="reader-bubble-btn" onClick={() => void speakText(sel.expression, universeId)} title="Écouter (P)" aria-label="Écouter">
              <Volume2 size={15} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
