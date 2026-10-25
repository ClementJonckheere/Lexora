/**
 * Test d'intégration du client Supabase contre une vraie API PostgREST + PostgreSQL
 * (schéma supabase/schema.sql). Ignoré par défaut ; lancer avec :
 *   LEXORA_POSTGREST=http://localhost:3999 LEXORA_JWT_SECRET=… npx vitest run supabase.integration
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { Rating } from 'ts-fsrs';
import { createMemoryDatabase } from '../db/testing';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { createNote, deleteNotes, loadNotes } from '../repo/notesRepo';
import { createUniverse, loadUniverses } from '../repo/universesRepo';
import { recordReview } from '../repo/reviewRepo';
import { saveSettings, loadSettings } from '../repo/settingsRepo';
import { createScheduler, review } from '../srs/scheduler';
import { syncOnce } from './engine';
import { SupabaseRemote } from './supabaseRemote';

const REST = process.env.LEXORA_POSTGREST;
const SECRET = process.env.LEXORA_JWT_SECRET ?? '';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(sub: string) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

describe.skipIf(!REST)('Supabase (PostgREST réel)', () => {
  let proxy: Server;
  let url = '';
  const user1 = '11111111-1111-1111-1111-111111111111';
  const user2 = '22222222-2222-2222-2222-222222222222';
  const client = (sub: string) => createClient(url, 'anon-key', { accessToken: async () => jwt(sub) });

  beforeAll(async () => {
    // supabase-js appelle /rest/v1/… ; PostgREST sert à la racine.
    const target = new URL(REST!);
    proxy = createServer((req, res) => {
      const path = (req.url ?? '/').replace(/^\/rest\/v1/, '');
      const fwd = request(
        { host: target.hostname, port: target.port, path, method: req.method, headers: { ...req.headers, host: target.host } },
        (r) => {
          res.writeHead(r.statusCode ?? 500, r.headers);
          r.pipe(res);
        },
      );
      req.pipe(fwd);
    });
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  });
  afterAll(() => proxy?.close());

  it('deux appareils convergent via Supabase ; RLS isole les comptes', async () => {
    const run = randomUUID().slice(0, 8);
    const scheduler = createScheduler({ ...DEFAULT_SETTINGS, enableFuzz: false });
    const pc = await createMemoryDatabase();
    const phone = await createMemoryDatabase();
    const remote = new SupabaseRemote(client(user1), user1);

    const u = await createUniverse(pc, `Anglais ${run}`, 'en');
    const ids: string[] = [];
    for (let i = 0; i < 200; i++) {
      ids.push(await createNote(pc, { expression: `word ${run} ${i}`, translation: `mot ${i}`, examples: [`ex ${i}`], tags: ['t'] }, { universeId: u, language: 'en' }));
    }
    await saveSettings(pc, { newPerDay: 17 });
    const first = await syncOnce(pc, remote);
    expect(first.pushed).toBe(1 + 200 * 3 + 1);

    await syncOnce(phone, new SupabaseRemote(client(user1), user1));
    const onPhone = (await loadNotes(phone)).filter((n) => n.universeId === u);
    expect(onPhone).toHaveLength(200);
    expect(onPhone.find((n) => n.id === ids[0])?.examples).toEqual(['ex 0']);
    expect((await loadSettings(phone)).newPerDay).toBe(17);

    // Révision sur le mobile, suppression sur le PC.
    const card = onPhone.find((n) => n.id === ids[1])!.cards.fr_en!;
    const out = review(scheduler, card, Rating.Good, Date.now());
    await recordReview(phone, out.card, out.log, 900);
    await deleteNotes(pc, [ids[2]]);
    await syncOnce(phone, new SupabaseRemote(client(user1), user1));
    await syncOnce(pc, remote);
    await syncOnce(phone, new SupabaseRemote(client(user1), user1));
    const pcNotes = (await loadNotes(pc)).filter((n) => n.universeId === u);
    expect(pcNotes).toHaveLength(199);
    expect(pcNotes.find((n) => n.id === ids[1])!.cards.fr_en!.reps).toBe(1);
    expect((await loadNotes(phone)).filter((n) => n.universeId === u)).toHaveLength(199);

    // Un autre compte ne voit rien.
    const stranger = await createMemoryDatabase();
    await syncOnce(stranger, new SupabaseRemote(client(user2), user2));
    expect(await loadUniverses(stranger)).toEqual([]);
  });
});
