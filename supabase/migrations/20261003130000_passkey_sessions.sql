-- Chat authentication BFF: no browser access to credentials, challenges or sessions.
create table public.account_roles (
 account_id uuid primary key references public.accounts(id) on delete restrict,
 role text not null check (role in ('user','admin','super_admin'))
);
create table public.auth_passkeys (
 id text primary key, account_id uuid not null references public.accounts(id) on delete restrict,
 origin text not null, rp_id text not null, public_key bytea not null check(octet_length(public_key)>0),
 counter bigint not null check(counter>=0), device_type text not null check(device_type in ('singleDevice','multiDevice')),
 backed_up boolean not null, created_at timestamptz not null default clock_timestamp()
);
create index auth_passkeys_account_idx on public.auth_passkeys(account_id,id);
create table public.auth_challenges (
 id uuid primary key, kind text not null check(kind in ('enroll','login')),
 account_id uuid references public.accounts(id) on delete restrict,
 origin text not null, challenge text not null, browser_hash bytea not null check(octet_length(browser_hash)=32),
 payload jsonb not null, expires_at timestamptz not null,
 taken_at timestamptz, completed_at timestamptz, created_at timestamptz not null default clock_timestamp()
);
create index auth_challenges_expiry_idx on public.auth_challenges(expires_at,id);
create table public.chat_sessions (
 token_hash bytea primary key check(octet_length(token_hash)=32),
 account_id uuid not null references public.accounts(id) on delete restrict,
 device_id uuid not null references public.devices(id) on delete restrict,
 origin text not null, expires_at timestamptz not null, last_seen_at timestamptz not null,
 revoked_at timestamptz, created_at timestamptz not null default clock_timestamp()
);
create index chat_sessions_device_idx on public.chat_sessions(device_id,created_at) where revoked_at is null;
create index chat_sessions_expiry_idx on public.chat_sessions(expires_at);
create table public.device_key_packages (
 device_id uuid primary key references public.devices(id) on delete restrict,
 key_package bytea not null check(octet_length(key_package)>0), created_at timestamptz not null default clock_timestamp()
);
create table public.auth_rate_buckets (
 key text primary key, window_started_at timestamptz not null, attempts bigint not null check(attempts>=0)
);
create table public.admin_audit (
 sequence bigint generated always as identity primary key,
 canonical_event text not null, previous_hash bytea not null check(octet_length(previous_hash)=32), event_hash bytea not null check(octet_length(event_hash)=32),
 created_at timestamptz not null default clock_timestamp()
);
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ declare t text; begin
 foreach t in array array['account_roles','auth_passkeys','auth_challenges','chat_sessions','device_key_packages','auth_rate_buckets','admin_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on sequence public.admin_audit_sequence_seq from public,anon,authenticated,service_role;

create function public.auth_setting(p_key text) returns integer
language plpgsql security definer set search_path='' as $$
declare v text; begin
 select value::text into v from public.app_settings where key=p_key;
 if v is null or v !~ '^[1-9][0-9]*$' then raise exception 'AUTH_POLICY_MISSING'; end if;
 return v::integer;
end $$;
revoke all on function public.auth_setting(text) from public,anon,authenticated;

create function public.guard_last_super_admin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('vault.roles'));
 if old.role='super_admin' and (tg_op='DELETE' or new.role <> 'super_admin') then
  -- Row locks also fence repeatable-read snapshots: a concurrently changed
  -- super-admin row must cause serialization failure, never write skew.
  perform 1 from public.account_roles where role='super_admin' order by account_id for update;
  if not exists(select 1 from public.account_roles where role='super_admin' and account_id<>old.account_id) then raise exception 'LAST_SUPER_ADMIN'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.guard_last_super_admin() from public,anon,authenticated;
create trigger preserve_super_admin before update or delete on public.account_roles
 for each row execute function public.guard_last_super_admin();

