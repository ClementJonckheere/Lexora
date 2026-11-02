import { beforeEach, describe, expect, it, vi } from 'vitest';
import { edge } from './edgeStubs';

/** Fonction Supabase `reminders` (supabase/functions/reminders/index.ts), exécutée avec Deno simulé. */
let handler: (req: Request) => Promise<Response>;
const env: Record<string, string> = { CRON_SECRET: 's', VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k', SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'r' };
vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => (handler = h) });
// Chemin en variable : la fonction est du code Deno, hors du contrôle de types de l'application.
const fn = '../../supabase/functions/reminders/index';
await import(/* @vite-ignore */ fn);

const run = () => handler(new Request('https://x/reminders', { method: 'POST', headers: { 'x-cron-secret': 's' } }));
// 19 h 05 à Paris (UTC+1 en novembre), rappel prévu à 19 h.
const NOW = Date.UTC(2026, 10, 2, 18, 5);

describe('fonction reminders', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    edge.sent = [];
    edge.send = () => null;
    edge.tables = {
      push_subscriptions: [{ endpoint: 'e1', user_id: 'u1', p256dh: 'k', auth: 'a', time_zone: 'Europe/Paris', hour: 19, minute: 0, day_start_hour: 4, last_sent_day: null }],
      review_logs: [1, 2, 3].map((d) => ({ user_id: 'u1', deleted: 0, reviewed_at: NOW - d * 86_400_000 })),
      streak_shields: [],
    };
  });

  it('refuse un appel sans le secret', async () => {
    expect((await handler(new Request('https://x', { method: 'POST' }))).status).toBe(401);
  });

  it('envoie la série en jeu, une seule fois par jour', async () => {
    await run();
    await run();
    expect(edge.sent).toHaveLength(1);
    expect(JSON.parse(edge.sent[0].payload).title).toBe("3 jours d'affilée");
  });

  it('une erreur passagère est retentée au passage suivant', async () => {
    edge.send = () => ({ statusCode: 503 });
    await run();
    expect(edge.tables.push_subscriptions[0].last_sent_day).toBeNull();
    edge.send = () => null;
    await run();
    expect(edge.sent).toHaveLength(1);
    expect(edge.tables.push_subscriptions[0].last_sent_day).toBe('2026-11-02');
  });

  it("rien si l'on a déjà révisé aujourd'hui ; abonnement expiré oublié", async () => {
    edge.tables.review_logs.push({ user_id: 'u1', deleted: 0, reviewed_at: NOW - 3600_000 });
    await run();
    expect(edge.sent).toHaveLength(0);
    edge.tables.review_logs.pop();
    edge.tables.push_subscriptions[0].last_sent_day = null;
    edge.send = () => ({ statusCode: 410 });
    await run();
    expect(edge.tables.push_subscriptions).toHaveLength(0);
  });

  it("hors de l'heure du rappel : rien", async () => {
    edge.tables.push_subscriptions[0].hour = 21;
    await run();
    expect(edge.sent).toHaveLength(0);
  });
});
