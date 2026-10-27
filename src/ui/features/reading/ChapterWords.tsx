import { useState } from 'react';
import { BookmarkPlus, Check, Loader2 } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import type { UnknownWord } from '@/core/reading/coverage';
import { sentenceAround } from '@/core/reading/selection';
import { sharedDeepl } from '@/core/translate/shared';
import { translate } from '@/core/translate/translate';
import { Button, Modal } from '@/ui/components/ui';

/** Mots proposés avant un chapitre : les plus fréquents du chapitre parmi ceux que vous ne connaissez pas. */
export const CHAPTER_WORDS = 10;

/** Première phrase du chapitre qui contient le mot, sous l'une de ses formes (exemple de la fiche). */
export function exampleFor(w: UnknownWord, blocks: { text: string }[]): string {
  for (const form of [w.word, ...w.forms]) {
    const found = sentenceWith(form, blocks);
    if (found) return found;
  }
  return '';
}

function sentenceWith(word: string, blocks: { text: string }[]): string {
  const re = new RegExp(`(^|[^\\p{L}])(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}])`, 'iu');
  for (const b of blocks) {
    const m = re.exec(b.text);
    if (m) {
      const start = m.index + m[1].length;
      return sentenceAround(b.text, start, start + m[2].length);
    }
  }
  return '';
}

export function ChapterWords({
  words,
  coverage,
  blocks,
  language,
  source,
  onClose,
}: {
  words: UnknownWord[];
  coverage: number;
  blocks: { text: string }[];
  language: string;
  /** Mention de la source (livre, chapitre) pour la note des fiches. */
  source: string;
  onClose: () => void;
}) {
  const { markWords, openEditor, saveNote, toast, observe } = useApp.getState();
  // Chaque décision est aussi une réponse de test supplémentaire (recalage par la lecture).
  const decided = (w: UnknownWord, known: boolean) => void observe([{ source: 'chapter', word: w.word, rank: w.rank, known }]).catch(() => undefined);
  const deeplKey = useApp((s) => s.settings.deeplKey);
  const [done, setDone] = useState<Map<string, 'known' | 'added'>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  // Liste figée à l'ouverture : « Je connais » ne la réordonne pas sous vos yeux.
  const [list] = useState(() => words.slice(0, CHAPTER_WORDS));
  const pending = list.filter((w) => !done.has(w.word));
  const mark = (word: string, state: 'known' | 'added') => setDone((d) => new Map(d).set(word, state));

  const know = async (w: UnknownWord) => {
    await markWords([w.word], true);
    decided(w, true);
    mark(w.word, 'known');
  };

  const addOne = (w: UnknownWord) => {
    const word = w.word;
    openEditor(null, {
      expression: word,
      examples: [exampleFor(w, blocks)].filter(Boolean),
      comment: source,
    });
    decided(w, false);
    mark(word, 'added');
  };

  /** Toutes les fiches d'un coup : traduction proposée (avec la phrase du livre comme contexte), modifiable ensuite. */
  const addAll = async () => {
    setBusy('all');
    let added = 0;
    const failed: string[] = [];
    for (const w of pending) {
      const example = exampleFor(w, blocks);
      try {
        const t = await translate(w.word, language, 'fr', {
          deeplKey,
          shared: sharedDeepl,
          context: example || undefined,
        });
        if (!t.text) throw new Error('aucune traduction');
        await saveNote({
          expression: w.word,
          translation: t.text,
          examples: example ? [example] : [],
          comment: source,
        });
        decided(w, false);
        mark(w.word, 'added');
        added++;
      } catch (err) {
        failed.push(`${w.word} (${errorMessage(err)})`);
      }
    }
    setBusy(null);
    if (added)
      toast('success', `${added} mot${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} à vos fiches : traductions à vérifier dans la Bibliothèque.`);
    if (failed.length) toast('error', `Non ajoutés : ${failed.join(', ')}`);
  };

  return (
    <Modal
      title="Mots à connaître pour ce chapitre"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Fermer</Button>
          <Button variant="primary" onClick={() => void addAll()} disabled={!pending.length || busy !== null}>
            {busy === 'all' ? <Loader2 size={15} className="spin" /> : <BookmarkPlus size={15} />} Tout ajouter ({pending.length})
          </Button>
        </>
      }
    >
      <div className="modal-body stack">
        <p className="muted small" style={{ margin: 0 }}>
          Vous connaissez environ {Math.round(coverage * 100)} % des mots de ce chapitre. Voici les {list.length} mots qui reviennent le plus parmi ceux que
          vous ne connaissez sans doute pas : les apprendre avant de lire rend la lecture plus fluide. « Je connais » affine aussi votre profil.
        </p>
        {!list.length && <p>Aucun mot inconnu repéré : bonne lecture !</p>}
        <ul className="chapter-words">
          {list.map((w) => {
            const state = done.get(w.word);
            return (
              <li key={w.word} className={state ? 'chapter-word chapter-word--done' : 'chapter-word'}>
                <span className="chapter-word-text" lang={language}>
                  {w.word}
                </span>
                <span className="muted small">
                  {w.count} fois
                  {w.rank ? ` · ${w.rank.toLocaleString('fr-FR')}ᵉ mot le plus courant` : ' · rare'}
                </span>
                <span className="row" style={{ marginLeft: 'auto', gap: 6 }}>
                  {state ? (
                    <span className="chip">
                      <Check size={12} /> {state === 'known' ? 'Connu' : 'Ajouté'}
                    </span>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => void know(w)} disabled={busy !== null}>
                        Je connais
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => addOne(w)} disabled={busy !== null}>
                        Ajouter
                      </Button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
