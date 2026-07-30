-- Soumya Healthy Diet Planner 1.4C shared-data schema.
-- Run this once in the Supabase SQL Editor. Personal data is intentionally absent.

create table if not exists public.shared_recipes (
  id text primary key,
  canonical_name text not null unique,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  client_id text not null
);

create table if not exists public.shared_ingredients (
  id text primary key,
  canonical_name text not null unique,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  client_id text not null
);

create index if not exists shared_recipes_updated_at_idx
  on public.shared_recipes (updated_at);
create index if not exists shared_ingredients_updated_at_idx
  on public.shared_ingredients (updated_at);

alter table public.shared_recipes enable row level security;
alter table public.shared_ingredients enable row level security;

drop policy if exists "shared recipes readable" on public.shared_recipes;
create policy "shared recipes readable"
  on public.shared_recipes for select
  to anon, authenticated
  using (true);

drop policy if exists "shared ingredients readable" on public.shared_ingredients;
create policy "shared ingredients readable"
  on public.shared_ingredients for select
  to anon, authenticated
  using (true);

create or replace function public.merge_shared_records(p_records jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  target_table regclass;
  target_id text;
  canonical text;
  incoming_revision bigint;
  incoming_updated_at timestamptz;
begin
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 5000 then
    raise exception 'p_records must be an array containing at most 5000 records';
  end if;

  for item in select value from jsonb_array_elements(p_records)
  loop
    if item->>'entity' = 'recipe' then
      target_table := 'public.shared_recipes'::regclass;
    elsif item->>'entity' = 'ingredient' then
      target_table := 'public.shared_ingredients'::regclass;
    else
      raise exception 'Unsupported shared entity';
    end if;

    canonical := lower(trim(regexp_replace(item->>'canonical_name', '\s+', ' ', 'g')));
    incoming_revision := greatest(1, coalesce((item->>'revision')::bigint, 1));
    incoming_updated_at := (item->>'updated_at')::timestamptz;
    if canonical = '' or item->>'id' is null or incoming_updated_at is null
      or jsonb_typeof(item->'payload') <> 'object' then
      raise exception 'Invalid shared record';
    end if;

    -- Serialize equal-name merges so concurrent clients cannot create two rows.
    perform pg_advisory_xact_lock(hashtext((item->>'entity') || ':' || canonical));
    execute format('select id from %s where canonical_name = $1', target_table)
      into target_id using canonical;
    target_id := coalesce(target_id, item->>'id');

    execute format(
      'insert into %s (id, canonical_name, payload, revision, updated_at, deleted_at, client_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         canonical_name = excluded.canonical_name,
         payload = excluded.payload,
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         client_id = excluded.client_id
       where excluded.updated_at > %s.updated_at
          or (excluded.updated_at = %s.updated_at and excluded.revision > %s.revision)',
      target_table, target_table, target_table, target_table
    ) using
      target_id,
      canonical,
      item->'payload',
      incoming_revision,
      incoming_updated_at,
      nullif(item->>'deleted_at', '')::timestamptz,
      coalesce(nullif(item->>'client_id', ''), 'unknown');
  end loop;
end;
$$;

revoke all on function public.merge_shared_records(jsonb) from public;
grant execute on function public.merge_shared_records(jsonb) to anon, authenticated;
grant select on public.shared_recipes, public.shared_ingredients to anon, authenticated;
revoke insert, update, delete on public.shared_recipes, public.shared_ingredients from anon, authenticated;
