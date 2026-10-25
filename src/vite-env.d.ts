/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du projet Supabase (https://xxxx.supabase.co). */
  readonly VITE_SUPABASE_URL?: string;
  /** Clé publique « anon » / « publishable » du projet Supabase. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
