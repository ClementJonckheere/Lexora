import { authConfigured, supabase } from '../platform/auth';

/**
 * Voix naturelle partagée : la fonction « speak » du projet Supabase synthétise le texte avec une voix
 * neuronale (Azure AI Speech, clé gardée sur le serveur). Réservée aux utilisateurs connectés.
 * Chaque son est gardé sur l'appareil (IndexedDB) : une expression n'est demandée qu'une fois.
 */

export class VoiceUnavailable extends Error {
  /** Service simplement absent (non déployé, hors connexion…) : repli sans avertissement. */
  constructor(
    message: string,
    readonly silent = false,
  ) {
    super(message);
  }
}

/** Fonction absente ou non configurée : on ne la réinterroge pas avant ce délai. */
const RETRY_AFTER_MS = 10 * 60_000;
let unavailableUntil = 0;

async function invoke(body: Record<string, unknown>): Promise<unknown> {
  if (!authConfigured || Date.now() < unavailableUntil) throw new VoiceUnavailable('Voix naturelle indisponible.', true);
  const { data, error } = await supabase().functions.invoke('speak', { body });
  if (!error) return data;
  const status = Number((error as { context?: { status?: number } }).context?.status ?? 0);
  // 404 : fonction non déployée ; 503 : clé non configurée ; 401/403 : compte non autorisé.
  if ([0, 401, 403, 404, 503].includes(status)) unavailableUntil = Date.now() + RETRY_AFTER_MS;
  if (status === 429) throw new VoiceUnavailable('quota de la voix naturelle atteint');
  if (status === 401 || status === 403) throw new VoiceUnavailable('compte non autorisé pour la voix naturelle', true);
  throw new VoiceUnavailable(
    status === 404 ? 'fonction « speak » non déployée' : status === 503 ? 'clé Azure non configurée sur le serveur' : `serveur (${status || 'réseau'})`,
    status === 404 || status === 503,
  );
}

/* ------------------------------------------------------------ cache --- */

const DB = 'lexora-voice';
const STORE = 'clips';

function openCache(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const cacheDb = () => (dbPromise ??= openCache());

async function cached(key: string): Promise<Blob | null> {
  const db = await cacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function store(key: string, blob: Blob): Promise<void> {
  const db = await cacheDb();
  try {
    db?.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key);
  } catch {
    /* cache facultatif */
  }
}

/* ------------------------------------------------------------- API --- */

export const cacheKey = (text: string, lang: string) => `${lang}|${text.trim().replace(/\s+/g, ' ')}`;

const pending = new Map<string, Promise<Blob>>();
const urls = new Map<string, string>();

/** URL (blob:) du son de `text` dans la langue `lang` (BCP 47, ex. « en-US »). */
export async function naturalVoiceUrl(text: string, lang: string): Promise<string> {
  const key = cacheKey(text, lang);
  const known = urls.get(key);
  if (known) return known;
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const hit = await cached(key);
      if (hit) return hit;
      const data = await invoke({ text: text.trim(), lang });
      if (!(data instanceof Blob) || data.size < 100) throw new VoiceUnavailable('réponse vide');
      const blob = data.type === 'audio/mpeg' ? data : new Blob([data], { type: 'audio/mpeg' });
      void store(key, blob);
      return blob;
    })();
    pending.set(key, p);
  }
  try {
    const url = URL.createObjectURL(await p);
    urls.set(key, url);
    return url;
  } finally {
    pending.delete(key);
  }
}

/** Vérification depuis les Paramètres (ne consomme pas de quota). */
export async function checkNaturalVoice(): Promise<void> {
  unavailableUntil = 0;
  const r = (await invoke({ check: true })) as { ok?: boolean } | null;
  if (!r?.ok) throw new VoiceUnavailable('réponse inattendue');
}
