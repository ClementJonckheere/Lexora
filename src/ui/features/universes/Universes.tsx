import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { attempt, errorMessage, useApp } from '@/app/store';
import { LANGUAGES, languageBadge, languageInfo } from '@/core/domain/languages';
import { countDue } from '@/core/srs/queue';
import type { Universe } from '@/core/domain/types';
import { Button, Field, Modal } from '@/ui/components/ui';
import { confirm } from '@/ui/components/Confirm';

export function LanguageBadge({ language, size = 22 }: { language: string; size?: number }) {
  return (
    <span className="lang-badge" style={{ background: languageInfo(language).color, width: size, height: size, fontSize: size * 0.42 }}>
      {languageBadge(language)}
    </span>
  );
}

/** Nombre de fiches à réviser par univers (pastilles du sélecteur). */
function useDuePerUniverse() {
  const allNotes = useApp((s) => s.allNotes);
  const universes = useApp((s) => s.universes);
  const settings = useApp((s) => s.settings);
  const scheduler = useApp((s) => s.scheduler);
  const current = useApp((s) => s.universe?.id);
  const newIntroducedToday = useApp((s) => s.newIntroducedToday);
  return useMemo(() => {
    const now = Date.now();
    return new Map(
      universes.map((u) => [
        u.id,
        countDue(
          allNotes.filter((n) => n.universeId === u.id),
          // Le compteur de nouveaux mots du jour n'est connu que pour l'univers courant.
          { now, settings, scheduler, newIntroducedToday: u.id === current ? newIntroducedToday : 0 },
        ).total,
      ]),
    );
  }, [allNotes, universes, settings, scheduler, current, newIntroducedToday]);
}

