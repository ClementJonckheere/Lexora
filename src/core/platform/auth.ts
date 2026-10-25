import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { isTauri } from './env';

/**
 * Compte utilisateur : connexion Google via Supabase Auth (flux PKCE).
 *
 * - Application de bureau : l'URL Google s'ouvre dans le navigateur système ; le retour arrive
 *   sur un mini-serveur local (http://127.0.0.1:47821…, côté Rust) puis le code est échangé
 *   contre une session.
 * - Navigateur (aperçu) : redirection classique vers la page.
 * La session est conservée localement : l'application reste utilisable hors ligne.
 */

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** Seule l'origine compte (https://xxxx.supabase.co) : un chemin collé par erreur (/auth/v1/callback…) est ignoré. */
function projectOrigin(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  try {
    return new URL(v).origin;
  } catch {
    return v.replace(/\/+$/, '');
  }
}

const URL_ = projectOrigin(import.meta.env.VITE_SUPABASE_URL);
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const authConfigured = Boolean(URL_ && KEY);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!authConfigured) throw new Error('Supabase n’est pas configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  if (!client) {
    client = createClient(URL_!, KEY!, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !isTauri(),
        storageKey: 'lexora-auth',
      },
    });
  }
  return client;
}

export function toUser(session: Session | null): AccountUser | null {
  const u = session?.user;
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: u.id,
    email: u.email ?? '',
    name: (meta.full_name as string) || (meta.name as string) || u.email || 'Compte',
    avatarUrl: (meta.avatar_url as string) || (meta.picture as string) || null,
  };
}

/** Session mémorisée (fonctionne hors ligne : aucune requête réseau obligatoire). */
export async function currentUser(): Promise<AccountUser | null> {
  if (!authConfigured) return null;
  const { data } = await supabase().auth.getSession();
  return toUser(data.session);
}

const LOGIN_TIMEOUT = 5 * 60_000;

export async function signInWithGoogle(): Promise<AccountUser | null> {
  const sb = supabase();
  if (!isTauri()) {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    return null; // la page est redirigée
  }

  const [{ invoke }, { listen }, { openUrl }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
    import('@tauri-apps/plugin-opener'),
  ]);
  const port = await invoke<number>('oauth_start');
  const callback = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connexion expirée : réessayez.')), LOGIN_TIMEOUT);
    void listen<string>('oauth-callback', (e) => {
      clearTimeout(timer);
      resolve(e.payload);
    }).then((unlisten) => void callback.finally(unlisten).catch(() => undefined));
  });

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `http://127.0.0.1:${port}/`, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) throw error ?? new Error('Adresse de connexion indisponible.');
  await openUrl(data.url);

  const path = await callback;
  const params = new URL(path, 'http://127.0.0.1').searchParams;
  const code = params.get('code');
  if (!code) throw new Error(params.get('error_description') ?? 'Connexion refusée.');
  const { data: exchanged, error: exErr } = await sb.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;
  return toUser(exchanged.session);
}

export async function signOut(): Promise<void> {
  if (!authConfigured) return;
  // « local » : déconnecte cet appareil même hors ligne.
  await supabase().auth.signOut({ scope: 'local' });
}
