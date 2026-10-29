-- =============================================================================
--  Lexora : schéma Supabase (PostgreSQL)
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

-- ---------------------------------------- mots connus et test de vocabulaire ---
create table if not exists public.word_marks (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mark_key           text not null,
  universe_id        uuid not null,
  word               text not null,
  known              smallint not null default 1,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0,
  primary key (user_id, mark_key)
);

create table if not exists public.vocab_tests (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  universe_id        uuid not null,
  bands              jsonb not null default '[]'::jsonb,
  vocab_size         integer not null default 0,
  false_alarm        double precision not null default 0,
  answers            jsonb not null default '[]'::jsonb,
  taken_at           bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0,
  primary key (user_id, universe_id)
);
-- Réponses brutes du test : [{ word, real, band, rank, yes, ms, corrected }] (analysables en SQL : jsonb_array_elements).
alter table public.vocab_tests add column if not exists answers jsonb not null default '[]'::jsonb;

-- Observations en lisant : recalage du test de vocabulaire.
create table if not exists public.vocab_observations (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  obs_key            text not null,
  universe_id        uuid not null,
  source             text not null check (source in ('chapter', 'select', 'exposure')),
  word               text not null,
  rank               integer,
  known              smallint not null,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0,
  primary key (user_id, obs_key)
);

-- ------------------------------------------- onglet Apprendre (grammaire) ---
create table if not exists public.grammar_answers (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  universe_id        uuid not null,
  lesson_id          text not null,
  item_id            text not null,
  correct            smallint not null,
  reported           smallint not null default 0,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0
);

-- ------------------------------------------------ progression (v2.20) ---
-- Durée de saisie des mots ajoutés depuis le formulaire (titre « Archiviste de l'instant »).
create table if not exists public.note_entries (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  universe_id        uuid not null,
  note_id            uuid not null,
  duration_ms        integer not null,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0
);

-- Révisions dont la réponse a été tapée (XP identique sur tous les appareils).
create table if not exists public.typed_answers (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_id             uuid not null,
  universe_id        uuid not null,
  created_at         bigint not null,
  updated_at         bigint not null,
  deleted            smallint not null default 0,
  server_updated_at  bigint not null default 0,
  primary key (user_id, log_id)
);

-- ------------------------------------ index, déclencheurs, sécurité (RLS) ---
do $$
declare
  t text;
begin
  foreach t in array array['universes', 'collections', 'notes', 'cards', 'review_logs', 'practice_logs', 'settings', 'books', 'word_marks', 'vocab_tests', 'vocab_observations', 'grammar_answers', 'note_entries', 'typed_answers'] loop
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

-- ------------------------------------- phrases de grammaire signalées (v2.16) ---
-- Exercices signalés « ne correspond pas à la leçon », comptés tous utilisateurs confondus. La fonction ne renvoie
-- que l'identifiant de l'exercice (leçon + phrase Tatoeba, public) et le nombre de personnes qui l'ont signalé :
-- aucune donnée personnelle. La CI de génération des exercices l'appelle avec la clé publique pour écarter ces
-- phrases des banques.
create or replace function public.grammar_reported_items()
returns table (item_id text, reporters bigint)
language sql
stable
security definer
set search_path = public
as $$
  select g.item_id, count(distinct g.user_id) as reporters
  from public.grammar_answers g
  where g.reported = 1 and g.deleted = 0
  group by g.item_id
$$;
revoke all on function public.grammar_reported_items() from public;
grant execute on function public.grammar_reported_items() to anon, authenticated;

-- ------------------------------------- réponses du placement (v2.24) ---
-- Une ligne par réponse au test de placement ou à un mini-test de leçon, tirée des réglages synchronisés (clé
-- « placement ») : de quoi repérer les questions souvent ratées par des gens qui réussissent les autres questions du même
-- point (analyse par question, par exemple dans Qlik). security_invoker : chacun ne lit que ses propres réponses.
create or replace view public.placement_answers with (security_invoker = true) as
select s.user_id, u.key as universe_id, (u.value->>'at')::bigint as answered_at, 'test'::text as source,
       a->>'q' as question_id, a->>'r' as response
from public.settings s
cross join lateral jsonb_each(s.value::jsonb) u
cross join lateral jsonb_array_elements(coalesce(u.value->'answers', '[]'::jsonb)) a
where s.key = 'placement' and u.value->>'status' = 'done'
union all
select s.user_id, u.key, (c.value->>'at')::bigint, 'lesson-check', a->>'q', a->>'r'
from public.settings s
cross join lateral jsonb_each(s.value::jsonb) u
cross join lateral jsonb_each(coalesce(u.value->'checks', '{}'::jsonb)) c
cross join lateral jsonb_array_elements(coalesce(c.value->'answers', '[]'::jsonb)) a
where s.key = 'placement' and u.value->>'status' = 'done';
revoke all on public.placement_answers from anon;
grant select on public.placement_answers to authenticated;

-- Recharge le cache de l'API pour qu'elle voie immédiatement les nouvelles colonnes.
notify pgrst, 'reload schema';
