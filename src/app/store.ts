import { create } from 'zustand';
import type { Database } from '@/core/db/types';
import { openDatabase } from '@/core/db/open';
import { startOfStudyDay } from '@/core/domain/dates';
import { DEFAULT_SETTINGS, primaryDirection, type Settings } from '@/core/domain/settings';
import type { Collection, Direction, Mastery, Note, NoteInput, PracticeMode, Universe } from '@/core/domain/types';
import * as notesRepo from '@/core/repo/notesRepo';
import * as collectionsRepo from '@/core/repo/collectionsRepo';
import * as universesRepo from '@/core/repo/universesRepo';
import { countNewIntroduced, loadForgetCounts } from '@/core/repo/reviewRepo';
import { loadSettings, saveSettings } from '@/core/repo/settingsRepo';
import { createScheduler, type Scheduler } from '@/core/srs/scheduler';
import { authConfigured, currentUser, signInWithGoogle, signOut as authSignOut, type AccountUser } from '@/core/platform/auth';
import { bindAccount, getSyncState, resetLocalData } from '@/core/sync/engine';
import { readPref, writePref } from '@/ui/prefs';
import type { AvailableUpdate } from '@/core/platform/desktop';
import { runSync, scheduleSync, startSyncLoop, stopSyncLoop } from './sync';

export type SessionConfig =
  | { kind: 'scheduled'; limit: number | null; direction?: Direction | null; collectionId?: string | null }
  | { kind: 'practice'; mode: PracticeMode; limit: number | null; direction?: Direction | null; collectionId?: string | null };

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'review' }
  | { name: 'session'; config: SessionConfig }
  | { name: 'collections' }
  | { name: 'collection'; id: string }
  | { name: 'stats' }
  | { name: 'settings' };

export type SortKey = 'recent' | 'oldest' | 'az' | 'za' | 'mastery';
export type DateFilter = 'all' | 'today' | '7d' | '30d' | '90d';

export interface LibraryFilters {
  query: string;
  category: string;
  tag: string;
  collectionId: string | null;
  mastery: Mastery | 'not_mastered' | 'suspended' | 'all';
  date: DateFilter;
  favoritesOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: LibraryFilters = {
  query: '',
  category: '',
  tag: '',
  collectionId: null,
  mastery: 'all',
  date: 'all',
  favoritesOnly: false,
  sort: 'recent',
};

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; run: () => void };
}

interface EditorState {
  noteId: string | null;
  prefill?: Partial<NoteInput>;
}

/**
 * checking : lecture de la session ; signed-out : écran de connexion ;
 * conflict : cet appareil contient les données d'un autre compte ;
 * first-sync : premier chargement des données du compte ; in : connecté ;
 * local : Supabase non configuré (aperçu / développement), pas de synchronisation.
 */
export type AuthPhase = 'checking' | 'signed-out' | 'conflict' | 'first-sync' | 'in' | 'local';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error' | 'disabled';
  lastSync: number | null;
  error: string | null;
}

