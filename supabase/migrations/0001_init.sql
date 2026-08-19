-- StorySync MVP schema
-- Applied via `supabase db reset` (local) or `supabase db push` (cloud).

-- Lightweight usernames (not accounts).
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  created_at timestamptz not null default now()
);

-- Seeded projects; id is a slug such as 'project_deepsea'.
create table if not exists public.projects (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  position int not null,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image_versions (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  created_by text not null,
  version_number int not null,
  image_url text not null,
  prompt text not null,
  created_at timestamptz not null default now(),
  unique (scene_id, created_by, version_number)
);

alter table public.scenes
  drop constraint if exists scenes_current_version_fk;
alter table public.scenes
  add constraint scenes_current_version_fk
  foreign key (current_version_id) references public.image_versions(id);

-- Temporary collaborative sessions (heartbeat + expiry, no accounts).
create table if not exists public.active_sessions (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  project_id text not null references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_active_sessions_username on public.active_sessions(username);
create index if not exists idx_active_sessions_project on public.active_sessions(project_id, last_seen_at);
create index if not exists idx_scenes_project on public.scenes(project_id, position);
create index if not exists idx_versions_scene on public.image_versions(scene_id, created_at desc);

-- Realtime DELETE events are dropped when the row image is PK-only under RLS;
-- full replica identity makes presence-leave events deliverable.
alter table public.active_sessions replica identity full;

-- Storage bucket for generated scene images (public read).
insert into storage.buckets (id, name, public)
values ('scene-images', 'scene-images', true)
on conflict (id) do nothing;

-- Realtime: broadcast changes on these tables to subscribed clients.
alter publication supabase_realtime add table public.active_sessions;
alter publication supabase_realtime add table public.scenes;
alter publication supabase_realtime add table public.image_versions;

-- RLS: anonymous clients may read (required for realtime subscriptions);
-- all writes happen server-side with the service-role key, which bypasses RLS.
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.scenes enable row level security;
alter table public.image_versions enable row level security;
alter table public.active_sessions enable row level security;

create policy "anon can read users" on public.users for select using (true);
create policy "anon can read projects" on public.projects for select using (true);
create policy "anon can read scenes" on public.scenes for select using (true);
create policy "anon can read image_versions" on public.image_versions for select using (true);
create policy "anon can read active_sessions" on public.active_sessions for select using (true);

-- Table privileges: anon/authenticated read (realtime), service_role full access.
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
