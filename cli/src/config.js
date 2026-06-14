import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';

const DIR = join(homedir(), '.artifacthost');
const FILE = join(DIR, 'config.json');

export const DEFAULT_HOST = 'https://artifact.host';

export async function loadConfig() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function saveConfig(cfg) {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(cfg, null, 2) + '\n');
  try { await chmod(FILE, 0o600); } catch { /* best effort on platforms without chmod */ }
}

/** Precedence: --host flag > ARTIFACT_HOST_URL > saved default > public cloud. */
export function resolveHost(flagHost, cfg) {
  const host = flagHost || process.env.ARTIFACT_HOST_URL || cfg.host || DEFAULT_HOST;
  return host.replace(/\/+$/, '');
}

/** Precedence: ARTIFACT_HOST_TOKEN > per-host saved token. Tokens are scoped per host. */
export function resolveToken(cfg, host) {
  if (process.env.ARTIFACT_HOST_TOKEN) return process.env.ARTIFACT_HOST_TOKEN;
  return (cfg.tokens && cfg.tokens[host]) || null;
}

export async function storeToken(host, token) {
  const cfg = await loadConfig();
  cfg.host = host;
  cfg.tokens = cfg.tokens || {};
  cfg.tokens[host] = token;
  await saveConfig(cfg);
}

export async function clearToken(host) {
  const cfg = await loadConfig();
  if (cfg.tokens) delete cfg.tokens[host];
  await saveConfig(cfg);
}

export const CONFIG_PATH = FILE;
