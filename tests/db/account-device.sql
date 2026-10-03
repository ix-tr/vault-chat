begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
insert into public.accounts(id,status) values
 ('00000000-0000-0000-0000-000000000001','active'),
 ('00000000-0000-0000-0000-000000000002','active'),
 ('00000000-0000-0000-0000-000000000003','disabled');
insert into public.devices(id,account_id,signature_public_key) values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',decode(repeat('11',32),'hex')),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002',decode(repeat('22',32),'hex')),
 ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000003',decode(repeat('33',32),'hex'));
insert into public.app_settings(key,value) values ('demo_policy','{"demo":true}');
select pg_temp.assert((select count(*)=3 from pg_class where oid in ('public.accounts'::regclass,'public.devices'::regclass,'public.app_settings'::regclass) and relrowsecurity and relforcerowsecurity), 'RLS enabled and forced on every table');
-- Check every client privilege, including grants inherited via PUBLIC.
do $$ declare r text; t text; p text; begin
 foreach r in array array['anon','authenticated'] loop
  foreach t in array array['accounts','devices','app_settings'] loop
   foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    perform pg_temp.assert(not has_table_privilege(r,'public.'||t,p),r||' cannot '||p||' '||t);
   end loop;
   if r='anon' or t='app_settings' then
    perform pg_temp.assert(not has_table_privilege(r,'public.'||t,'SELECT'),r||' cannot read '||t);
   end if;
  end loop;
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"session_kind":"chat"}',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select array_agg(id)=array['00000000-0000-0000-0000-000000000001'::uuid] from public.accounts),'own account only');
select pg_temp.assert((select count(*)=1 and bool_and(account_id=auth.uid()) from public.devices),'own device only');
select set_config('request.jwt.claims','{"app_role":"super_admin","role":"authenticated","session_kind":"chat"}',true);
select pg_temp.assert((select count(*)=1 from public.accounts),'super admin claim cannot read other accounts');
select pg_temp.assert((select count(*)=1 from public.devices),'super admin claim cannot read other device keys');
select set_config('request.jwt.claims','{"session_kind":"admin","app_role":"super_admin"}',true);
select pg_temp.assert((select count(*)=0 from public.accounts),'admin session cannot read chat account');
select pg_temp.assert((select count(*)=0 from public.devices),'admin session cannot read chat device directory');
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert((select count(*)=0 from public.accounts),'missing session kind denied');
select set_config('request.jwt.claims','{"session_kind":"chat"}',true);
do $$ begin
 begin insert into public.accounts default values; raise exception 'Write unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin update public.devices set revoked_at=now(); raise exception 'Write unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin delete from public.accounts; raise exception 'Write unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin perform * from public.app_settings; raise exception 'Settings unexpectedly readable'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=1 and bool_and(id=auth.uid()) from public.accounts),'second account isolation');
select pg_temp.assert((select count(*)=1 and bool_and(account_id=auth.uid()) from public.devices),'second device isolation');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from public.devices),'disabled account cannot read device directory');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert((select count(*)=0 from public.accounts),'missing subject denied');
select pg_temp.assert((select count(*)=0 from public.devices),'missing subject devices denied');
reset role;
-- Prove RLS itself denies writes even if a future grant is accidentally added.
grant insert,update,delete on public.accounts,public.devices to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ declare affected integer; begin
 begin insert into public.accounts default values; raise exception 'RLS insert unexpectedly allowed'; exception when insufficient_privilege then null; end;
 update public.devices set revoked_at=now(); get diagnostics affected=row_count;
 perform pg_temp.assert(affected=0,'no RLS update policy');
 delete from public.accounts; get diagnostics affected=row_count;
 perform pg_temp.assert(affected=0,'no RLS delete policy');
end $$;
reset role;
grant select on public.accounts,public.devices,public.app_settings to anon;
set local role anon;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select count(*)=0 from public.accounts),'anon remains denied despite subject and accidental grant');
select pg_temp.assert((select count(*)=0 from public.devices),'anon devices denied by RLS');
select pg_temp.assert((select count(*)=0 from public.app_settings),'anon settings denied by RLS');
reset role;
do $$ begin
 begin insert into public.devices(account_id,signature_public_key) values ('00000000-0000-0000-0000-000000000001',decode('11','hex')); raise exception 'Short key accepted'; exception when check_violation then null; end;
 begin insert into public.devices(account_id,signature_public_key) values ('00000000-0000-0000-0000-000000000001',decode(repeat('22',32),'hex')); raise exception 'Reused key accepted'; exception when unique_violation then null; end;
 begin insert into public.devices(account_id,signature_public_key) values ('00000000-0000-0000-0000-000000000099',decode(repeat('44',32),'hex')); raise exception 'Missing account accepted'; exception when foreign_key_violation then null; end;
 begin insert into public.app_settings(key,value) values ('null_policy','null'); raise exception 'Null policy accepted'; exception when check_violation then null; end;
end $$;
rollback;
select 'Account/device grants and RLS checks passed' as result;
