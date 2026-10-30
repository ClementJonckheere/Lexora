import { useEffect, useState } from 'react';
import { useApp } from '@/app/store';
import { computeTitles, displayedTitle, type Title } from '@/core/progress/titles';
import { computeXp, type XpSummary } from '@/core/progress/xp';
import { loadGrammarAnswers } from '@/core/repo/learnRepo';
import { loadHistory, loadXpEvents } from '@/core/repo/xpRepo';

export interface ProgressState {
  xp: XpSummary;
  titles: Title[];
  /** Titre affiché à côté du rang (choisi, sinon le premier gagné). */
  title: Title | null;
}

/** XP, rang et titres de l'univers en cours, recalculés après chaque révision ou exercice. */
export function useProgress(): ProgressState | null {
  const db = useApp((s) => s.db);
  const universe = useApp((s) => s.universe);
  const universes = useApp((s) => s.universes);
  const revision = useApp((s) => s.revision);
  const grammar = useApp((s) => s.grammarAnswers);
  const books = useApp((s) => s.books);
  const chosen = useApp((s) => (universe ? s.settings.displayedTitles[universe.id] : undefined));
  const [state, setState] = useState<Omit<ProgressState, 'title'> | null>(null);

  useEffect(() => {
    if (!db || !universe) return;
    let alive = true;
    (async () => {
      const now = Date.now();
      const history = await loadHistory(db, universe.id, grammar);
      const xp = computeXp(history.events, now);
      // Niveau des autres langues (titre « Polyglotte »).
      const others = await Promise.all(
        universes
          .filter((u) => u.id !== universe.id)
          .map(async (u) => computeXp(await loadXpEvents(db, u.id, await loadGrammarAnswers(db, u.id)), now).level),
      );
      const titles = computeTitles({
        now,
        events: history.events,
        reviews: history.reviews,
        books: books.filter((b) => b.universeId === universe.id),
        chapterDecisions: history.chapterDecisions,
        lessons: history.lessons,
        grammarCorrect: history.grammarCorrect,
        entries: history.entries,
        readingMinutes: history.readingMinutes,
        verbsMastered: history.verbsMastered,
        levels: [xp.level, ...others],
      });
      if (alive) setState({ xp, titles });
    })().catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, [db, universe, universes, revision, grammar, books]);

  return state ? { ...state, title: displayedTitle(state.titles, chosen) } : null;
}

/** XP seule (raccourci). */
export function useXp(): XpSummary | null {
  return useProgress()?.xp ?? null;
}
