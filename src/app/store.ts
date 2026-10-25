import { create } from 'zustand';
import type { Database } from '@/core/db/types';
import { openDatabase } from '@/core/db/open';
import { startOfStudyDay } from '@/core/domain/dates';
import { DEFAULT_SETTINGS, primaryDirection, type Settings } from '@/core/domain/settings';
import type { Collection, Direction, Mastery, Note, NoteInput, PracticeMode } from '@/core/domain/types';
import * as notesRepo from '@/core/repo/notesRepo';
import * as collectionsRepo from '@/core/repo/collectionsRepo';
import { countNewIntroduced, loadForgetCounts } from '@/core/repo/reviewRepo';
import { loadSettings, saveSettings } from '@/core/repo/settingsRepo';
import { createScheduler, type Scheduler } from '@/core/srs/scheduler';

export type SessionConfig =
  | { kind: 'scheduled'; limit: number | null; direction?: Direction | null; collectionId?: number | null }
  | { kind: 'practice'; mode: PracticeMode; limit: number | null; direction?: Direction | null; collectionId?: number | null };

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'review' }
  | { name: 'session'; config: SessionConfig }
  | { name: 'collections' }
  | { name: 'collection'; id: number }
  | { name: 'stats' }
  | { name: 'settings' };

export type SortKey = 'recent' | 'oldest' | 'az' | 'za' | 'mastery';
export type DateFilter = 'all' | 'today' | '7d' | '30d' | '90d';

export interface LibraryFilters {
  query: string;
  category: string;
  tag: string;
  collectionId: number | null;
  mastery: Mastery | 'not_mastered' | 'all';
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
  noteId: number | null;
  prefill?: Partial<NoteInput>;
}

interface AppState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  db: Database | null;
  settings: Settings;
  scheduler: Scheduler;
  notes: Note[];
  notesById: Map<number, Note>;
  collections: Collection[];
  forgetCounts: Map<number, number>;
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
  toasts: Toast[];
  libraryFilters: LibraryFilters;
  hideTranslation: boolean;
  selectedNoteId: number | null;

  init(): Promise<void>;
  refresh(): Promise<void>;
  navigate(route: Route): void;
  openEditor(noteId?: number | null, prefill?: Partial<NoteInput>): void;
  closeEditor(): void;
  setSearchOpen(open: boolean): void;
  setBulkOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  toast(kind: Toast['kind'], message: string, action?: Toast['action']): void;
  dismissToast(id: number): void;
  setLibraryFilters(patch: Partial<LibraryFilters>): void;
  setHideTranslation(hide: boolean): void;
  selectNote(id: number | null): void;
  /** Affiche une note dans la bibliothèque (filtres réinitialisés pour la rendre visible). */
  showNote(id: number): void;

  saveNote(input: NoteInput, id?: number | null): Promise<number>;
  deleteNotes(ids: number[]): Promise<void>;
  toggleFavorite(id: number): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  createCollection(name: string, description?: string): Promise<number>;
  updateCollection(id: number, name: string, description: string): Promise<void>;
  deleteCollection(id: number): Promise<void>;
  addToCollection(collectionId: number, noteIds: number[]): Promise<void>;
  removeFromCollection(collectionId: number, noteIds: number[]): Promise<void>;
}

let toastSeq = 1;

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'Erreur inattendue';
}

export const useApp = create<AppState>((set, get) => {
  const db = () => {
    const d = get().db;
    if (!d) throw new Error('Base de données non initialisée');
    return d;
  };

  return {
    status: 'loading',
    error: null,
    db: null,
    settings: DEFAULT_SETTINGS,
    scheduler: createScheduler(DEFAULT_SETTINGS),
    notes: [],
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
    toasts: [],
    libraryFilters: DEFAULT_FILTERS,
    hideTranslation: false,
    selectedNoteId: null,

    async init() {
      try {
        const database = await openDatabase();
        const settings = await loadSettings(database);
        set({ db: database, settings, scheduler: createScheduler(settings) });
        await get().refresh();
        set({ status: 'ready' });
      } catch (err) {
        console.error(err);
        set({ status: 'error', error: errorMessage(err) });
      }
    },

    async refresh() {
      const d = db();
      const { settings } = get();
      const [notes, collections, forgetCounts, newIntroducedToday] = await Promise.all([
        notesRepo.loadNotes(d),
        collectionsRepo.loadCollections(d),
        loadForgetCounts(d),
        countNewIntroduced(d, startOfStudyDay(Date.now(), settings.dayStartHour), primaryDirection(settings)),
      ]);
      set((s) => ({
        notes,
        notesById: new Map(notes.map((n) => [n.id, n])),
        collections,
        forgetCounts,
        newIntroducedToday,
        revision: s.revision + 1,
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
      set((s) => ({ route: { name: 'library' }, routeKey: s.routeKey + 1, selectedNoteId: id, libraryFilters: DEFAULT_FILTERS, searchOpen: false }));
    },

    async saveNote(input, id) {
      const d = db();
      const noteId = id ? (await notesRepo.updateNote(d, id, input), id) : await notesRepo.createNote(d, input);
      await get().refresh();
      return noteId;
    },

    async deleteNotes(ids) {
      await notesRepo.deleteNotes(db(), ids);
      if (ids.includes(get().selectedNoteId ?? -1)) set({ selectedNoteId: null });
      await get().refresh();
    },

    async toggleFavorite(id) {
      const note = get().notesById.get(id);
      if (!note) return;
      await notesRepo.setFavorite(db(), id, !note.isFavorite);
      await get().refresh();
    },

    async updateSettings(patch) {
      const settings = await saveSettings(db(), patch);
      set({ settings, scheduler: createScheduler(settings) });
      await get().refresh();
    },

    async createCollection(name, description = '') {
      const id = await collectionsRepo.createCollection(db(), name, description);
      await get().refresh();
      return id;
    },
    async updateCollection(id, name, description) {
      await collectionsRepo.updateCollection(db(), id, name, description);
      await get().refresh();
    },
    async deleteCollection(id) {
      await collectionsRepo.deleteCollection(db(), id);
      await get().refresh();
    },
    async addToCollection(collectionId, noteIds) {
      await collectionsRepo.addToCollection(db(), collectionId, noteIds);
      await get().refresh();
    },
    async removeFromCollection(collectionId, noteIds) {
      await collectionsRepo.removeFromCollection(db(), collectionId, noteIds);
      await get().refresh();
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
