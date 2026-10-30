import { useEffect, useState } from 'react';
import { assetUrl } from '@/core/platform/env';
import { shuffledChoices, type Exercise } from '@/core/learn/exercises';
import type { PlacementItem } from '@/core/learn/placementBank';

/** Données de grammaire fournies avec l'application (public/grammar/en). */

export interface GrammarPoint {
  id: string;
  level: string;
  title: string;
  example: string;
  /** Prérequis stricts (déduction du placement). */
  requires: string[];
}

export interface Trap {
  id: string;
  point: string;
  level: string;
  title: string;
  wrong: string;
  right: string;
}

export interface Lesson {
  id: string;
  summary: string;
  rules: string[];
  examples: { en: string; fr: string }[];
  traps: string[];
}

export interface GrammarData {
  points: GrammarPoint[];
  traps: Trap[];
  lessons: Lesson[];
  /** Nombre d'exercices de chaque leçon (banques préparées par la CI). */
  bankSizes: Record<string, number>;
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || type.includes('html')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

let cache: Promise<GrammarData | null> | null = null;

export function loadGrammarData(): Promise<GrammarData | null> {
  cache ??= (async () => {
    const [points, lessons, index] = await Promise.all([
      json<{ points: GrammarPoint[]; traps: Trap[] }>(assetUrl('grammar/en/points.json')),
      json<{ lessons: Lesson[] }>(assetUrl('grammar/en/lessons.json')),
      json<{ sizes: Record<string, number> }>(assetUrl('grammar/en/exercises/index.json')),
    ]);
    if (!points || !lessons) return null;
    return { points: points.points, traps: points.traps, lessons: lessons.lessons, bankSizes: index?.sizes ?? {} };
  })();
  return cache;
}

const banks = new Map<string, Promise<Exercise[]>>();

/** Banque d'exercices d'une leçon (vide tant que la CI ne l'a pas préparée). */
export function loadExercises(lessonId: string): Promise<Exercise[]> {
  let p = banks.get(lessonId);
  if (!p) {
    p = json<{ items: Exercise[] }>(assetUrl(`grammar/en/exercises/${encodeURIComponent(lessonId)}.json`)).then((d) =>
      (d?.items ?? []).map((ex) => (ex.choices ? { ...ex, choices: shuffledChoices(ex.choices, ex.id) } : ex)),
    );
    banks.set(lessonId, p);
  }
  return p;
}

export function useGrammarData(): GrammarData | null | undefined {
  const [data, setData] = useState<GrammarData | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadGrammarData().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** Questions du test de placement (banque préparée par la CI, plus les questions rédigées). */
export function loadPlacementItems(): Promise<PlacementItem[]> {
  return json<{ items: PlacementItem[] }>(assetUrl('grammar/en/placement.json')).then((d) => d?.items ?? []);
}
