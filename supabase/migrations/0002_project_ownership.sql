-- StorySync: project ownership + consent-based deletion
-- Project creator is the admin; deletion requires every other contributor to approve.

-- Admin of the project (username of the creator). NULL for seeded projects:
-- the first user to join a seeded project becomes its admin.
alter table public.projects add column if not exists created_by text;

-- Users who have ever generated an image in a project (co-contributors whose
-- consent is required before the admin can delete the project).
create table if not exists public.project_contributors (
  project_id text not null references public.projects(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, username)
);

-- One pending deletion request per project at a time.
create table if not exists public.project_delete_requests (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  requested_by text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_delete_requests_project on public.project_delete_requests(project_id, status);

-- Each contributor's answer to a deletion request.
create table if not exists public.project_delete_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.project_delete_requests(id) on delete cascade,
  username text not null,
  approved boolean not null,
  created_at timestamptz not null default now(),
  unique (request_id, username)
);

-- RLS: anon may read (realtime + any direct reads); writes are service-role only.
alter table public.project_contributors enable row level security;
alter table public.project_delete_requests enable row level security;
alter table public.project_delete_responses enable row level security;

create policy "anon can read project_contributors" on public.project_contributors for select using (true);
create policy "anon can read project_delete_requests" on public.project_delete_requests for select using (true);
create policy "anon can read project_delete_responses" on public.project_delete_responses for select using (true);

grant usage on schema public to anon, authenticated, service_role;
grant select on public.project_contributors, public.project_delete_requests, public.project_delete_responses to anon, authenticated;
grant all on public.project_contributors, public.project_delete_requests, public.project_delete_responses to service_role;

-- Realtime: broadcast deletion request/response changes to connected clients.
alter publication supabase_realtime add table public.project_delete_requests;
alter publication supabase_realtime add table public.project_delete_responses;
