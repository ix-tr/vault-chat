import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateAuthPolicy,policyKeys } from '../../server/auth-policy.mjs';
import { authOrigin,productionAuthDependencies } from '../../server/auth-config.mjs';
const policy=JSON.parse(readFileSync('tests/auth/policy.json','utf8'));
describe('server authentication configuration',()=>{
  it('requires every explicit bounded setting and rejects inconsistent costs',()=>{
    expect(validateAuthPolicy(policy)).toEqual(policy);
    for (const key of policyKeys) {const copy={...policy};delete copy[key];expect(()=>validateAuthPolicy(copy)).toThrow();}
    for (const override of [{max_users:0},{max_users:1.2},{extra_limit:1},{create_kdf_ops:1},{min_password_bytes:2048},{chat_session_idle_seconds:7200}]) expect(()=>validateAuthPolicy({...policy,...override})).toThrow();
  });
  it('binds RP to configured HTTPS origin and requires explicit enablement',()=>{
    expect(authOrigin('https://chat.example.test')).toEqual({origin:'https://chat.example.test',rpID:'chat.example.test'});
    for (const value of ['http://chat.example.test','https://chat.example.test/path','https://a:b@chat.example.test','https://chat.example.test?q=1']) expect(()=>authOrigin(value)).toThrow();
    expect(()=>productionAuthDependencies({})).toThrow('AUTH_DISABLED');
    expect(()=>productionAuthDependencies({VAULT_AUTH_ENABLED:'true',VAULT_CHAT_ORIGIN:'https://chat.example.test',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SECRET_KEY:'sbp_management-token'})).toThrow('AUTH_CONFIGURATION');
  });
});