/** Sélecteur d'univers (haut de la barre latérale). */
export function UniverseSwitcher() {
  const universes = useApp((s) => s.universes);
  const current = useApp((s) => s.universe);
  const { setUniverse, setUniversesOpen } = useApp.getState();
  const [open, setOpen] = useState(false);
  const due = useDuePerUniverse();
  if (!current) return null;

  return (
    <div className="universe-switcher">
      <button className="universe-current" onClick={() => setOpen(!open)} aria-expanded={open} title="Changer d'univers (Ctrl+U)">
        <LanguageBadge language={current.language} />
        <span className="label universe-name">{current.name}</span>
        <ChevronsUpDown size={14} className="label muted" />
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="popover" role="menu">
            {universes.map((u, i) => (
              <button
                key={u.id}
                role="menuitem"
                className="popover-item"
                onClick={() => {
                  setOpen(false);
                  void setUniverse(u.id);
                }}
              >
                <LanguageBadge language={u.language} size={20} />
                <span style={{ flex: 1 }}>{u.name}</span>
                {(due.get(u.id) ?? 0) > 0 && <span className="nav-count">{due.get(u.id)}</span>}
                {u.id === current.id ? <Check size={14} /> : i < 9 ? <span className="kbd">Alt {i + 1}</span> : null}
              </button>
            ))}
            <hr className="divider" />
            <button
              className="popover-item"
              onClick={() => {
                setOpen(false);
                setUniversesOpen(true);
              }}
            >
              <Settings2 size={15} /> <span>Gérer les univers…</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Choix d'une langue (préréglages) ou langue personnalisée. */
function UniverseForm({ onDone, autoFocus }: { onDone?: (id: string) => void; autoFocus?: boolean }) {
  const universes = useApp((s) => s.universes);
  const { createUniverse, toast } = useApp.getState();
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const taken = new Set(universes.map((u) => u.language));

  const create = async (n: string, c: string) => {
    try {
      const id = await createUniverse(n, c);
      toast('success', `Univers « ${n} » créé`);
      onDone?.(id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="stack">
      <div className="language-grid">
        {LANGUAGES.map((l) => (
          <button key={l.code} className="language-option" disabled={taken.has(l.code)} onClick={() => void create(l.name, l.code)} autoFocus={autoFocus && l.code === 'en'}>
            <LanguageBadge language={l.code} size={26} />
            <span>{l.name}</span>
            {taken.has(l.code) && <Check size={14} className="muted" />}
          </button>
        ))}
        <button className="language-option" onClick={() => setCustom(!custom)}>
          <span className="lang-badge" style={{ background: 'var(--border-strong)', width: 26, height: 26 }}>
            <Plus size={14} />
          </span>
          <span>Autre langue…</span>
        </button>
      </div>
      {custom && (
        <form
          className="grid-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create(name, code);
          }}
        >
          <Field label="Nom de l'univers">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Grec" autoFocus />
          </Field>
          <Field label="Code langue" hint="ISO 639-1 : el, sv, pl, tr, hi…">
            <div className="row">
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="el" />
              <Button type="submit" variant="primary">
                Créer
              </Button>
            </div>
          </Field>
        </form>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Premier lancement (ou compte sans univers) : choisir sa première langue. */
export function OnboardingScreen() {
  return (
    <div className="auth-screen">
      <div className="card auth-card" style={{ maxWidth: 620, textAlign: 'left' }}>
        <h1 className="auth-title">Quelle langue apprenez-vous ?</h1>
        <p className="muted">
          Chaque langue est un univers séparé, avec sa bibliothèque, ses collections et ses révisions. Vous pourrez en ajouter d'autres à tout
          moment.
        </p>
        <UniverseForm autoFocus />
      </div>
    </div>
  );
}

/** Gestion des univers : ajout, renommage, suppression. */
export function UniversesDialog() {
  const open = useApp((s) => s.universesOpen);
  const universes = useApp((s) => s.universes);
  const allNotes = useApp((s) => s.allNotes);
  const { setUniversesOpen, renameUniverse, deleteUniverse, setUniverse } = useApp.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  if (!open) return null;

  const count = (u: Universe) => allNotes.filter((n) => n.universeId === u.id).length;

  const remove = async (u: Universe) => {
    const n = count(u);
    const ok = await confirm({
      title: `Supprimer l'univers « ${u.name} » ?`,
      message: `${n} expression${n > 1 ? 's' : ''}, leurs collections et tout leur historique de révision seront supprimés, sur tous vos appareils.`,
      confirmLabel: 'Supprimer définitivement',
      danger: true,
    });
    if (ok) await attempt(() => deleteUniverse(u.id), 'Univers supprimé');
  };

  return (
    <Modal title="Univers" size="wide" onClose={() => setUniversesOpen(false)}>
      <div className="modal-body stack">
        <div className="mini-list card" style={{ overflow: 'hidden' }}>
          {universes.map((u) => (
            <div key={u.id} className="universe-row">
              <LanguageBadge language={u.language} />
              {editing === u.id ? (
                <form
                  className="row"
                  style={{ flex: 1 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void attempt(() => renameUniverse(u.id, draft)).then(() => setEditing(null));
                  }}
                >
                  <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                  <Button type="submit" size="sm" variant="primary">
                    OK
                  </Button>
                </form>
              ) : (
                <button
                  className="link"
                  style={{ flex: 1, textAlign: 'left', color: 'var(--text)' }}
                  onClick={() => {
                    setUniversesOpen(false);
                    void setUniverse(u.id);
                  }}
                >
                  {u.name} <span className="muted small">· {languageInfo(u.language).name} · {count(u)} expressions</span>
                </button>
              )}
              <Button
                variant="ghost"
                icon
                size="sm"
                title="Renommer"
                onClick={() => {
                  setEditing(u.id);
                  setDraft(u.name);
                }}
              >
                <Pencil size={14} />
              </Button>
              <Button variant="danger-ghost" icon size="sm" title="Supprimer" onClick={() => void remove(u)}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
        <h3 className="section-title" style={{ marginTop: 8 }}>
          Ajouter une langue
        </h3>
        <UniverseForm
          onDone={() => {
            setUniversesOpen(false);
          }}
        />
      </div>
    </Modal>
  );
}
