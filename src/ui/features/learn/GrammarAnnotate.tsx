import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Download, Loader2, SkipForward, X } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { collectCandidates, exportAnnotations, HIGHLIGHT_PRECISION, precisionOf, TARGET_ANNOTATIONS, type Annotations } from '@/core/learn/annotation';
import { hasPattern } from '@/core/learn/patterns';
import { saveTextFile } from '@/core/platform/files';
import { downloadBook } from '@/core/reading/catalog';
import * as booksRepo from '@/core/repo/booksRepo';
import { Button, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { readPref, writePref } from '@/ui/prefs';

/**
 * Mesure du repérage de la grammaire anglaise : pour chaque point, vous jugez une cinquantaine de passages
 * surlignés dans de vrais livres. Les jugements restent sur cet appareil ; « Exporter » produit le fichier qui met à
 * jour la précision dans le dépôt (scripts/grammar-precision.mjs).
 */

interface GrammarPoint {
  id: string;
  level: string;
  title: string;
  example: string;
}

const PREF = 'grammar.annotations.en';
/** Livres de référence, téléchargés à la demande s'ils ne sont pas dans « Mes livres ». */
const REFERENCE_BOOKS = [
  { id: 11, title: "Alice's Adventures in Wonderland" },
  { id: 1342, title: 'Pride and Prejudice' },
];

export function GrammarAnnotatePage() {
  const db = useApp((s) => s.db)!;
  const books = useApp((s) => s.books);
  const { navigate, toast } = useApp.getState();
  const [points, setPoints] = useState<GrammarPoint[]>([]);
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [annotations, setAnnotations] = useState<Annotations>(() => readPref<Annotations>(PREF, {}));
  const [pointId, setPointId] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/grammar/en/points.json')
      .then((r) => r.json())
      .then((d: { points: GrammarPoint[] }) => setPoints(d.points.filter((p) => hasPattern(p.id))))
      .catch((err) => toast('error', errorMessage(err)));
  }, [toast]);

  // Textes : vos livres anglais téléchargés sur cet appareil.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const texts: string[] = [];
      const names: string[] = [];
      for (const b of books.filter((x) => x.language === 'en')) {
        const parsed = await booksRepo.loadBookText(db, b.key);
        if (!parsed) continue;
        names.push(b.title);
        for (const c of parsed.chapters) for (const block of c.blocks) texts.push(block.text);
      }
      if (alive) {
        setParagraphs(texts);
        setSources(names);
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, books]);

  const addReferenceBooks = async () => {
    setDownloading(true);
    try {
      const texts: string[] = [];
      for (const ref of REFERENCE_BOOKS) {
        if (sources.includes(ref.title)) continue;
        const parsed = await downloadBook({ textUrl: `https://www.gutenberg.org/ebooks/${ref.id}.txt.utf-8` });
        for (const c of parsed.chapters) for (const block of c.blocks) texts.push(block.text);
        setSources((s) => [...s, ref.title]);
      }
      setParagraphs((p) => [...(p ?? []), ...texts]);
    } catch (err) {
      toast('error', `Téléchargement impossible : ${errorMessage(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const save = (next: Annotations) => {
    setAnnotations(next);
    writePref(PREF, next);
  };

  const exportFile = async () => {
    try {
      const path = await saveTextFile(`lexora-reperage-grammaire-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportAnnotations(annotations, 'en'), null, 1), [
        { name: 'JSON', extensions: ['json'] },
      ]);
      if (path) toast('success', 'Jugements exportés');
    } catch (err) {
      toast('error', errorMessage(err));
    }
  };

  const point = points.find((p) => p.id === pointId) ?? null;
  const judged = Object.values(annotations).reduce((n, v) => n + Object.keys(v).length, 0);

  return (
    <div className="page page--wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Repérage de la grammaire</h1>
          <p className="page-subtitle">
            Pour chaque point, jugez si le passage surligné est bien un exemple du point. À partir de {TARGET_ANNOTATIONS} jugements et{' '}
            {Math.round(HIGHLIGHT_PRECISION * 100)} % de justes, le point pourra être surligné dans vos livres ; en dessous, son motif servira seulement à trouver
            des phrases d'exercice.
          </p>
        </div>
        <div className="row">
          <Button onClick={() => void exportFile()} disabled={!judged}>
            <Download size={15} /> Exporter ({judged})
          </Button>
          <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
            Retour
          </Button>
        </div>
      </div>

      <div className="card card-pad stack stack--sm" style={{ marginBottom: 16 }}>
        <span className="small">
          <BookOpen size={14} /> Textes :{' '}
          {paragraphs === null ? 'lecture de vos livres…' : sources.length ? sources.join(', ') : 'aucun livre anglais téléchargé sur cet appareil'}
          {paragraphs !== null && ` · ${paragraphs.length.toLocaleString('fr-FR')} paragraphes`}
        </span>
        {REFERENCE_BOOKS.some((r) => !sources.includes(r.title)) && (
          <div>
            <Button size="sm" onClick={() => void addReferenceBooks()} disabled={downloading}>
              {downloading ? <Loader2 size={14} className="spin" /> : null} Ajouter Alice et Pride and Prejudice
            </Button>
          </div>
        )}
      </div>

      {point && paragraphs ? (
        <Annotator point={point} paragraphs={paragraphs} annotations={annotations} onChange={save} onBack={() => setPointId(null)} />
      ) : (
        <div className="annotate-grid">
          {points.map((p) => {
            const est = precisionOf(annotations[p.id]);
            return (
              <button key={p.id} className="annotate-point" onClick={() => setPointId(p.id)} disabled={!paragraphs?.length}>
                <span className="muted small">{p.level}</span>
                <strong>{p.title}</strong>
                <span className="small">
                  {est.n}/{TARGET_ANNOTATIONS}
                  {est.precision !== null && ` · ${Math.round(est.precision * 100)} % justes`}
                  {est.enough && (est.highlight ? ' · surligné' : ' · exercices seulement')}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Annotator({
  point,
  paragraphs,
  annotations,
  onChange,
  onBack,
}: {
  point: GrammarPoint;
  paragraphs: string[];
  annotations: Annotations;
  onChange: (a: Annotations) => void;
  onBack: () => void;
}) {
  const candidates = useMemo(() => collectCandidates(point.id, paragraphs), [point.id, paragraphs]);
  const done = annotations[point.id] ?? {};
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const current = candidates.find((c) => !done[c.key] && !skipped.has(c.key));
  const est = precisionOf(done);

  const judge = (ok: boolean) => {
    if (!current) return;
    onChange({ ...annotations, [point.id]: { ...done, [current.key]: { v: ok ? 1 : 0, s: current.sentence, m: [current.start, current.end] } } });
  };
  const skip = () => current && setSkipped((s) => new Set(s).add(current.key));

  useHotkeys({ arrowright: () => judge(true), j: () => judge(true), arrowleft: () => judge(false), f: () => judge(false), space: skip, escape: onBack });

  return (
    <div className="card card-pad annotator">
      <div className="row row--between">
        <div className="stack stack--sm">
          <strong>
            {point.level} · {point.title}
          </strong>
          <span className="muted small">Exemple : {point.example}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Tous les points
        </Button>
      </div>
      <p className="muted small">
        {est.n} / {TARGET_ANNOTATIONS} jugés
        {est.precision !== null && ` · ${Math.round(est.precision * 100)} % justes (au moins ${Math.round((est.lower ?? 0) * 100)} % avec 95 % de confiance)`} ·{' '}
        {candidates.length} passages trouvés
      </p>
      {current && est.n < TARGET_ANNOTATIONS ? (
        <>
          <p className="annotate-sentence" lang="en">
            {current.sentence.slice(0, current.start)}
            <mark>{current.sentence.slice(current.start, current.end)}</mark>
            {current.sentence.slice(current.end)}
          </p>
          <p className="muted small">Le passage surligné est-il un exemple de « {point.title} » ?</p>
          <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
            <Button onClick={() => judge(false)}>
              <X size={16} /> Faux positif <Kbd>←</Kbd>
            </Button>
            <Button onClick={skip}>
              <SkipForward size={16} /> Je ne sais pas <Kbd>Espace</Kbd>
            </Button>
            <Button variant="primary" onClick={() => judge(true)}>
              <Check size={16} /> Juste <Kbd>→</Kbd>
            </Button>
          </div>
        </>
      ) : (
        <p>
          {est.n >= TARGET_ANNOTATIONS
            ? `Mesure terminée : ${Math.round((est.precision ?? 0) * 100)} % de passages justes${est.highlight ? ', le point pourra être surligné.' : ' : le motif servira seulement aux exercices.'}`
            : `Plus de passages à juger dans ces livres (${est.n} jugés). Ajoutez des livres pour continuer.`}
        </p>
      )}
    </div>
  );
}
