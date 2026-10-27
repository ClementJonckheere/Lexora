import type { ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import { useApp } from '@/app/store';
import type { Direction, Note } from '@/core/domain/types';
import { speechSupported } from '@/core/platform/speech';
import { speakNote } from '@/ui/speech';
import { Button } from '@/ui/components/ui';
import { Example } from '@/ui/components/Example';
import type { ClozeFront } from '@/core/srs/typed';

export { speakNote };

/** Fiche de mémorisation : question (recto) puis réponse (verso). */
export function Flashcard({
  note,
  direction,
  revealed,
  meta,
  front,
  children,
}: {
  note: Note;
  direction: Direction;
  revealed: boolean;
  meta: ReactNode;
  /** Français → langue : phrase d'exemple à trous au recto (la traduction devient l'indice). */
  front?: ClozeFront | null;
  /** Affiché entre la question et la réponse (saisie de la réponse). */
  children?: ReactNode;
}) {
  const frToEn = direction === 'fr_en';
  const context = frToEn ? front ?? null : null;
  const inContext = context !== null;
  const language = useApp((s) => s.universes.find((u) => u.id === note.universeId)?.language ?? 'en');
  const canSpeak = speechSupported();
  // La phrase du recto est déjà affichée, complétée.
  const otherExamples = inContext ? note.examples.filter((ex) => ex !== context?.sentence) : note.examples;
  const speakBtn = canSpeak && (
    <Button variant="ghost" icon size="sm" title="Écouter (P)" onClick={() => speakNote(note)}>
      <Volume2 size={18} />
    </Button>
  );

  return (
    <div className="card flashcard" key={`${note.id}-${direction}`}>
      <div className="flashcard-meta">{meta}</div>
      {context ? (
        <>
          <p className="cloze-sentence flashcard-cloze" lang={language}>
            {context.cloze.parts.map((p, i) =>
              p.blank ? (
                <span key={i} className={`cloze-blank ${revealed ? 'cloze-blank--revealed' : ''}`}>
                  {revealed ? p.text : '\u00a0'.repeat(Math.max(6, p.text.length))}
                </span>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
          <div className="flashcard-hint" lang="fr">
            {note.translation}
          </div>
        </>
      ) : (
        <div className="flashcard-prompt" lang={frToEn ? 'fr' : language}>
          {frToEn ? note.translation : note.expression}
          {!frToEn && <span style={{ marginLeft: 6, verticalAlign: 'middle' }}>{speakBtn}</span>}
        </div>
      )}
      {children}
      {revealed && (
        <div className="flashcard-answer">
          <div className="flashcard-answer-main" lang={frToEn ? language : 'fr'}>
            {frToEn ? note.expression : note.translation}
            {frToEn && speakBtn}
          </div>
          {note.pronunciation && <div className="muted" style={{ marginTop: 6 }}>{note.pronunciation}</div>}
          {otherExamples.length > 0 && (
            <div className="flashcard-examples">
              {otherExamples.map((ex, i) => (
                <Example key={i} sentence={ex} expression={note.expression} language={language} />
              ))}
            </div>
          )}
          {note.comment && <p className="flashcard-comment">{note.comment}</p>}
        </div>
      )}
    </div>
  );
}
