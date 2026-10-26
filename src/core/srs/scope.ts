import type { Note } from '../domain/types';

/** Sous-ensemble révisé : collection, catégorie et tag (combinables). */
export interface ReviewScope {
  collectionId?: string | null;
  category?: string | null;
  tag?: string | null;
}

export function hasScope(scope: ReviewScope): boolean {
  return scope.collectionId != null || !!scope.category || !!scope.tag;
}

export function inScope(note: Note, scope: ReviewScope): boolean {
  if (scope.collectionId != null && !note.collectionIds.includes(scope.collectionId)) return false;
  if (scope.category && note.category !== scope.category) return false;
  if (scope.tag) {
    const tag = scope.tag.toLowerCase();
    if (!note.tags.some((t) => t.toLowerCase() === tag)) return false;
  }
  return true;
}

export function scopeNotes(notes: Note[], scope: ReviewScope): Note[] {
  return hasScope(scope) ? notes.filter((n) => inScope(n, scope)) : notes;
}

/** Identifiants des notes du sous-ensemble, ou null (toutes les notes). */
export function scopeIds(notes: Note[], scope: ReviewScope): Set<string> | null {
  return hasScope(scope) ? new Set(scopeNotes(notes, scope).map((n) => n.id)) : null;
}
