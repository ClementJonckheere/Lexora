import { useEffect, useState, type RefObject } from 'react';
import { translate } from '@/core/translate/translate';
import { sharedDeepl } from '@/core/translate/shared';
import { BookmarkPlus, Loader2, PenLine, Volume2 } from 'lucide-react';
import { useApp } from '@/app/store';
import { expressionKey } from '@/core/domain/text';
import type { Note } from '@/core/domain/types';
import type { Block } from '@/core/reading/gutenberg';
import { cleanSelection, sentenceAround, startsSentence } from '@/core/reading/selection';
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
}

const BUBBLE_H = 46;

/**
 * Suit la sélection de texte dans le livre : expression nettoyée, phrase qui la contient,
 * position de la bulle. Rien n'est envoyé à un service externe.
 */
export function useReaderSelection(
  flowRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>,
  blocks: Block[],
  language: string,
): [ReaderSelection | null, () => void] {
  const [sel, setSel] = useState<ReaderSelection | null>(null);

  useEffect(() => {
    const read = () => {
      const s = window.getSelection();
      const flow = flowRef.current;
      const stage = stageRef.current;
      if (!s || s.isCollapsed || !s.rangeCount || !flow || !stage) return setSel(null);
      const range = s.getRangeAt(0);
      if (!flow.contains(range.commonAncestorContainer)) return setSel(null);
      const startEl = (range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : (range.startContainer as Element))?.closest<HTMLElement>('[data-b]');
      const endEl = (range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : (range.endContainer as Element))?.closest<HTMLElement>('[data-b]');
      if (!startEl) return setSel(null);

      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left + rect.width / 2 - box.left, 150), box.width - 150);
      const below = rect.top - box.top < BUBBLE_H + 16;
      const y = below ? rect.bottom - box.top + 10 : rect.top - box.top - 10;

      if (startEl !== endEl) {
        return setSel({ expression: '', sentence: '', error: 'Sélectionnez un mot ou une expression dans un seul paragraphe.', x, y, below });
      }
      const block = blocks[Number(startEl.dataset.b)];
      if (!block) return setSel(null);
      // Le paragraphe est un seul nœud texte : les décalages de la sélection sont ceux du texte du livre.
      const startOffset = range.startContainer.nodeType === Node.TEXT_NODE ? range.startOffset : 0;
      const endOffset = range.endContainer.nodeType === Node.TEXT_NODE ? range.endOffset : block.text.length;
      const raw = block.text.slice(startOffset, endOffset);
      const lead = raw.length - raw.trimStart().length;
      const { expression, error } = cleanSelection(raw, language, startsSentence(block.text, startOffset + lead));
      const sentence = sentenceAround(block.text, startOffset, endOffset);
      const key = expression ? expressionKey(expression, language) : '';
      const known = key ? useApp.getState().notes.find((n) => n.expressionKey === key) : undefined;
      setSel({ expression, sentence, error, x, y, below, known });
    };
    let t: ReturnType<typeof setTimeout> | undefined;
    // Après le relâchement de la souris (ou Maj+flèches), pas à chaque caractère sélectionné.
    const onChange = () => {
      clearTimeout(t);
      t = setTimeout(read, 180);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(t);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [flowRef, stageRef, blocks, language]);

  const clear = () => {
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
}: {
  sel: ReaderSelection;
  universeId: string;
  translation: SelectionTranslation;
  onAdd: () => void;
}) {
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
              <strong>{sel.known.expression}</strong> — {sel.known.translation}
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
