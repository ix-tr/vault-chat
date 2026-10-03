import { createClient } from '@supabase/supabase-js';

export function authOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('AUTH_CONFIGURATION');
  return { origin: url.origin, rpID: url.hostname };
}

export function productionAuthDependencies(env = process.env) {
  if (env.VAULT_AUTH_ENABLED !== 'true') throw new Error('AUTH_DISABLED');
  const config = authOrigin(env.VAULT_CHAT_ORIGIN);
  const url = new URL(env.SUPABASE_URL);
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (url.protocol !== 'https:' || !key || key.startsWith('sbp_') || url.username || url.password) throw new Error('AUTH_CONFIGURATION');
  const supabase = createClient(url.origin, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { ...config, async rpc(action, input = {}) {
    const { data, error } = await supabase.rpc('vault_auth', { p_action: action, p_input: input });
    // No upstream details (tokens, SQL or project identifiers) reach the client.
    if (error || data === null) throw new Error('AUTH_UNAVAILABLE');
    return data;
  } };
}