interface AppState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  db: Database | null;
  settings: Settings;
  scheduler: Scheduler;

  auth: { phase: AuthPhase; user: AccountUser | null; busy: boolean; error: string | null };
  sync: SyncStatus;

  universes: Universe[];
  universe: Universe | null;
  /** Notes de l'univers courant. */
  notes: Note[];
  /** Toutes les notes, tous univers (compteurs du sélecteur d'univers). */
  allNotes: Note[];
  notesById: Map<string, Note>;
  /** Collections de l'univers courant. */
  collections: Collection[];
  forgetCounts: Map<string, number>;
  newIntroducedToday: number;
  /** Incrémenté à chaque modification des données. */
  revision: number;

  route: Route;
  /** Change à chaque navigation : force le remontage d'une page (ex. nouvelle session). */
  routeKey: number;
  editor: EditorState | null;
  searchOpen: boolean;
  bulkOpen: boolean;
  shortcutsOpen: boolean;
  universesOpen: boolean;
  toasts: Toast[];
  libraryFilters: LibraryFilters;
  hideTranslation: boolean;
  selectedNoteId: string | null;

  init(): Promise<void>;
  refresh(): Promise<void>;
  navigate(route: Route): void;
  openEditor(noteId?: string | null, prefill?: Partial<NoteInput>): void;
  closeEditor(): void;
  setSearchOpen(open: boolean): void;
  setBulkOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  setUniversesOpen(open: boolean): void;
  toast(kind: Toast['kind'], message: string, action?: Toast['action']): void;
  dismissToast(id: number): void;
  setLibraryFilters(patch: Partial<LibraryFilters>): void;
  setHideTranslation(hide: boolean): void;
  selectNote(id: string | null): void;
  /** Affiche une note dans la bibliothèque (filtres réinitialisés pour la rendre visible). */
  showNote(id: string): void;

  signIn(): Promise<void>;
  signOut(): Promise<void>;
  resolveAccountConflict(replaceLocal: boolean): Promise<void>;
  syncNow(): Promise<void>;

  setUniverse(id: string): Promise<void>;
  createUniverse(name: string, language: string): Promise<string>;
  renameUniverse(id: string, name: string): Promise<void>;
  deleteUniverse(id: string): Promise<void>;

  saveNote(input: NoteInput, id?: string | null): Promise<string>;
  /** Suppression immédiate, annulable depuis la notification. */
  deleteNotes(ids: string[]): Promise<void>;
  restoreNotes(ids: string[]): Promise<void>;
  setSuspended(ids: string[], suspended: boolean): Promise<void>;
  addTag(ids: string[], tag: string): Promise<void>;
  moveNotes(ids: string[], universeId: string): Promise<void>;
  setUniverseNewPerDay(id: string, value: number | null): Promise<void>;
  update: AvailableUpdate | null;
  setUpdate(update: AvailableUpdate | null): void;
  toggleFavorite(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  createCollection(name: string, description?: string): Promise<string>;
  updateCollection(id: string, name: string, description: string): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  addToCollection(collectionId: string, noteIds: string[]): Promise<void>;
  removeFromCollection(collectionId: string, noteIds: string[]): Promise<void>;
}

let toastSeq = 1;

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return typeof err === 'string' ? err : 'Erreur inattendue';
}

