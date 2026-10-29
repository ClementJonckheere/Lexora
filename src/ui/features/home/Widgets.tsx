import { useState } from 'react';
import { BookOpen, Check, X } from 'lucide-react';
import { useApp } from '@/app/store';
import type { DailyProgress } from '@/core/repo/progressRepo';
import { readPref, writePref } from '@/ui/prefs';
import { Button } from '@/ui/components/ui';
import { BookCover } from '@/ui/features/reading/BookCover';

/** Dernier livre ouvert dans la langue : reprise directe à la bonne page. */
export function ResumeReading() {
  const universeId = useApp((s) => s.universe?.id);
  const books = useApp((s) => s.books);
  const covers = useApp((s) => s.bookCovers);
  const { navigate } = useApp.getState();
  const book = books.filter((b) => b.universeId === universeId && b.lastReadAt).sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))[0];
  if (!book) return null;
  const pct = Math.round(book.progress * 100);
  return (
    <section className="card resume">
      <div className="resume-cover">
        <BookCover src={covers.get(book.key) ?? book.coverUrl} title={book.title} author={book.authors[0]} />
      </div>
      <div className="stack stack--sm" style={{ flex: 1, minWidth: 0 }}>
        <span className="muted small">Votre lecture en cours</span>
        <strong className="resume-title">{book.title}</strong>
        <span className="muted small">{book.authors.join(', ')}</span>
        <div className="book-progress" style={{ maxWidth: 260 }} aria-label={`${pct} % lu`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="muted small">{pct} % lu</span>
      </div>
      <Button variant="primary" onClick={() => navigate({ name: 'reader', bookKey: book.key })}>
        <BookOpen size={16} /> Reprendre la lecture
      </Button>
    </section>
  );
}

/** Premiers pas : trois étapes, masquables, qui disparaissent une fois faites. */
export function GettingStarted({ progress }: { progress: DailyProgress }) {
  const notes = useApp((s) => s.allNotes.length);
  const books = useApp((s) => s.books.length);
  const { openEditor, navigate } = useApp.getState();
  const [hidden, setHidden] = useState(() => readPref<boolean>('home.gettingStarted.hidden', false));
  const steps = [
    { done: notes >= 5, label: 'Ajouter 5 mots ou expressions', hint: `${Math.min(notes, 5)} / 5`, action: () => openEditor(), cta: 'Ajouter' },
    {
      done: progress.totalReviews > 0,
      label: 'Faire une première révision',
      hint: 'Montrez la réponse, puis notez-vous : Oublié · Difficile · Retenu · Facile',
      action: () => navigate({ name: 'review' }),
      cta: 'Réviser',
    },
    { done: books > 0, label: 'Ouvrir un livre à votre niveau', hint: "Double-cliquez sur un mot pour l'enregistrer", action: () => navigate({ name: 'reading' }), cta: 'Lecture' },
  ];
  if (hidden || steps.every((s) => s.done)) return null;
  const hide = () => {
    setHidden(true);
    writePref('home.gettingStarted.hidden', true);
  };
  return (
    <section className="card card-pad getting-started">
      <div className="row row--between">
        <h2 className="card-title">Premiers pas</h2>
        <Button variant="ghost" icon size="sm" title="Masquer" onClick={hide}>
          <X size={15} />
        </Button>
      </div>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? 'step step--done' : 'step'}>
            <span className="step-dot">{s.done ? <Check size={13} /> : i + 1}</span>
            <span className="step-body">
              <strong>{s.label}</strong>
              <span className="muted small">{s.hint}</span>
            </span>
            {!s.done && (
              <Button size="sm" onClick={s.action}>
                {s.cta}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
