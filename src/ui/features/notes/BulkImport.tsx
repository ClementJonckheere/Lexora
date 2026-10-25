import { useMemo, useRef, useState, useEffect } from 'react';
import { FileUp } from 'lucide-react';
import { useApp, errorMessage } from '@/app/store';
import { describeReport, importCandidates, importFromFile } from '@/app/dataActions';
import { parseBulk } from '@/core/domain/bulkParse';
import { expressionKey } from '@/core/domain/text';
import { languageInfo } from '@/core/domain/languages';
import { Button, Field, Modal } from '@/ui/components/ui';
import { TagInput } from '@/ui/components/TagInput';
import { useHotkeys } from '@/ui/hooks/useHotkeys';


/** Import rapide par collage de plusieurs lignes. */
export function BulkImport() {
  const open = useApp((s) => s.bulkOpen);
  if (!open) return null;
  return <BulkImportDialog />;
}

function BulkImportDialog() {
  const notes = useApp((s) => s.notes);
  const collections = useApp((s) => s.collections);
  const universe = useApp((s) => s.universe);
  const language = universe?.language ?? 'en';
  const ph = languageInfo(language).placeholder;
  const placeholder = `${ph.expression} ; ${ph.translation} ; ${ph.example}\n${ph.expression} = ${ph.translation}`;
  const { setBulkOpen, toast } = useApp.getState();
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes]);
  const existingKeys = useMemo(() => new Set(notes.map((n) => n.expressionKey)), [notes]);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    return parseBulk(text).map((l) => {
      const key = expressionKey(l.expression, language);
      const duplicate = !l.error && (existingKeys.has(key) || seen.has(key));
      seen.add(key);
      return { ...l, duplicate };
    });
  }, [text, existingKeys, language]);
  const valid = rows.filter((r) => !r.error && !r.duplicate);

  const submit = async () => {
    if (!valid.length || busy) return;
    setBusy(true);
    try {
      const report = await importCandidates(
        valid.map((r) => ({
          expression: r.expression,
          translation: r.translation,
          examples: r.examples,
          tags,
          collectionIds: collectionId ? [collectionId] : [],
        })),
      );
      toast('success', describeReport(report));
      setBulkOpen(false);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  useHotkeys({ 'mod+enter': () => void submit() }, { allowInInputs: true });

  return (
    <Modal
      title={`Coller plusieurs expressions${universe ? ` · ${universe.name}` : ''}`}
      size="wide"
      onClose={() => setBulkOpen(false)}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBulkOpen(false);
              void importFromFile();
            }}
          >
            <FileUp size={15} /> Importer un fichier CSV / JSON
          </Button>
          <span className="spacer" />
          <Button variant="ghost" onClick={() => setBulkOpen(false)}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid.length || busy} shortcut="Ctrl ↵">
            Importer {valid.length || ''}
          </Button>
        </>
      }
    >
      <div className="modal-body stack">
        <Field
          label="Une expression par ligne"
          hint="Format : expression ; traduction ; exemple (facultatif). Séparateurs acceptés : ; | = – - : ou tabulation (copier-coller depuis Excel)."
        >
          <textarea
            ref={ref}
            className="textarea"
            rows={7}
            placeholder={placeholder}
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        {rows.length > 0 && (
          <div className="bulk-preview">
            <table>
              <thead>
                <tr>
                  <th>{universe?.name ?? 'Expression'}</th>
                  <th>Français</th>
                  <th>Exemple</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.expression}</td>
                    <td>{r.translation}</td>
                    <td className="muted">{r.examples.join(' · ')}</td>
                    <td className={r.error ? 'status-err' : r.duplicate ? 'status-warn' : 'status-ok'}>
                      {r.error ?? (r.duplicate ? 'Doublon — ignoré' : 'OK')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid-2">
          <Field label="Tags appliqués à toutes les lignes" optional>
            <TagInput value={tags} onChange={setTags} suggestions={allTags} />
          </Field>
          <Field label="Ajouter à une collection" optional>
            <select className="select" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              <option value="">Aucune</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
