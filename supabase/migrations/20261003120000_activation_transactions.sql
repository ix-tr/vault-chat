-- Server-only primitives. The caller must verify fresh device-key ownership
-- and authentication enrollment before completing activation. No public endpoint.
create table public.account_activations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);
create unique index account_activations_one_pending_idx on public.account_activations(account_id)
  where consumed_at is null and revoked_at is null;
create index account_activations_expiry_idx on public.account_activations(expires_at,id);
alter table public.account_activations enable row level security;
alter table public.account_activations force row level security;
revoke all on public.account_activations from public,anon,authenticated;
grant all on public.account_activations to service_role;

create function public.issue_account_activation(p_account uuid,p_hash bytea)
returns table(activation_id uuid,expires_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare v_status text; v_ttl text; v_now timestamptz;
begin
  if p_hash is null or octet_length(p_hash) <> 32 then raise exception 'INVALID_ACTIVATION_INPUT'; end if;
  select a.status into v_status from public.accounts a where a.id=p_account for update;
  if v_status is distinct from 'pending' then raise exception 'ACTIVATION_UNAVAILABLE'; end if;
  select s.value::text into v_ttl from public.app_settings s where s.key='activation_ttl_seconds';
  if v_ttl is null or v_ttl !~ '^[1-9][0-9]*$' then raise exception 'ACTIVATION_POLICY_MISSING'; end if;
  v_now := clock_timestamp();
  update public.account_activations set revoked_at=v_now
    where account_id=p_account and consumed_at is null and revoked_at is null;
  return query insert into public.account_activations(account_id,token_hash,created_at,expires_at)
    values(p_account,p_hash,v_now,v_now + make_interval(secs => v_ttl::integer))
    returning id,account_activations.expires_at;
end $$;

create function public.complete_account_activation(p_hash bytea,p_device uuid,p_public_key bytea)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_account uuid; v_status text; v_link public.account_activations%rowtype; v_now timestamptz;
begin
  if p_hash is null or octet_length(p_hash) <> 32 or p_device is null or p_public_key is null or octet_length(p_public_key) <> 32 then raise exception 'INVALID_ACTIVATION_INPUT'; end if;
  select account_id into v_account from public.account_activations where token_hash=p_hash;
  if v_account is null then raise exception 'ACTIVATION_UNAVAILABLE'; end if;
  -- Same account-first lock order as issuance serializes redemption and reissue.
  select status into v_status from public.accounts where id=v_account for update;
  select * into v_link from public.account_activations where token_hash=p_hash for update;
  v_now := clock_timestamp();
  if v_status is distinct from 'pending' or v_link.id is null or v_link.consumed_at is not null
    or v_link.revoked_at is not null or v_link.expires_at <= v_now then raise exception 'ACTIVATION_UNAVAILABLE'; end if;
  insert into public.devices(id,account_id,signature_public_key) values(p_device,v_account,p_public_key);
  update public.accounts set status='active' where id=v_account;
  update public.account_activations set consumed_at=v_now where id=v_link.id;
  return v_account;
end $$;
revoke all on function public.issue_account_activation(uuid,bytea) from public,anon,authenticated;
revoke all on function public.complete_account_activation(bytea,uuid,bytea) from public,anon,authenticated;
grant execute on function public.issue_account_activation(uuid,bytea) to service_role;
grant execute on function public.complete_account_activation(bytea,uuid,bytea) to service_role;
