/**
 * Doublures des modules Deno des fonctions Supabase (jsr:, npm:), pour exécuter leur code sous Vitest
 * (alias dans vite.config.ts, section test). Chaque test règle `edge` avant d'importer la fonction.
 */
type Row = Record<string, unknown>;

export const edge = {
  tables: {} as Record<string, Row[]>,
  /** Envoi : lève l'erreur renvoyée (statusCode), sinon réussit. */
  send: (_endpoint: string): { statusCode: number } | null => null,
  sent: [] as { endpoint: string; payload: string }[],
  /** Utilisateur connecté (auth.getUser) ; null : jeton refusé. */
  user: { email: 'a@example.com' } as { email: string } | null,
};

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private patch: Row | null = null;
  private remove = false;
  constructor(private table: string) {}
  select() {
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  delete() {
    this.remove = true;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  gte(col: string, v: number) {
    this.filters.push((r) => Number(r[col]) >= v);
    return this;
  }
  then<T>(resolve: (v: { data: Row[]; error: null }) => T) {
    const rows = (edge.tables[this.table] ??= []);
    const hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.patch) for (const r of hit) Object.assign(r, this.patch);
    if (this.remove) edge.tables[this.table] = rows.filter((r) => !hit.includes(r));
    return Promise.resolve(resolve({ data: hit.map((r) => ({ ...r })), error: null }));
  }
}

export function createClient() {
  return {
    from: (table: string) => new Query(table),
    auth: { getUser: async () => (edge.user ? { data: { user: edge.user }, error: null } : { data: { user: null }, error: new Error('jwt') }) },
  };
}

const webpush = {
  setVapidDetails() {},
  async sendNotification(sub: { endpoint: string }, payload: string) {
    const err = edge.send(sub.endpoint);
    if (err) throw Object.assign(new Error('push failed'), err);
    edge.sent.push({ endpoint: sub.endpoint, payload });
  },
};
export default webpush;
