import { authConfigured, supabase } from '../platform/auth';

/**
 * DeepL partagé : la fonction « translate » du projet Supabase détient la clé DeepL
 * (secret côté serveur). Réservée aux utilisateurs connectés.
 */

export interface SharedRequest {
  text: string;
  source_lang: string;
  target_lang: string;
  context?: string;
}

export class SharedUnavailable extends Error {
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

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!authConfigured || Date.now() < unavailableUntil) throw new SharedUnavailable('Traduction DeepL partagée indisponible.', true);
  const { data, error } = await supabase().functions.invoke('translate', { body });
  if (!error) return data as T;
  const status = Number((error as { context?: { status?: number } }).context?.status ?? 0);
  // 404 : fonction non déployée ; 503 : clé non configurée ; 401/403 : compte non autorisé.
  if ([0, 401, 403, 404, 503].includes(status)) unavailableUntil = Date.now() + RETRY_AFTER_MS;
  if (status === 429) throw new SharedUnavailable('quota DeepL du mois atteint');
  if (status === 401 || status === 403) throw new SharedUnavailable('compte non autorisé pour DeepL', true);
  if (status === 0) throw new SharedUnavailable('fonction « translate » injoignable (hors ligne, ou fonction absente dans Supabase)', true);
  throw new SharedUnavailable(
    status === 404 ? 'fonction « translate » non déployée' : status === 503 ? 'clé DeepL non configurée sur le serveur' : `erreur du serveur (${status})`,
    status === 404 || status === 503,
  );
}

export async function sharedDeepl(req: SharedRequest): Promise<string> {
  const r = await call<{ text?: string }>({ ...req });
  if (!r?.text) throw new SharedUnavailable('réponse vide');
  return r.text;
}

export async function sharedDeeplUsage(): Promise<{ used: number; limit: number }> {
  unavailableUntil = 0;
  const r = await call<{ character_count?: number; character_limit?: number }>({ usage: true });
  return { used: Number(r.character_count ?? 0), limit: Number(r.character_limit ?? 0) };
}
