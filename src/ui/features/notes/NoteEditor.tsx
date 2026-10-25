import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Star, Trash2, Volume2, X } from 'lucide-react';
import { attempt, useApp } from '@/app/store';
import { categorize, AUTO_CATEGORIES } from '@/core/domain/categorize';
import { findDuplicates } from '@/core/repo/notesRepo';
import type { NoteInput } from '@/core/domain/types';
import { ValidationError, type FieldErrors } from '@/core/domain/validation';
import { languageInfo } from '@/core/domain/languages';
import { speakText } from '@/ui/speech';
import { Button, Field, Kbd, Modal } from '@/ui/components/ui';
import { TagInput } from '@/ui/components/TagInput';
import { confirm } from '@/ui/components/Confirm';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { readPref, writePref } from '@/ui/prefs';

interface Draft {
  expression: string;
  translation: string;
  pronunciation: string;
  examples: string[];
  comment: string;
  category: string;
  tags: string[];
  collectionIds: string[];
  isFavorite: boolean;
}

const EMPTY: Draft = { expression: '', translation: '', pronunciation: '', examples: [''], comment: '', category: '', tags: [], collectionIds: [], isFavorite: false };

export function NoteEditor() {
  const editor = useApp((s) => s.editor);
  if (!editor) return null;
  // `key` : réinitialise complètement le formulaire à chaque ouverture.
  return <NoteEditorDialog key={`${editor.noteId ?? 'new'}-${JSON.stringify(editor.prefill ?? {})}`} />;
}

