-- Add is_archived flag to projects so users can hide projects linked to
-- production orders (which can't be hard-deleted due to the FK restrict).

alter table public.projects
  add column if not exists is_archived boolean not null default false;

create index if not exists projects_is_archived_idx on public.projects(is_archived);
