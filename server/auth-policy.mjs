export const policyKeys = [
  'activation_ttl_seconds','auth_challenge_ttl_seconds','chat_session_ttl_seconds','chat_session_idle_seconds',
  'auth_rate_window_seconds','auth_global_requests_per_window','auth_account_requests_per_window','max_users',
  'max_devices_per_account','max_passkeys_per_account','max_auth_body_bytes','max_key_package_bytes',
  'max_wire_bytes','max_snapshot_bytes','max_outbox','min_password_bytes','max_password_bytes',
  'min_kdf_ops','max_kdf_ops','min_kdf_memory_bytes','max_kdf_memory_bytes','create_kdf_ops','create_kdf_memory_bytes',
  'max_identity_bytes','max_directory_entries','max_credential_bytes','auth_cleanup_rows_per_request',
];
export function validateAuthPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !policyKeys.includes(key))) throw new Error('AUTH_POLICY_MISSING');
  for (const key of policyKeys) if (!Number.isSafeInteger(value[key]) || value[key] <= 0 || value[key] > 0x7fffffff) throw new Error('AUTH_POLICY_MISSING');
  for (const [min,max] of [['min_password_bytes','max_password_bytes'],['min_kdf_ops','max_kdf_ops'],['min_kdf_memory_bytes','max_kdf_memory_bytes']]) if (value[min] > value[max]) throw new Error('AUTH_POLICY_INVALID');
  if (value.create_kdf_ops < value.min_kdf_ops || value.create_kdf_ops > value.max_kdf_ops || value.create_kdf_memory_bytes < value.min_kdf_memory_bytes || value.create_kdf_memory_bytes > value.max_kdf_memory_bytes || value.chat_session_idle_seconds > value.chat_session_ttl_seconds || value.max_snapshot_bytes < value.max_wire_bytes) throw new Error('AUTH_POLICY_INVALID');
  return value;
}
