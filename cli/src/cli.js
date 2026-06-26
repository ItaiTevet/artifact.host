import {
  loadConfig, resolveHost, resolveToken, clearToken, CONFIG_PATH, DEFAULT_HOST,
} from './config.js';
import { loginViaBrowser, loginWithToken } from './auth.js';
import { deploy, list, update, remove, setVisibility, comments } from './commands.js';

const HELP = `artifact — deploy HTML to artifact.host (or your self-hosted instance)

Usage:
  artifact auth login [--host URL] [--with-token]   Sign in via the browser (or paste a token)
  artifact auth logout [--host URL]                 Forget the saved token for a host
  artifact auth status [--host URL]                 Show the current host and whether a token is saved

  artifact deploy <file.html> [--ttl 7d] [--visibility public|password] [--password PW]
  artifact list                                     List your artifacts (requires auth)
  artifact comments <slug> [--json]                 List comments on an artifact (requires auth)
  artifact update <slug> <file.html> [--edit-token TOKEN]   Replace an artifact's HTML
  artifact visibility <slug> public|password [--password PW] [--edit-token TOKEN]
  artifact delete <slug>                            Delete an artifact (requires auth)

  --edit-token lets you change an anonymous artifact (from its one-time deploy token)
  without signing in. Owner commands otherwise use your saved auth.

Global flags:
  --host URL     Target instance (default: ${DEFAULT_HOST}); or set ARTIFACT_HOST_URL
  -h, --help     Show this help

Auth: a Personal API Token is used as a Bearer credential. Precedence:
  ARTIFACT_HOST_TOKEN env  >  token saved by 'artifact auth login'  (~/.artifacthost/config.json)
`;

/** Minimal flag parser: splits --key value / --flag and positionals. */
function parse(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { flags[key] = true; }
      else { flags[key] = next; i++; }
    } else {
      pos.push(a);
    }
  }
  return { flags, pos };
}

async function ctx(flags) {
  const cfg = await loadConfig();
  const host = resolveHost(flags.host, cfg);
  const token = resolveToken(cfg, host);
  return { host, token };
}

function requireToken(token) {
  if (!token) throw new Error("not signed in — run 'artifact auth login' (or set ARTIFACT_HOST_TOKEN)");
  return token;
}

export async function run(argv) {
  const { flags, pos } = parse(argv);
  const [cmd, ...rest] = pos;

  if (!cmd || flags.help) { process.stdout.write(HELP); return; }

  switch (cmd) {
    case 'auth': {
      const sub = rest[0];
      const { host } = await ctx(flags);
      if (sub === 'login') {
        if (flags['with-token']) await loginWithToken(host, flags['with-token']);
        else await loginViaBrowser(host);
        process.stdout.write(`Signed in to ${host}.\n`);
      } else if (sub === 'logout') {
        await clearToken(host);
        process.stdout.write(`Logged out of ${host}.\n`);
      } else if (sub === 'status') {
        const { token } = await ctx(flags);
        process.stdout.write(`host:   ${host}\ntoken:  ${token ? 'saved' : 'none'}\nconfig: ${CONFIG_PATH}\n`);
      } else {
        throw new Error("usage: artifact auth <login|logout|status>");
      }
      return;
    }

    case 'deploy': {
      const file = rest[0];
      if (!file) throw new Error('usage: artifact deploy <file.html>');
      const { host, token } = await ctx(flags);
      const res = await deploy(host, token, file, {
        ttl: flags.ttl, visibility: flags.visibility,
        password: typeof flags.password === 'string' ? flags.password : undefined,
      });
      process.stdout.write(`${res.url}\n`);
      if (!token && res.edit_token) {
        process.stdout.write(`edit token (anonymous — save it!): ${res.edit_token}\n`);
      }
      return;
    }

    case 'list': {
      const { host, token } = await ctx(flags);
      const items = await list(host, requireToken(token));
      if (!items.length) { process.stdout.write('No artifacts.\n'); return; }
      for (const a of items) {
        process.stdout.write(`${a.slug}\t${a.visibility}\t${a.view_count} views\t${a.title ?? ''}\n`);
      }
      return;
    }

    case 'comments': {
      const slug = rest[0];
      if (!slug) throw new Error('usage: artifact comments <slug> [--json]');
      const { host, token } = await ctx(flags);
      const items = await comments(host, requireToken(token), slug);
      if (flags.json) { process.stdout.write(`${JSON.stringify(items, null, 2)}\n`); return; }
      if (!items.length) { process.stdout.write('No comments.\n'); return; }
      for (const c of items) {
        const who = c.author_email || c.author_id;
        const status = c.resolved ? 'resolved' : 'open';
        const where = c.anchor?.kind === 'highlight'
          ? `"${String(c.anchor.quote || '').slice(0, 30)}"`
          : `@${Math.round((c.anchor?.x ?? 0) * 100)}%,${Math.round((c.anchor?.y ?? 0) * 100)}%`;
        process.stdout.write(`[${status}]\t${who}\t${where}\t${String(c.body).replace(/\s+/g, ' ')}\n`);
      }
      return;
    }

    case 'update': {
      const [slug, file] = rest;
      if (!slug || !file) throw new Error('usage: artifact update <slug> <file.html> [--edit-token TOKEN]');
      const { host, token } = await ctx(flags);
      const auth = flags['edit-token'] ? { editToken: flags['edit-token'] } : { token: requireToken(token) };
      const res = await update(host, auth, slug, file);
      process.stdout.write(`${res.url}\n`);
      return;
    }

    case 'visibility': {
      const [slug, vis] = rest;
      if (!slug || !vis) throw new Error('usage: artifact visibility <slug> public|password [--password PW] [--edit-token TOKEN]');
      const { host, token } = await ctx(flags);
      const auth = flags['edit-token'] ? { editToken: flags['edit-token'] } : { token: requireToken(token) };
      await setVisibility(host, auth, slug, vis,
        typeof flags.password === 'string' ? flags.password : undefined);
      process.stdout.write(`${slug} is now ${vis}.\n`);
      return;
    }

    case 'delete': {
      const slug = rest[0];
      if (!slug) throw new Error('usage: artifact delete <slug>');
      const { host, token } = await ctx(flags);
      await remove(host, requireToken(token), slug);
      process.stdout.write(`Deleted ${slug}.\n`);
      return;
    }

    default:
      throw new Error(`unknown command '${cmd}'. Run 'artifact --help'.`);
  }
}
