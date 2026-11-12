import { authConfigured, supabase } from './auth';

/**
 * Appel d'une fonction Supabase facultative (correction LanguageTool, notation de la prononciation) : un service
 * absent (non déployé, non configuré, compte non autorisé, hors ligne) n'est pas réinterrogé pendant 10 minutes et
 * se signale par `ServiceUnavailable` (silencieuse : l'exercice continue sans lui).
 */
export class ServiceUnavailable extends Error {
  constructor(
    message: string,
    readonly silent = true,
  ) {
    super(message);
  }
}

const RETRY_AFTER_MS = 10 * 60_000;
const unavailableUntil = new Map<string, number>();

export async function invokeOptional(name: string, body: Record<string, unknown>): Promise<unknown> {
  if (!authConfigured || Date.now() < (unavailableUntil.get(name) ?? 0)) throw new ServiceUnavailable(`${name} indisponible`);
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (!error) return data;
  const status = Number((error as { context?: { status?: number } }).context?.status ?? 0);
  if ([0, 401, 403, 404, 503].includes(status)) unavailableUntil.set(name, Date.now() + RETRY_AFTER_MS);
  const reason =
    status === 404
      ? `fonction « ${name} » non déployée`
      : status === 503
        ? `fonction « ${name} » non configurée (secrets manquants)`
        : status === 429
          ? 'quota atteint'
          : status === 401 || status === 403
            ? 'compte non autorisé'
            : status === 0
              ? 'service injoignable'
              : `erreur du serveur (${status})`;
  throw new ServiceUnavailable(reason, [0, 401, 403, 404, 503].includes(status));
}

/** Test depuis les Paramètres : null si le service répond, sinon la raison. */
export async function checkService(name: string): Promise<string | null> {
  unavailableUntil.delete(name);
  try {
    await invokeOptional(name, { check: true });
    return null;
  } catch (err) {
    unavailableUntil.delete(name);
    return err instanceof Error ? err.message : String(err);
  }
}
