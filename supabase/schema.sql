-- =============================================================================
--  Lexora — schéma Supabase (PostgreSQL)
--  À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
--  Le script est ré-exécutable sans risque (IF NOT EXISTS / OR REPLACE).
--
--  Principes :
--   - chaque ligne appartient à un utilisateur (user_id = auth.uid()), protégé par RLS ;
--   - « la plus récente gagne » : une écriture plus ancienne (updated_at) ne remplace jamais
--     une version plus récente ;
--   - server_updated_at (ms) est posé par le serveur à chaque écriture : c'est le curseur
--     de synchronisation des appareils ;
--   - suppressions douces (deleted = 1) pour qu'elles se propagent à tous les appareils.
-- =============================================================================

-- Horodatage serveur + « la plus récente gagne ».
create or replace function public.lexora_touch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    -- Une version plus ancienne ne remplace jamais la version stockée.
    if new.updated_at < old.updated_at then
      return old;
    end if;
    -- Le propriétaire d'une ligne ne change jamais.
    new.user_id := old.user_id;
  end if;
  new.server_updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end;
$$;

-- ----------------------------------------------------------------- univers ---
create table if not exists public.universes (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null,
  language           text not null,
  position           integer not null default 0,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0
);

-- ------------------------------------------------------------- collections ---
create table if not exists public.collections (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  universe_id        uuid not null,
  name               text not null,
  description        text not null default '',
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0
);

-- ------------------------------------------------------------------- notes ---
create table if not exists public.notes (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  universe_id        uuid not null,
  expression         text not null,
  translation        text not null,
  pronunciation      text not null default '',
  expression_key     text not null,
  comment            text not null default '',
  category           text not null default '',
  category_auto      smallint not null default 1,
  is_favorite        smallint not null default 0,
  examples           jsonb not null default '[]'::jsonb,
  tags               jsonb not null default '[]'::jsonb,
  collection_ids     jsonb not null default '[]'::jsonb,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0
);

-- --------------------------------------------------------- fiches (FSRS) ---
create table if not exists public.cards (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id            uuid not null,
  direction          text not null check (direction in ('fr_en', 'en_fr')),
  state              smallint not null default 0,
  due                bigint not null,
  stability          double precision not null default 0,
  difficulty         double precision not null default 0,
  elapsed_days       integer not null default 0,
  scheduled_days     integer not null default 0,
  learning_steps     integer not null default 0,
  reps               integer not null default 0,
  lapses             integer not null default 0,
  last_review        bigint,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0
);

-- ----------------------------------------------------- historique révisions ---
create table if not exists public.review_logs (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id            uuid not null,
  rating             smallint not null check (rating between 1 and 4),
  state              smallint not null,
  due                bigint not null,
  stability          double precision not null,
  difficulty         double precision not null,
  elapsed_days       integer not null,
  last_elapsed_days  integer not null,
  scheduled_days     integer not null,
  learning_steps     integer not null,
  reviewed_at        bigint not null,
  duration_ms        integer not null default 0,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0
);

-- --------------------------------------------------- entraînement libre ---
create table if not exists public.practice_logs (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id            uuid not null,
  mode               text not null check (mode in ('cloze', 'random', 'difficult')),
  rating             smallint not null check (rating between 1 and 4),
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0
);

-- -------------------------------------------------------------- réglages ---
create table if not exists public.settings (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key                text not null,
  value              text not null,
  updated_at         bigint not null,
  server_updated_at  bigint not null default 0,
  primary key (user_id, key)
);

-- ------------------------------------------------------- livres (lecture) ---
create table if not exists public.books (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_key           text not null,
  universe_id        uuid not null,
  title              text not null,
  authors            jsonb not null default '[]'::jsonb,
  language           text not null,
  cover_url          text not null default '',
  text_url           text not null,
  level              text not null default '',
  chapter            integer not null default 0,
  block              integer not null default 0,
  progress           double precision not null default 0,
  added_at           bigint not null,
  last_read_at       bigint,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0,
  primary key (user_id, book_key)
);

-- ------------------------------------ index, déclencheurs, sécurité (RLS) ---
do $$
declare
  t text;
begin
  foreach t in array array['universes', 'collections', 'notes', 'cards', 'review_logs', 'practice_logs', 'settings', 'books'] loop
    execute format('create index if not exists %I on public.%I (user_id, server_updated_at)', t || '_sync_idx', t);

    execute format('drop trigger if exists lexora_touch on public.%I', t);
    execute format('create trigger lexora_touch before insert or update on public.%I for each row execute function public.lexora_touch()', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lexora_own_rows" on public.%I', t);
    execute format(
      'create policy "lexora_own_rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ------------------------------------------------- évolutions (v2.1) ---
-- Suspension d'une note (exclue des révisions) et plafond de nouveaux mots par univers.
alter table public.notes add column if not exists suspended smallint not null default 0;
alter table public.universes add column if not exists new_per_day integer;
-- Recharge le cache de l'API pour qu'elle voie immédiatement les nouvelles colonnes.
notify pgrst, 'reload schema';
