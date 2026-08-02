-- Single-row JSON blob store for the whole app's state, replacing localStorage.
-- Shape of `data` matches the existing client-side appData object exactly:
--   { kids: [...], settings: {...}, transactions: [...] }
create table if not exists family_data (
  id         integer primary key default 1 check (id = 1),  -- singleton row
  data       jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into family_data (id, data)
values (
  1,
  '{"kids":[],"settings":{"allowanceDay":"sunday","lastAllowanceDate":null,"rotationWeek":1},"transactions":[]}'::jsonb
)
on conflict (id) do nothing;

alter table family_data enable row level security;

-- No policy exists for the `anon` role. RLS default-denies, so the anon key
-- alone (unavoidably visible in frontend source) cannot read or write
-- anything without a real authenticated session. Do not add a permissive
-- policy for `anon` "to get it working" -- that defeats the whole model.
create policy "authenticated full access" on family_data
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- RLS policies only take effect once the underlying role has base table
-- privileges at all -- without this grant, `authenticated` gets a flat
-- "permission denied" (42501) before the policy above is ever evaluated.
-- No delete: the app never removes the singleton row.
grant select, insert, update on public.family_data to authenticated;
