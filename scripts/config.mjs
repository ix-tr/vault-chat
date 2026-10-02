import { isIP } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function loadEnvironment(path = '.env', target = process.env) {
  if (!existsSync(path)) return;
  const values = parseEnv(readFileSync(path, 'utf8'));
  for (const [name, value] of Object.entries(values)) {
    if (target[name] === undefined) target[name] = value;
  }
}

function hostname(value) {
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(value)) {
    throw new Error('Use valid chat/admin DNS hostnames without schemes, ports or whitespace.');
  }
  return value.toLowerCase();
}

export function localConfig(env = process.env) {
  const chat = hostname(env.CHAT_HOST ?? 'chat.localhost');
  const admin = hostname(env.ADMIN_HOST ?? 'admin.localhost');
  if (chat === admin) throw new Error('Chat and admin require different hostnames.');
  const ip = env.LAN_IP ?? '127.0.0.1';
  const external = env.TURN_EXTERNAL_IP ?? ip;
  if (isIP(ip) !== 4 || isIP(external) !== 4) throw new Error('LAN and TURN addresses must be valid IPv4 addresses.');
  const min = Number(env.TURN_MIN_PORT ?? 49160);
  const max = Number(env.TURN_MAX_PORT ?? 49200);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1024 || max > 65535 || min > max) {
    throw new Error('Invalid TURN port range.');
  }
  for (const [key, host] of [['CHAT_ORIGIN', chat], ['ADMIN_ORIGIN', admin]]) {
    const expected = `https://${host}:8443`;
    const actual = new URL(env[key] ?? expected);
    if (actual.origin !== expected || actual.username || actual.password || actual.pathname !== '/' || actual.search || actual.hash) {
      throw new Error(`${key} must match its HTTPS gateway hostname and port 8443.`);
    }
  }
  return { chat, admin, ip, external, min, max };
}
