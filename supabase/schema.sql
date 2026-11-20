-- Animated Motion Diagram — gallery schema
-- Run this in Supabase → SQL Editor on a fresh project.
--
-- If you created the first experimental `templates` table with a uuid id,
-- it was never used in production. Drop it before running this file:
--   drop table if exists public.templates;

create table if not exists public.templates (
  id text primary key,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 200),
  -- Same shape as the "Save .json" export of the app.
  data jsonb not null,
  published boolean not null default true,
  -- "github" rows are managed by the publish workflow and can be pruned.
  source text not null default 'github',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_published_created_idx
  on public.templates (published, created_at desc);

alter table public.templates enable row level security;

drop policy if exists "read published templates" on public.templates;
create policy "read published templates"
  on public.templates for select
  using (published = true);

revoke all on public.templates from anon, authenticated;
grant select on public.templates to anon, authenticated;
grant all on public.templates to service_role;

create table if not exists public.themes (
  id text primary key,
  name text not null check (char_length(name) between 1 and 40),
  -- Full Theme object, exactly as exported by the app.
  data jsonb not null,
  published boolean not null default true,
  source text not null default 'github',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists themes_published_created_idx
  on public.themes (published, created_at desc);

alter table public.themes enable row level security;

drop policy if exists "read published themes" on public.themes;
create policy "read published themes"
  on public.themes for select
  using (published = true);

revoke all on public.themes from anon, authenticated;
grant select on public.themes to anon, authenticated;
grant all on public.themes to service_role;