export const useApp = create<AppState>((set, get) => {
  const db = () => {
    const d = get().db;
    if (!d) throw new Error('Base de données non initialisée');
    return d;
  };
  const universe = () => {
    const u = get().universe;
    if (!u) throw new Error('Aucun univers sélectionné');
    return u;
  };
  /** Après une écriture locale : rechargement + synchronisation différée. */
  const afterWrite = async () => {
    await get().refresh();
    scheduleSync();
  };

  /** Rattache les données locales au compte puis charge l'application. */
  const enter = async (user: AccountUser) => {
    const d = db();
    const bound = await bindAccount(d, user.id);
    if (bound === 'other-account') {
      set((s) => ({ auth: { ...s.auth, phase: 'conflict', user } }));
      return;
    }
    const neverSynced = !(await getSyncState(d, 'last_sync'));
    set((s) => ({ auth: { ...s.auth, phase: neverSynced ? 'first-sync' : 'in', user, error: null } }));
    if (neverSynced) await runSync();
    await get().refresh();
    set((s) => ({ auth: { ...s.auth, phase: 'in' } }));
    startSyncLoop();
    if (!neverSynced) void runSync();
  };

  return {
    status: 'loading',
    error: null,
    db: null,
    settings: DEFAULT_SETTINGS,
    scheduler: createScheduler(DEFAULT_SETTINGS),

    auth: { phase: 'checking', user: null, busy: false, error: null },
    sync: { state: authConfigured ? 'idle' : 'disabled', lastSync: null, error: null },

    universes: [],
    universe: null,
    notes: [],
    allNotes: [],
    notesById: new Map(),
    collections: [],
    forgetCounts: new Map(),
    newIntroducedToday: 0,
    revision: 0,

    route: { name: 'home' },
    routeKey: 0,
    editor: null,
    searchOpen: false,
    bulkOpen: false,
    shortcutsOpen: false,
    universesOpen: false,
    toasts: [],
    libraryFilters: DEFAULT_FILTERS,
    hideTranslation: false,
    selectedNoteId: null,
    update: null,

    async init() {
      try {
        const database = await openDatabase();
        const settings = await loadSettings(database);
        const lastSync = Number((await getSyncState(database, 'last_sync')) ?? 0) || null;
        set((s) => ({ db: database, settings, scheduler: createScheduler(settings), sync: { ...s.sync, lastSync } }));
        set({ status: 'ready' });
        if (!authConfigured) {
          await get().refresh();
          set((s) => ({ auth: { ...s.auth, phase: 'local' } }));
          return;
        }
        const user = await currentUser();
        if (!user) set((s) => ({ auth: { ...s.auth, phase: 'signed-out' } }));
        else await enter(user);
      } catch (err) {
        console.error(err);
        set({ status: 'error', error: errorMessage(err) });
      }
    },

    async refresh() {
      const d = db();
      const { settings } = get();
      const [universes, allNotes, allCollections, forgetCounts] = await Promise.all([
        universesRepo.loadUniverses(d),
        notesRepo.loadNotes(d),
        collectionsRepo.loadCollections(d),
        loadForgetCounts(d),
      ]);
      const wanted = get().universe?.id ?? readPref<string | null>('universeId', null);
      const current = universes.find((u) => u.id === wanted) ?? universes[0] ?? null;
      const newIntroducedToday = current
        ? await countNewIntroduced(d, startOfStudyDay(Date.now(), settings.dayStartHour), primaryDirection(settings), current.id)
        : 0;
      const changedUniverse = current?.id !== get().universe?.id;
      set((s) => ({
        universes,
        universe: current,
        allNotes,
        notes: current ? allNotes.filter((n) => n.universeId === current.id) : [],
        notesById: new Map(allNotes.map((n) => [n.id, n])),
        collections: current ? allCollections.filter((c) => c.universeId === current.id) : [],
        forgetCounts,
        newIntroducedToday,
        revision: s.revision + 1,
        ...(changedUniverse ? { libraryFilters: DEFAULT_FILTERS, selectedNoteId: null } : {}),
      }));
    },

    navigate(route) {
      set((s) => ({ route, routeKey: s.routeKey + 1, searchOpen: false }));
    },
    openEditor(noteId = null, prefill) {
      set({ editor: { noteId, prefill }, searchOpen: false });
    },
    closeEditor() {
      set({ editor: null });
    },
    setSearchOpen(searchOpen) {
      set({ searchOpen });
    },
    setBulkOpen(bulkOpen) {
      set({ bulkOpen, searchOpen: false });
    },
    setShortcutsOpen(shortcutsOpen) {
      set({ shortcutsOpen });
    },
    setUniversesOpen(universesOpen) {
      set({ universesOpen, searchOpen: false });
    },
    toast(kind, message, action) {
      const id = toastSeq++;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message, action }] }));
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },
    setLibraryFilters(patch) {
      set((s) => ({ libraryFilters: { ...s.libraryFilters, ...patch } }));
    },
    setHideTranslation(hideTranslation) {
      set({ hideTranslation });
    },
    selectNote(selectedNoteId) {
      set({ selectedNoteId });
    },
    showNote(id) {
      const note = get().notesById.get(id);
      if (note && note.universeId !== get().universe?.id) void get().setUniverse(note.universeId);
      set((s) => ({ route: { name: 'library' }, routeKey: s.routeKey + 1, selectedNoteId: id, libraryFilters: DEFAULT_FILTERS, searchOpen: false }));
    },

    /* ------------------------------- Compte ------------------------------- */

    async signIn() {
      set((s) => ({ auth: { ...s.auth, busy: true, error: null } }));
      try {
        const user = await signInWithGoogle();
        if (user) await enter(user);
      } catch (err) {
        set((s) => ({ auth: { ...s.auth, error: errorMessage(err) } }));
      } finally {
        set((s) => ({ auth: { ...s.auth, busy: false } }));
      }
    },

    async signOut() {
      stopSyncLoop();
      await authSignOut();
      set((s) => ({ auth: { ...s.auth, phase: 'signed-out', user: null }, route: { name: 'home' }, sync: { ...s.sync, state: 'idle', error: null } }));
    },

    async resolveAccountConflict(replaceLocal) {
      const user = get().auth.user;
      if (!user) return;
      if (!replaceLocal) {
        await get().signOut();
        return;
      }
      await resetLocalData(db(), user.id);
      await enter(user);
    },

    async syncNow() {
      await runSync({ manual: true });
    },

    /* ------------------------------- Univers ------------------------------ */

    async setUniverse(id) {
      writePref('universeId', id);
      const target = get().universes.find((u) => u.id === id);
      if (!target) return;
      set({ universe: target });
      await get().refresh();
      set((s) => ({ libraryFilters: DEFAULT_FILTERS, selectedNoteId: null, route: s.route.name === 'collection' || s.route.name === 'session' ? { name: 'home' } : s.route, routeKey: s.routeKey + 1 }));
    },
    async createUniverse(name, language) {
      const id = await universesRepo.createUniverse(db(), name, language);
      writePref('universeId', id);
      set({ universe: null });
      await afterWrite();
      return id;
    },
    async renameUniverse(id, name) {
      await universesRepo.renameUniverse(db(), id, name);
      await afterWrite();
    },
    async deleteUniverse(id) {
      await universesRepo.deleteUniverse(db(), id);
      if (get().universe?.id === id) set({ universe: null, route: { name: 'home' } });
      await afterWrite();
    },

    /* -------------------------------- Notes ------------------------------- */

    async saveNote(input, id) {
      const d = db();
      const u = universe();
      let noteId: string;
      if (id) {
        const note = get().notesById.get(id);
        const lang = get().universes.find((x) => x.id === note?.universeId)?.language ?? u.language;
        await notesRepo.updateNote(d, id, input, lang);
        noteId = id;
      } else {
        noteId = await notesRepo.createNote(d, input, { universeId: u.id, language: u.language });
      }
      await afterWrite();
      return noteId;
    },

    async deleteNotes(ids) {
      if (!ids.length) return;
      const first = get().notesById.get(ids[0]);
      await notesRepo.deleteNotes(db(), ids);
      if (ids.includes(get().selectedNoteId ?? '')) set({ selectedNoteId: null });
      await afterWrite();
      get().toast('info', ids.length > 1 ? `${ids.length} expressions supprimées` : `« ${first?.expression ?? 'Expression'} » supprimée`, {
        label: 'Annuler',
        run: () => void attempt(() => get().restoreNotes(ids), 'Suppression annulée'),
      });
    },
    async restoreNotes(ids) {
      await notesRepo.restoreNotes(db(), ids);
      await afterWrite();
    },
    async setSuspended(ids, suspended) {
      await notesRepo.setSuspended(db(), ids, suspended);
      await afterWrite();
    },
    async addTag(ids, tag) {
      await notesRepo.addTag(db(), ids, tag);
      await afterWrite();
    },
    async moveNotes(ids, universeId) {
      const target = get().universes.find((u) => u.id === universeId);
      if (!target) throw new Error('Univers introuvable.');
      await notesRepo.moveNotes(db(), ids, { universeId: target.id, language: target.language });
      if (ids.includes(get().selectedNoteId ?? '')) set({ selectedNoteId: null });
      await afterWrite();
    },
    async setUniverseNewPerDay(id, value) {
      await universesRepo.setUniverseNewPerDay(db(), id, value);
      await afterWrite();
    },
    setUpdate(update) {
      set({ update });
    },

    async toggleFavorite(id) {
      const note = get().notesById.get(id);
      if (!note) return;
      await notesRepo.setFavorite(db(), id, !note.isFavorite);
      await afterWrite();
    },

    async updateSettings(patch) {
      const settings = await saveSettings(db(), patch);
      set({ settings, scheduler: createScheduler(settings) });
      await afterWrite();
    },

    async createCollection(name, description = '') {
      const id = await collectionsRepo.createCollection(db(), universe().id, name, description);
      await afterWrite();
      return id;
    },
    async updateCollection(id, name, description) {
      await collectionsRepo.updateCollection(db(), id, name, description);
      await afterWrite();
    },
    async deleteCollection(id) {
      await collectionsRepo.deleteCollection(db(), id);
      await afterWrite();
    },
    async addToCollection(collectionId, noteIds) {
      await collectionsRepo.addToCollection(db(), collectionId, noteIds);
      await afterWrite();
    },
    async removeFromCollection(collectionId, noteIds) {
      await collectionsRepo.removeFromCollection(db(), collectionId, noteIds);
      await afterWrite();
    },
  };
});

/** Exécute une action et affiche l'erreur éventuelle dans un toast. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const v = await fn();
    if (success) useApp.getState().toast('success', success);
    return v;
  } catch (err) {
    console.error(err);
    useApp.getState().toast('error', errorMessage(err));
    return undefined;
  }
}
