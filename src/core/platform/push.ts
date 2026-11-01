import { authConfigured, supabase } from './auth';
import { isTauri } from './env';

/**
 * Notifications de la version web (téléphone) : le navigateur reçoit le rappel même application fermée (Web Push).
 * L'abonnement est enregistré dans Supabase (table `push_subscriptions`) avec l'heure du rappel et le fuseau ; la
 * fonction `reminders`, appelée chaque quart d'heure, envoie le rappel à cette heure si vous n'avez pas révisé
 * aujourd'hui (docs/SUPABASE.md, « Rappels sur le téléphone »).
 *
 * Clé publique d'envoi (VAPID) : la clé privée correspondante est un secret de la fonction, jamais dans le dépôt.
 */
export const VAPID_PUBLIC_KEY = 'BI2bnOFXXoP53Rrgs-1LnQ4QGiq17AE6oMnV5-j_BegoUuk-hFX6emjIRvC3PNG7VAXyY3l9-CuGclCYFqfCVt4';

export interface PushPrefs {
  hour: number;
  minute: number;
  /** Heure de bascule de la journée de révision (réglages). */
  dayStartHour: number;
}

export class PushUnavailable extends Error {}

/** Notifications possibles ici : navigateur compatible (sur iPhone, application ajoutée à l'écran d'accueil). */
export function pushSupported(): boolean {
  return !isTauri() && authConfigured && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Application web lancée depuis l'écran d'accueil (sur iPhone, seule façon de recevoir des notifications). */
export function installedAsApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new PushUnavailable("Notifications indisponibles : rouvrez Lexora depuis l'icône de l'écran d'accueil.");
  return reg;
}

async function save(sub: PushSubscription, prefs: PushPrefs): Promise<void> {
  const json = sub.toJSON();
  const { data } = await supabase().auth.getUser();
  if (!data.user) throw new PushUnavailable('Connectez-vous pour recevoir les rappels.');
  const { error } = await supabase()
    .from('push_subscriptions')
    .upsert(
      {
        user_id: data.user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hour: prefs.hour,
        minute: prefs.minute,
        day_start_hour: prefs.dayStartHour,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') throw new PushUnavailable('Rappels indisponibles : relancez supabase/schema.sql dans Supabase.');
    throw new PushUnavailable(error.message);
  }
}

/** Demande l'autorisation (à appeler sur un geste de l'utilisateur) et enregistre l'abonnement. */
export async function enablePush(prefs: PushPrefs): Promise<void> {
  if (!pushSupported()) throw new PushUnavailable("Ce navigateur ne reçoit pas de notifications. Sur iPhone : ajoutez Lexora à l'écran d'accueil, puis ouvrez-la depuis l'icône.");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushUnavailable('Notifications refusées : autorisez-les pour Lexora dans les réglages du téléphone.');
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  await save(sub, prefs);
}

/** Abonnement de cet appareil, s'il existe et que les notifications sont autorisées. */
export async function currentPush(): Promise<PushSubscription | null> {
  if (!pushSupported() || Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Heure du rappel changée (ou heure habituelle recalculée) : mise à jour de l'abonnement existant. */
export async function updatePush(prefs: PushPrefs): Promise<void> {
  const sub = await currentPush();
  if (sub) await save(sub, prefs);
}

export async function disablePush(): Promise<void> {
  const sub = await currentPush();
  if (!sub) return;
  await supabase().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
