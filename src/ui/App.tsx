import { useEffect } from 'react';
import { BarChart3, BookOpen, Brain, Home, Layers, Library, Plus, Search, Settings as SettingsIcon } from 'lucide-react';
import { useApp, type Route } from '@/app/store';
import { registerGlobalShortcut } from '@/core/platform/globalShortcut';
import { readClipboardExpression } from '@/core/platform/desktop';
import { startDesktopIntegration } from '@/app/desktop';
import { UpdateBanner } from './features/account/UpdateBanner';
import { Button, Kbd, Modal } from './components/ui';
import { ConfirmHost } from './components/Confirm';
import { Toasts } from './components/Toasts';
import { useHotkeys } from './hooks/useHotkeys';
import { NoteEditor } from './features/notes/NoteEditor';
import { BulkImport } from './features/notes/BulkImport';
import { SearchPalette } from './features/search/SearchPalette';
import { HomePage } from './features/home/HomePage';
import { LibraryPage } from './features/library/LibraryPage';
import { ReviewPage, useDueCounts } from './features/review/ReviewPage';
import { SessionPage } from './features/review/SessionPage';
import { CollectionPage, CollectionsPage } from './features/collections/CollectionsPage';
import { StatsPage } from './features/stats/StatsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ReadingPage } from './features/reading/ReadingPage';
import { ReaderPage } from './features/reading/ReaderPage';
import { VocabTestPage } from '@/ui/features/reading/VocabTest';
import { GrammarAnnotatePage } from '@/ui/features/learn/GrammarAnnotate';
import { AccountConflictScreen, FirstSyncScreen, LoginScreen } from './features/account/AuthScreens';
import { SidebarAccount } from './features/account/SyncIndicator';
import { OnboardingScreen, UniverseSwitcher, UniversesDialog } from './features/universes/Universes';

const NAV: { route: Route['name']; label: string; icon: typeof Home; key: string }[] = [
  { route: 'home', label: 'Accueil', icon: Home, key: '1' },
  { route: 'library', label: 'Bibliothèque', icon: BookOpen, key: '2' },
  { route: 'review', label: 'Réviser', icon: Brain, key: '3' },
  { route: 'collections', label: 'Collections', icon: Layers, key: '4' },
  { route: 'reading', label: 'Lecture', icon: Library, key: '5' },
  { route: 'stats', label: 'Statistiques', icon: BarChart3, key: '6' },
  { route: 'settings', label: 'Paramètres', icon: SettingsIcon, key: '7' },
];

let lastPrefill = '';

/** Raccourci global : ouvre l'ajout rapide, pré-rempli avec le texte copié (s'il est nouveau). */
async function quickAddFromAnywhere() {
  const s = useApp.getState();
  if (s.editor) return;
  let expression: string | null = null;
  if (s.settings.clipboardPrefill) {
    const copied = await readClipboardExpression();
    if (copied && copied !== lastPrefill) {
      expression = copied;
      lastPrefill = copied;
    }
  }
  s.openEditor(null, expression ? { expression } : undefined);
}

function Sidebar() {
  const route = useApp((s) => s.route);
  const { navigate, openEditor, setSearchOpen } = useApp.getState();
  const due = useDueCounts();
  const current = route.name === 'collection' ? 'collections' : route.name;
  return (
    <nav className="sidebar" aria-label="Navigation principale">
      <div className="brand">
        <img src="/favicon.png" alt="" />
        <span>Lexora</span>
      </div>
      <UniverseSwitcher />
      <div className="nav">
        {NAV.map(({ route: r, label, icon: Icon, key }) => (
          <button
            key={r}
            className={`nav-item ${current === r ? 'nav-item--active' : ''}`}
            aria-current={current === r ? 'page' : undefined}
            onClick={() => navigate({ name: r } as Route)}
            title={`${label} (Ctrl+${key})`}
          >
            <Icon size={17} />
            <span className="label">{label}</span>
            {r === 'review' && due.total > 0 ? <span className="nav-count">{due.total}</span> : <Kbd>Ctrl {key}</Kbd>}
          </button>
        ))}
      </div>
      <div className="sidebar-spacer" />
      <div className="sidebar-actions">
        <UpdateBanner />
        <SidebarAccount />
        <button className="search-trigger" onClick={() => setSearchOpen(true)} title="Rechercher (Ctrl+K)">
          <Search size={15} />
          <span className="label">Rechercher</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <Button variant="primary" block onClick={() => openEditor()} title="Ajouter une expression (N)">
          <Plus size={17} />
          <span className="label">Ajouter</span>
          <span className="label">
            <Kbd>N</Kbd>
          </span>
        </Button>
      </div>
    </nav>
  );
}