create function public.vault_auth(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_now timestamptz := clock_timestamp(); v_account uuid; v_device uuid; v_status text;
 v_activation public.account_activations%rowtype; v_challenge public.auth_challenges%rowtype;
 v_passkey public.auth_passkeys%rowtype; v_session public.chat_sessions%rowtype;
 v_hash bytea; v_ttl integer; v_limit integer; v_count bigint; v_payload jsonb;
 v_previous bytea; v_event text; v_key text; v_value jsonb;
begin
 if p_action='settings' then
  return (select coalesce(jsonb_object_agg(key,value),'{}') from public.app_settings where key in (
   'activation_ttl_seconds','auth_challenge_ttl_seconds','chat_session_ttl_seconds','chat_session_idle_seconds',
   'auth_rate_window_seconds','auth_global_requests_per_window','auth_account_requests_per_window','max_users',
   'max_devices_per_account','max_passkeys_per_account','max_auth_body_bytes','max_key_package_bytes',
   'max_wire_bytes','max_snapshot_bytes','max_outbox','min_password_bytes','max_password_bytes',
   'min_kdf_ops','max_kdf_ops','min_kdf_memory_bytes','max_kdf_memory_bytes','create_kdf_ops','create_kdf_memory_bytes',
   'max_identity_bytes','max_directory_entries','max_credential_bytes','auth_cleanup_rows_per_request'));
 elsif p_action='rate' then
  v_key := coalesce(p_input->>'account_id','global');
  v_limit := public.auth_setting(case when v_key='global' then 'auth_global_requests_per_window' else 'auth_account_requests_per_window' end);
  v_ttl := public.auth_setting('auth_rate_window_seconds');
  if v_key='global' then
   -- Indexed, bounded maintenance: old bearer challenges/sessions do not grow
   -- forever; audit events and account/device records are never pruned here.
   v_count := public.auth_setting('auth_cleanup_rows_per_request');
   delete from public.auth_challenges where id in (select id from public.auth_challenges where expires_at<=v_now order by expires_at,id limit v_count);
   delete from public.chat_sessions where token_hash in (select token_hash from public.chat_sessions where expires_at<=v_now order by expires_at limit v_count);
  end if;
  insert into public.auth_rate_buckets(key,window_started_at,attempts) values(v_key,v_now,1)
   on conflict(key) do update set
    attempts=case when auth_rate_buckets.window_started_at + make_interval(secs=>v_ttl)<=v_now then 1 else auth_rate_buckets.attempts+1 end,
    window_started_at=case when auth_rate_buckets.window_started_at + make_interval(secs=>v_ttl)<=v_now then v_now else auth_rate_buckets.window_started_at end
   returning attempts into v_count;
  return jsonb_build_object('allowed',v_count<=v_limit);
 elsif p_action='bootstrap' or p_action='operator_create_account' then
  -- Trusted operator CLI only. No corresponding browser route exists.
  perform pg_advisory_xact_lock(hashtext('vault.roles'));
  if p_action='bootstrap' and exists(select 1 from public.account_roles where role='super_admin') then raise exception 'BOOTSTRAP_ALREADY_COMPLETE'; end if;
  if p_action='operator_create_account' and not exists(select 1 from public.account_roles where role='super_admin') then raise exception 'BOOTSTRAP_REQUIRED'; end if;
  if p_action='bootstrap' then
   for v_key,v_value in select * from jsonb_each(p_input->'settings') loop
    if v_key !~ '^[a-z][a-z0-9_]*$' or v_value::text !~ '^[1-9][0-9]*$' then raise exception 'AUTH_POLICY_MISSING'; end if;
    insert into public.app_settings(key,value) values(v_key,v_value) on conflict(key) do update set value=excluded.value;
   end loop;
  end if;
  if (select count(*) from public.accounts) >= public.auth_setting('max_users') then raise exception 'ACCOUNT_LIMIT'; end if;
  v_account := gen_random_uuid();
  insert into public.accounts(id) values(v_account);
  insert into public.account_roles(account_id,role) values(v_account,case when p_action='bootstrap' then 'super_admin' else 'user' end);
  perform public.issue_account_activation(v_account,decode(p_input->>'token_hash','hex'));
  select event_hash into v_previous from public.admin_audit order by sequence desc limit 1;
  v_previous := coalesce(v_previous,decode(repeat('00',32),'hex'));
  v_event := jsonb_build_object('actor','trusted_operator','action',p_action,'target',v_account,'time',v_now)::text;
  insert into public.admin_audit(canonical_event,previous_hash,event_hash) values(v_event,v_previous,extensions.digest(v_previous||convert_to(v_event,'UTF8'),'sha256'));
  return jsonb_build_object('account_id',v_account);
 elsif p_action='activation_info' or p_action='begin_enroll' then
  v_hash := decode(p_input->>'token_hash','hex');
  select * into v_activation from public.account_activations where token_hash=v_hash;
  if v_activation.id is null then raise exception 'AUTH_UNAVAILABLE'; end if;
  select status into v_status from public.accounts where id=v_activation.account_id for update;
  select * into v_activation from public.account_activations where token_hash=v_hash for update;
  if v_status <> 'pending' or v_activation.consumed_at is not null or v_activation.revoked_at is not null or v_activation.expires_at<=clock_timestamp() then raise exception 'AUTH_UNAVAILABLE'; end if;
  if p_action='activation_info' then return jsonb_build_object('account_id',v_activation.account_id); end if;
  if octet_length(decode(p_input->>'public_key','hex'))<>32 then raise exception 'AUTH_UNAVAILABLE'; end if;
  if octet_length(decode(p_input->>'key_package','hex')) not between 1 and public.auth_setting('max_key_package_bytes') then raise exception 'AUTH_UNAVAILABLE'; end if;
  insert into public.auth_challenges(id,kind,account_id,origin,challenge,browser_hash,payload,expires_at)
   values((p_input->>'id')::uuid,'enroll',v_activation.account_id,p_input->>'origin',p_input->>'challenge',decode(p_input->>'browser_hash','hex'),
    jsonb_build_object('token_hash',p_input->>'token_hash','device_id',p_input->>'device_id','public_key',p_input->>'public_key','key_package',p_input->>'key_package'),
    least(v_activation.expires_at,v_now+make_interval(secs=>public.auth_setting('auth_challenge_ttl_seconds'))));
  return jsonb_build_object('account_id',v_activation.account_id);
 elsif p_action='begin_login' then
  select d.account_id,encode(d.signature_public_key,'hex') into v_account,v_key
   from public.devices d join public.accounts a on a.id=d.account_id
   where d.id=(p_input->>'device_id')::uuid and d.revoked_at is null and a.status='active';
  if v_account is null then raise exception 'AUTH_UNAVAILABLE'; end if;
  insert into public.auth_challenges(id,kind,account_id,origin,challenge,browser_hash,payload,expires_at)
   values((p_input->>'id')::uuid,'login',v_account,p_input->>'origin',p_input->>'challenge',decode(p_input->>'browser_hash','hex'),jsonb_build_object('device_id',p_input->>'device_id','public_key',v_key),clock_timestamp()+make_interval(secs=>public.auth_setting('auth_challenge_ttl_seconds')));
  return jsonb_build_object('account_id',v_account);
 elsif p_action='take_challenge' then
  update public.auth_challenges set taken_at=clock_timestamp() where id=(p_input->>'id')::uuid
   and browser_hash=decode(p_input->>'browser_hash','hex') and origin=p_input->>'origin'
   and taken_at is null and expires_at>clock_timestamp() returning * into v_challenge;
  if v_challenge.id is null then raise exception 'AUTH_UNAVAILABLE'; end if;
  return to_jsonb(v_challenge);
 elsif p_action='credential' then
  select * into v_passkey from public.auth_passkeys where id=p_input->>'id' and origin=p_input->>'origin';
  if v_passkey.id is null then raise exception 'AUTH_UNAVAILABLE'; end if;
  return to_jsonb(v_passkey)||jsonb_build_object('public_key',encode(v_passkey.public_key,'hex'));
 elsif p_action='finish_enroll' or p_action='finish_login' then
  select * into v_challenge from public.auth_challenges where id=(p_input->>'challenge_id')::uuid;
  if v_challenge.id is null then raise exception 'AUTH_UNAVAILABLE'; end if;
  if p_action='finish_enroll' then v_account := v_challenge.account_id;
  else select account_id into v_account from public.auth_passkeys where id=p_input->>'credential_id' and origin=v_challenge.origin; end if;
  if v_account is null then raise exception 'AUTH_UNAVAILABLE'; end if;
  select status into v_status from public.accounts where id=v_account for update;
  select * into v_challenge from public.auth_challenges where id=(p_input->>'challenge_id')::uuid for update;
  if v_challenge.taken_at is null or v_challenge.completed_at is not null or v_challenge.expires_at<=clock_timestamp()
   or v_challenge.origin is distinct from p_input->>'origin' or v_challenge.browser_hash is distinct from decode(p_input->>'browser_hash','hex')
   or v_challenge.account_id is distinct from v_account then raise exception 'AUTH_UNAVAILABLE'; end if;
  v_device := (v_challenge.payload->>'device_id')::uuid;
  if p_action='finish_enroll' then
   if v_challenge.kind<>'enroll' or v_status<>'pending' then raise exception 'AUTH_UNAVAILABLE'; end if;
   v_limit := public.auth_setting('max_passkeys_per_account');
   if (select count(*) from public.auth_passkeys where account_id=v_account)>=v_limit then raise exception 'ACCOUNT_LIMIT'; end if;
   if (select count(*) from public.devices where account_id=v_account and revoked_at is null)>=public.auth_setting('max_devices_per_account') then raise exception 'ACCOUNT_LIMIT'; end if;
   perform public.complete_account_activation(decode(v_challenge.payload->>'token_hash','hex'),v_device,decode(v_challenge.payload->>'public_key','hex'));
   insert into public.auth_passkeys(id,account_id,origin,rp_id,public_key,counter,device_type,backed_up)
    values(p_input->>'credential_id',v_account,v_challenge.origin,p_input->>'rp_id',decode(p_input->>'credential_public_key','hex'),(p_input->>'counter')::bigint,p_input->>'device_type',(p_input->>'backed_up')::boolean);
   insert into public.device_key_packages(device_id,key_package) values(v_device,decode(v_challenge.payload->>'key_package','hex'));
  else
   if v_challenge.kind<>'login' or v_status<>'active' then raise exception 'AUTH_UNAVAILABLE'; end if;
   select * into v_passkey from public.auth_passkeys where id=p_input->>'credential_id' for update;
   if v_passkey.counter<>(p_input->>'old_counter')::bigint or (p_input->>'counter')::bigint<v_passkey.counter then raise exception 'AUTH_UNAVAILABLE'; end if;
   if not exists(select 1 from public.devices where id=v_device and account_id=v_account and revoked_at is null) then raise exception 'DEVICE_UNAVAILABLE'; end if;
   update public.auth_passkeys set counter=(p_input->>'counter')::bigint,backed_up=(p_input->>'backed_up')::boolean where id=v_passkey.id;
  end if;
  -- A device login replaces prior sessions for that same device, a security
  -- fencing rule, not a configurable multi-device participant limit.
  update public.chat_sessions set revoked_at=clock_timestamp() where device_id=v_device and revoked_at is null;
  v_now := clock_timestamp(); v_ttl := public.auth_setting('chat_session_ttl_seconds');
  insert into public.chat_sessions(token_hash,account_id,device_id,origin,expires_at,last_seen_at)
   values(decode(p_input->>'session_hash','hex'),v_account,v_device,v_challenge.origin,v_now+make_interval(secs=>v_ttl),v_now);
  update public.auth_challenges set completed_at=v_now where id=v_challenge.id;
  return jsonb_build_object('account_id',v_account,'device_id',v_device,'session_ttl_seconds',v_ttl);
 elsif p_action='session' or p_action='logout' then
  v_hash := decode(p_input->>'session_hash','hex');
  if p_action='logout' then update public.chat_sessions set revoked_at=v_now where token_hash=v_hash and origin=p_input->>'origin'; return '{}'::jsonb; end if;
  select * into v_session from public.chat_sessions where token_hash=v_hash and origin=p_input->>'origin' for update;
  v_now := clock_timestamp();
  if v_session.token_hash is null or v_session.revoked_at is not null or v_session.expires_at<=v_now or v_session.last_seen_at+make_interval(secs=>public.auth_setting('chat_session_idle_seconds'))<=v_now then raise exception 'AUTH_UNAVAILABLE'; end if;
  if not exists(select 1 from public.accounts where id=v_session.account_id and status='active') or not exists(select 1 from public.devices where id=v_session.device_id and account_id=v_session.account_id and revoked_at is null) then raise exception 'AUTH_UNAVAILABLE'; end if;
  update public.chat_sessions set last_seen_at=v_now where token_hash=v_hash;
  return jsonb_build_object('account_id',v_session.account_id,'device_id',v_session.device_id,'role',(select role from public.account_roles where account_id=v_session.account_id));
 end if;
 raise exception 'AUTH_UNAVAILABLE';
end $$;
revoke all on function public.vault_auth(text,jsonb) from public,anon,authenticated;
grant execute on function public.vault_auth(text,jsonb) to service_role;
