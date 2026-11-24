-- Self Love Bank ledger sync.
-- Run this once in the Supabase SQL editor on a free-plan project.
-- One row per signed-in account and entry id.
-- An untap is stored on the row (entry.undone = true). Rows are not deleted.

create table if not exists public.ledger_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_id text not null,
  entry jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_id),
  constraint ledger_entries_object check (jsonb_typeof(entry) = 'object'),
  constraint ledger_entries_id_matches check (entry_id = entry->>'id'),
  constraint ledger_entries_size check (octet_length(entry::text) <= 12000)
);

alter table public.ledger_entries enable row level security;
alter table public.ledger_entries force row level security;

revoke all on table public.ledger_entries from public;
revoke all on table public.ledger_entries from anon;
grant select, insert, update on table public.ledger_entries to authenticated;

drop policy if exists ledger_select_own on public.ledger_entries;
create policy ledger_select_own
  on public.ledger_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists ledger_insert_own on public.ledger_entries;
create policy ledger_insert_own
  on public.ledger_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists ledger_update_own on public.ledger_entries;
create policy ledger_update_own
  on public.ledger_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A later write must not clear an untap that is already stored.
create or replace function public.ledger_entries_keep_tombstone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if coalesce(old.entry->>'undone', '') = 'true'
       and coalesce(new.entry->>'undone', '') <> 'true' then
      new.entry := old.entry;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.ledger_entries_keep_tombstone() from public;
revoke all on function public.ledger_entries_keep_tombstone() from anon;
revoke all on function public.ledger_entries_keep_tombstone() from authenticated;

drop trigger if exists ledger_entries_keep_tombstone on public.ledger_entries;
create trigger ledger_entries_keep_tombstone
  before update on public.ledger_entries
  for each row
  execute function public.ledger_entries_keep_tombstone();