function NoteEditorDialog() {
  const editor = useApp((s) => s.editor)!;
  const notes = useApp((s) => s.allNotes);
  const notesById = useApp((s) => s.notesById);
  const collections = useApp((s) => s.collections);
  const universes = useApp((s) => s.universes);
  const current = useApp((s) => s.universe);
  const { closeEditor, openEditor, saveNote, deleteNotes, toast } = useApp.getState();

  const existing = editor.noteId ? notesById.get(editor.noteId) : undefined;
  const isEdit = !!existing;
  const universe = universes.find((u) => u.id === existing?.universeId) ?? current;
  const language = universe?.language ?? 'en';
  const lang = languageInfo(language);
  // Doublons et suggestions : uniquement dans l'univers de la note.
  const universeNotes = notes.filter((n) => n.universeId === universe?.id);
  const universeCollections = collections.filter((c) => c.universeId === universe?.id);

  const initial: Draft = existing
    ? {
        expression: existing.expression,
        translation: existing.translation,
        pronunciation: existing.pronunciation,
        examples: existing.examples.length ? existing.examples : [''],
        comment: existing.comment,
        category: existing.categoryAuto ? '' : existing.category,
        tags: existing.tags,
        collectionIds: existing.collectionIds,
        isFavorite: existing.isFavorite,
      }
    : {
        ...EMPTY,
        ...editor.prefill,
        examples: editor.prefill?.examples?.length ? editor.prefill.examples : [''],
      } as Draft;

  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [dupAck, setDupAck] = useState(false);
  const [more, setMore] = useState<boolean>(() => readPref('editor.more', false) || (isEdit && hasExtras(initial)));
  const [keepOpen, setKeepOpen] = useState<boolean>(() => readPref('editor.keepOpen', false));
  const exprRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => exprRef.current?.focus(), 0);
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k === 'expression') setDupAck(false);
    if (errors[k as keyof FieldErrors]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const duplicates = useMemo(
    () => findDuplicates(universeNotes, draft.expression, language, existing?.id),
    [universeNotes, draft.expression, language, existing?.id],
  );
  const autoCategory = useMemo(() => categorize(draft.expression, language), [draft.expression, language]);
  const allTags = useMemo(() => [...new Set(universeNotes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b)), [universeNotes]);
  const allCategories = useMemo(
    () => [...new Set([...AUTO_CATEGORIES, ...universeNotes.map((n) => n.category).filter(Boolean)])].sort((a, b) => a.localeCompare(b)),
    [universeNotes],
  );
  const showPronunciation = !!lang.transcription || !!draft.pronunciation;

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const requestClose = async () => {
    if (dirty && (draft.expression.trim() || draft.translation.trim())) {
      const ok = await confirm({ title: 'Abandonner les modifications ?', confirmLabel: 'Abandonner', danger: true });
      if (!ok) return;
    }
    closeEditor();
  };

  const submit = async () => {
    if (saving) return;
    if (duplicates.length && !dupAck) {
      setDupAck(true);
      return;
    }
    const input: NoteInput = { ...draft, examples: draft.examples };
    setSaving(true);
    try {
      await saveNote(input, existing?.id);
      if (!isEdit && keepOpen) {
        toast('success', `« ${draft.expression.trim()} » ajouté`);
        setDraft({ ...EMPTY, tags: draft.tags, collectionIds: draft.collectionIds, category: draft.category });
        setErrors({});
        setDupAck(false);
        exprRef.current?.focus();
      } else {
        toast('success', isEdit ? 'Note mise à jour' : `« ${draft.expression.trim()} » ajouté à la bibliothèque`);
        closeEditor();
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.fields);
        if (err.fields.expression) exprRef.current?.focus();
      } else toast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: 'Supprimer cette note ?',
      message: `« ${existing.expression} » et son historique de révision seront définitivement supprimés.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    await attempt(() => deleteNotes([existing.id]), 'Note supprimée');
    closeEditor();
  };

  useHotkeys({ 'mod+enter': () => void submit(), 'mod+s': () => void submit() }, { allowInInputs: true });

  const setExample = (i: number, v: string) => set('examples', draft.examples.map((e, k) => (k === i ? v : e)));
  const addExample = () => {
    set('examples', [...draft.examples, '']);
    setTimeout(() => document.getElementById(`ex-${draft.examples.length}`)?.focus(), 0);
  };
  const removeExample = (i: number) => set('examples', draft.examples.length > 1 ? draft.examples.filter((_, k) => k !== i) : ['']);

  const toggleMore = () => {
    setMore(!more);
    writePref('editor.more', !more);
  };

  return (
    <Modal
      title={isEdit ? 'Modifier la note' : 'Nouvelle expression'}
      labelledBy="editor-title"
      onClose={requestClose}
      footer={
        <>
          {isEdit ? (
            <Button variant="danger-ghost" size="sm" onClick={remove}>
              <Trash2 size={15} /> Supprimer
            </Button>
          ) : (
            <label className="checkbox small text-2" title="Le formulaire reste ouvert pour enchaîner les ajouts">
              <input
                type="checkbox"
                checked={keepOpen}
                onChange={(e) => {
                  setKeepOpen(e.target.checked);
                  writePref('editor.keepOpen', e.target.checked);
                }}
              />
              Ajout en série
            </label>
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={requestClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving} shortcut="Ctrl ↵">
            {duplicates.length && dupAck ? 'Enregistrer quand même' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <form
        className="modal-body stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={`Expression (${universe?.name ?? lang.name})`} error={errors.expression} htmlFor="f-expression">
          <div className="row">
            <input
              id="f-expression"
              ref={exprRef}
              className={`input input--lg ${errors.expression ? 'input--invalid' : ''}`}
              placeholder={lang.placeholder.expression}
              value={draft.expression}
              autoComplete="off"
              spellCheck
              lang={language}
              onChange={(e) => set('expression', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                  e.preventDefault();
                  document.getElementById(showPronunciation ? 'f-pronunciation' : 'f-translation')?.focus();
                }
              }}
            />
            <Button
              variant="ghost"
              icon
              title="Écouter la prononciation"
              disabled={!draft.expression.trim()}
              onClick={() => speakText(draft.expression, universe?.id)}
            >
              <Volume2 size={17} />
            </Button>
          </div>
        </Field>

        {duplicates.length > 0 && (
          <div className="notice" role="status">
            <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              Déjà dans la bibliothèque : <strong>{duplicates[0].expression}</strong> — {duplicates[0].translation}
              {dupAck && <div className="small">Appuyez à nouveau sur Enregistrer pour créer un doublon.</div>}
            </div>
            <button type="button" className="link" onClick={() => openEditor(duplicates[0].id)}>
              Ouvrir
            </button>
          </div>
        )}

        {showPronunciation && (
          <Field label={lang.transcription ?? 'Prononciation'} optional error={errors.pronunciation} htmlFor="f-pronunciation">
            <input
              id="f-pronunciation"
              className="input"
              value={draft.pronunciation}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => set('pronunciation', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey) {
                  e.preventDefault();
                  document.getElementById('f-translation')?.focus();
                }
              }}
            />
          </Field>
        )}

        <Field label="Traduction française" error={errors.translation} htmlFor="f-translation">
          <input
            id="f-translation"
            className={`input ${errors.translation ? 'input--invalid' : ''}`}
            placeholder={lang.placeholder.translation}
            value={draft.translation}
            autoComplete="off"
            lang="fr"
            onChange={(e) => set('translation', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                document.getElementById('ex-0')?.focus();
              }
            }}
          />
        </Field>

        <Field label={draft.examples.length > 1 ? 'Exemples' : 'Exemple'} optional error={errors.examples}>
          <div className="stack stack--sm">
            {draft.examples.map((ex, i) => (
              <div className="row" key={i}>
                <input
                  id={`ex-${i}`}
                  className="input"
                  placeholder={i === 0 ? lang.placeholder.example : 'Autre exemple…'}
                  value={ex}
                  lang={language}
                  autoComplete="off"
                  onChange={(e) => setExample(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.ctrlKey) {
                      e.preventDefault();
                      if (ex.trim()) addExample();
                    }
                  }}
                />
                {(draft.examples.length > 1 || ex) && (
                  <Button variant="ghost" icon size="sm" aria-label="Retirer l'exemple" onClick={() => removeExample(i)}>
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            <div>
              <button type="button" className="link small" onClick={addExample}>
                <Plus size={13} style={{ verticalAlign: -2 }} /> Ajouter un exemple
              </button>
            </div>
          </div>
        </Field>

        <button type="button" className="link small" style={{ alignSelf: 'flex-start', color: 'var(--text-2)' }} onClick={toggleMore}>
          {more ? <ChevronDown size={14} style={{ verticalAlign: -3 }} /> : <ChevronRight size={14} style={{ verticalAlign: -3 }} />} Tags,
          collections, catégorie, note{showPronunciation ? '' : ', prononciation'}
        </button>

        {more && (
          <div className="stack">
            {!showPronunciation && (
              <Field label="Prononciation" optional hint="Transcription phonétique, pinyin, accent tonique…">
                <input className="input" value={draft.pronunciation} onChange={(e) => set('pronunciation', e.target.value)} />
              </Field>
            )}
            <div className="grid-2">
              <Field label="Catégorie" optional hint={!draft.category && autoCategory ? `Auto : ${autoCategory}` : undefined}>
                <input
                  className="input"
                  list="categories"
                  placeholder={autoCategory ? `Auto : ${autoCategory}` : 'Automatique'}
                  value={draft.category}
                  onChange={(e) => set('category', e.target.value)}
                />
                <datalist id="categories">
                  {allCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Tags" optional error={errors.tags}>
                <TagInput value={draft.tags} onChange={(t) => set('tags', t)} suggestions={allTags} />
              </Field>
            </div>
            {universeCollections.length > 0 && (
              <Field label="Collections" optional>
                <div className="row row--wrap">
                  {universeCollections.map((c) => {
                    const on = draft.collectionIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`chip chip--clickable ${on ? 'chip--selected' : ''}`}
                        aria-pressed={on}
                        onClick={() => set('collectionIds', on ? draft.collectionIds.filter((x) => x !== c.id) : [...draft.collectionIds, c.id])}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            <Field label="Note libre" optional error={errors.comment}>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Contexte, source (film, réunion…), nuance d'usage…"
                value={draft.comment}
                onChange={(e) => set('comment', e.target.value)}
              />
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={draft.isFavorite} onChange={(e) => set('isFavorite', e.target.checked)} />
              <Star size={14} color={draft.isFavorite ? '#f59e0b' : 'currentColor'} /> Favori
            </label>
          </div>
        )}
        <p className="muted small">
          <Kbd>Entrée</Kbd> champ suivant · <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd> enregistrer · <Kbd>Échap</Kbd> fermer
        </p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function hasExtras(d: Draft) {
  return !!(d.comment || d.category || d.tags.length || d.collectionIds.length || d.isFavorite);
}