function ShortcutsHelp() {
  const open = useApp((s) => s.shortcutsOpen);
  if (!open) return null;
  const rows: [string, string][] = [
    ['N  ou  Ctrl+N', 'Ajouter une expression'],
    ['Ctrl+Maj+V', 'Coller plusieurs expressions'],
    ['Ctrl+K', 'Recherche instantanée'],
    ['Ctrl+1 … 7', 'Changer de page'],
    ['Lecture : ← → · Espace', 'Page précédente / suivante'],
    ['Lecture : + − · T · F', 'Taille du texte · Chapitres · Plein écran'],
    ['Alt+1 … 9', "Changer d'univers (langue)"],
    ['Ctrl+Entrée', 'Enregistrer le formulaire'],
    ['Accueil : Entrée / Espace', 'Toutes les révisions / 5 mots'],
    ['Révision : Espace', 'Afficher la réponse (puis « Retenu »)'],
    ['Révision : 1 · 2 · 3 · 4', 'Oublié · Difficile · Retenu · Facile'],
    ['Révision : Z', 'Annuler la dernière réponse'],
    ['Révision : E · P', 'Modifier · Prononcer'],
    ['Bibliothèque : / · ↑ ↓', 'Rechercher · Parcourir'],
    ['Bibliothèque : E · F · H · Suppr', 'Modifier · Favori · Masquer le français · Supprimer'],
    ['Échap', 'Fermer / quitter'],
  ];
  return (
    <Modal title="Raccourcis clavier" onClose={() => useApp.getState().setShortcutsOpen(false)}>
      <div className="modal-body">
        <table className="simple-table">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} style={{ cursor: 'default' }}>
                <td style={{ paddingLeft: 0 }}>
                  <span className="code">{k}</span>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function Page() {
  const route = useApp((s) => s.route);
  const key = useApp((s) => s.routeKey);
  switch (route.name) {
    case 'home':
      return <HomePage key={key} />;
    case 'library':
      return <LibraryPage key="library" />;
    case 'review':
      return <ReviewPage key={key} />;
    case 'session':
      return <SessionPage key={key} config={route.config} />;
    case 'collections':
      return <CollectionsPage />;
    case 'collection':
      return <CollectionPage key={route.id} id={route.id} />;
    case 'reading':
      return <ReadingPage key={key} />;
    case 'reader':
      return <ReaderPage key={route.bookKey} bookKey={route.bookKey} />;
    case 'vocab-test':
      return <VocabTestPage key={key} />;
    case 'grammar-annotate':
      return <GrammarAnnotatePage />;
    case 'stats':
      return <StatsPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

export function App() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const route = useApp((s) => s.route);
  const globalShortcut = useApp((s) => s.settings.globalShortcut);
  const overlay = useApp((s) => !!s.editor || s.searchOpen || s.bulkOpen || s.shortcutsOpen || s.universesOpen);
  const phase = useApp((s) => s.auth.phase);
  const hasUniverse = useApp((s) => !!s.universe);
  const { navigate, openEditor, setSearchOpen, setBulkOpen, setShortcutsOpen, toast } = useApp.getState();
  const appReady = status === 'ready' && (phase === 'in' || phase === 'local') && hasUniverse;
  const switchUniverse = (i: number) => {
    const u = useApp.getState().universes[i];
    if (u) void useApp.getState().setUniverse(u.id);
  };

  useEffect(() => {
    void useApp.getState().init();
  }, []);

  useEffect(() => {
    if (!appReady) return;
    registerGlobalShortcut(globalShortcut, () => void quickAddFromAnywhere()).catch((err) => toast('error', `Raccourci global « ${globalShortcut} » indisponible : ${err instanceof Error ? err.message : String(err)}`));
  }, [appReady, globalShortcut, toast]);

  useEffect(() => (appReady ? startDesktopIntegration() : undefined), [appReady]);

  const inSession = route.name === 'session';
  const focus = inSession || route.name === 'reader' || route.name === 'vocab-test';

  useHotkeys(
    {
      'mod+k': () => setSearchOpen(true),
      'mod+n': () => openEditor(),
      'mod+shift+v': () => setBulkOpen(true),
      ...(inSession
        ? {}
        : {
            n: () => openEditor(),
            '?': () => setShortcutsOpen(true),
            'mod+1': () => navigate({ name: 'home' }),
            'mod+2': () => navigate({ name: 'library' }),
            'mod+3': () => navigate({ name: 'review' }),
            'mod+4': () => navigate({ name: 'collections' }),
            'mod+5': () => navigate({ name: 'reading' }),
            'mod+6': () => navigate({ name: 'stats' }),
            'mod+7': () => navigate({ name: 'settings' }),
            'mod+u': () => useApp.getState().setUniversesOpen(true),
            ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`alt+${i + 1}`, () => switchUniverse(i)])),
          }),
    },
    { enabled: appReady && !overlay, allowInInputs: ['mod+k', 'mod+n', 'mod+shift+v'] },
  );

  if (status === 'loading' || (status === 'ready' && phase === 'checking')) return <div className="loading-screen">Chargement…</div>;
  if (status === 'error') {
    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: 12, padding: 32, textAlign: 'center' }}>
        <strong style={{ color: 'var(--danger)' }}>Impossible d'ouvrir la base de données</strong>
        <span className="code">{error}</span>
        <Button onClick={() => location.reload()}>Réessayer</Button>
      </div>
    );
  }

  const gate =
    phase === 'signed-out' ? (
      <LoginScreen />
    ) : phase === 'conflict' ? (
      <AccountConflictScreen />
    ) : phase === 'first-sync' ? (
      <FirstSyncScreen />
    ) : !hasUniverse ? (
      <OnboardingScreen />
    ) : null;
  if (gate) {
    return (
      <>
        {gate}
        <ConfirmHost />
        <Toasts />
      </>
    );
  }

  return (
    <>
      <div className={`app ${focus ? 'app--focus' : ''}`}>
        {!focus && <Sidebar />}
        <main className="main">
          <Page />
        </main>
      </div>
      <NoteEditor />
      <BulkImport />
      <SearchPalette />
      <ShortcutsHelp />
      <UniversesDialog />
      <ConfirmHost />
      <Toasts />
    </>
  );
}
