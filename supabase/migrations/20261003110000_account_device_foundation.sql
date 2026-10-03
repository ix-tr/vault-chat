-- Foundation only: no account activation, token issuance or device registration API.
-- Account IDs must be bound to a server-verified JWT subject before issuing sessions.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at timestamptz not null default now()
);
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  signature_public_key bytea not null unique check (octet_length(signature_public_key) = 32),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= created_at)
);
create index devices_account_created_idx on public.devices(account_id, created_at, id);
create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null check (value <> 'null'::jsonb),
  updated_at timestamptz not null default now()
);
-- No seeded policy defaults: endpoints must fail closed when required settings
-- are absent. Role-specific settings validation belongs to those endpoints.
alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.devices enable row level security;
alter table public.devices force row level security;
alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;
revoke all on public.accounts, public.devices, public.app_settings from public, anon, authenticated;
grant select on public.accounts, public.devices to authenticated;
grant all on public.accounts, public.devices, public.app_settings to service_role;
create policy accounts_read_own on public.accounts for select to authenticated
  using ((select auth.jwt()) ->> 'session_kind' = 'chat' and id = (select auth.uid()));
create policy devices_read_own on public.devices for select to authenticated
  using ((select auth.jwt()) ->> 'session_kind' = 'chat' and account_id = (select auth.uid()) and exists (
    select 1 from public.accounts where id = devices.account_id and status = 'active'
  ));
-- No client write or settings policy. Admin JWT claims create no extra access.
