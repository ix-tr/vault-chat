begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
insert into public.accounts(id) values ('00000000-0000-0000-0000-000000000101'),('00000000-0000-0000-0000-000000000102');
do $$ begin
 begin perform public.issue_account_activation('00000000-0000-0000-0000-000000000101',decode(repeat('aa',32),'hex')); raise exception 'Missing policy accepted'; exception when raise_exception then if sqlerrm <> 'ACTIVATION_POLICY_MISSING' then raise; end if; end;
end $$;
insert into public.app_settings(key,value) values ('activation_ttl_seconds','900');
set local role service_role;
select * from public.issue_account_activation('00000000-0000-0000-0000-000000000101',decode(repeat('aa',32),'hex'));
select * from public.issue_account_activation('00000000-0000-0000-0000-000000000101',decode(repeat('bb',32),'hex'));
select pg_temp.assert((select count(*)=1 from public.account_activations where revoked_at is not null),'reissue revokes prior link');
do $$ begin
 begin perform public.complete_account_activation(decode(repeat('aa',32),'hex'),'00000000-0000-0000-0000-000000000111',decode(repeat('11',32),'hex')); raise exception 'Revoked link accepted'; exception when raise_exception then if sqlerrm <> 'ACTIVATION_UNAVAILABLE' then raise; end if; end;
end $$;
select public.complete_account_activation(decode(repeat('bb',32),'hex'),'00000000-0000-0000-0000-000000000111',decode(repeat('11',32),'hex'));
select pg_temp.assert((select status='active' from public.accounts where id='00000000-0000-0000-0000-000000000101'),'activated account');
select pg_temp.assert((select count(*)=1 from public.devices),'device committed');
select pg_temp.assert((select count(*)=1 from public.account_activations where consumed_at is not null),'link consumed');
do $$ begin
 begin perform public.complete_account_activation(decode(repeat('bb',32),'hex'),'00000000-0000-0000-0000-000000000112',decode(repeat('22',32),'hex')); raise exception 'Replay accepted'; exception when raise_exception then if sqlerrm <> 'ACTIVATION_UNAVAILABLE' then raise; end if; end;
end $$;
select * from public.issue_account_activation('00000000-0000-0000-0000-000000000102',decode(repeat('cc',32),'hex'));
-- An invalid device insert must not consume the link or activate the account.
do $$ begin
 begin perform public.complete_account_activation(decode(repeat('cc',32),'hex'),'00000000-0000-0000-0000-000000000113',decode(repeat('11',32),'hex')); raise exception 'Duplicate key accepted'; exception when unique_violation then null; end;
end $$;
select pg_temp.assert((select status='pending' from public.accounts where id='00000000-0000-0000-0000-000000000102'),'failed insert leaves pending');
select pg_temp.assert((select consumed_at is null from public.account_activations where token_hash=decode(repeat('cc',32),'hex')),'failed insert leaves link unused');
-- Expiry is checked against wall clock after locks, not transaction start time.
update public.account_activations set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where token_hash=decode(repeat('cc',32),'hex');
do $$ begin
 begin perform public.complete_account_activation(decode(repeat('cc',32),'hex'),'00000000-0000-0000-0000-000000000113',decode(repeat('33',32),'hex')); raise exception 'Expired link accepted'; exception when raise_exception then if sqlerrm <> 'ACTIVATION_UNAVAILABLE' then raise; end if; end;
end $$;
reset role;
select pg_temp.assert(not has_function_privilege('anon','public.issue_account_activation(uuid,bytea)','EXECUTE'),'anon issue denied');
select pg_temp.assert(not has_function_privilege('authenticated','public.complete_account_activation(bytea,uuid,bytea)','EXECUTE'),'chat/admin direct completion denied');
select pg_temp.assert(not has_table_privilege('authenticated','public.account_activations','SELECT'),'client link hashes hidden');
do $$ declare r text; f text; begin
 foreach r in array array['anon','authenticated'] loop
  foreach f in array array['public.issue_account_activation(uuid,bytea)','public.complete_account_activation(bytea,uuid,bytea)'] loop
   perform pg_temp.assert(not has_function_privilege(r,f,'EXECUTE'),r||' activation RPC denied');
  end loop;
 end loop;
end $$;
grant select on public.account_activations to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
select set_config('request.jwt.claims','{"session_kind":"admin","app_role":"super_admin"}',true);
select pg_temp.assert((select count(*)=0 from public.account_activations),'RLS protects token hashes after accidental grant');
reset role;
do $$ begin
 begin perform public.complete_account_activation(decode(repeat('dd',32),'hex'),'00000000-0000-0000-0000-000000000114',decode(repeat('44',32),'hex')); raise exception 'Unknown link accepted'; exception when raise_exception then if sqlerrm <> 'ACTIVATION_UNAVAILABLE' then raise; end if; end;
 begin perform public.complete_account_activation(null,null,null); raise exception 'Invalid input accepted'; exception when raise_exception then if sqlerrm <> 'INVALID_ACTIVATION_INPUT' then raise; end if; end;
end $$;
rollback;
