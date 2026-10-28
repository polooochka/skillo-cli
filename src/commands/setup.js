import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { paint, SkilloError, expandHome } from '../util.js';
import { loadConfig, saveConfig, defaultLibraryRoot } from '../config.js';
import * as g from '../git.js';
import { resolveAdapters } from '../adapters/adapters.js';
import { syncLibrary, summarize } from '../sync-core.js';
import { installHook, hookHelpText } from '../hooks.js';

function normUrl(u) {
  return String(u || '').replace(/\/+$/, '').replace(/\\.$/, '');
}

async function askHooks() {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question('Install session-start sync hooks where supported (claude, zcode)? [Y/n] ')).trim().toLowerCase();
    return a === '' || a === 'y' || a === 'yes';
  } finally {
    rl.close();
  }
}

export async function run({ args, flags }) {
  const cfg = loadConfig();
  const url = args[0] || cfg.library?.url;
  if (!url) throw new SkilloError('usage: skillo setup <repo-url>');

  if (!g.hasGit()) throw new SkilloError('git not found on PATH — install git first (https://git-scm.com)');

  const root = flags.root ? expandHome(flags.root) : cfg.library?.root || defaultLibraryRoot();

  if (g.isRepo(root)) {
    const existing = g.remoteUrl(root);
    if (existing && normUrl(existing) !== normUrl(url)) {
      console.log(paint.yellow(`! library at ${root} points at ${existing} — keeping it, syncing from there`));
    }
    g.fetchOrigin(root);
    if (g.isClean(root)) {
      g.ffOnly(root);
    } else {
      console.log(paint.yellow('! library has local changes — skipping update (run git -C <library> stash if unintended)'));
    }
  } else {
    fs.mkdirSync(path.dirname(root), { recursive: true });
    g.clone(url, root);
  }

  cfg.library = { url, root };
  cfg.transport = cfg.transport || 'git';
  saveConfig(cfg);

  const adapters = resolveAdapters(cfg, { only: flags.agent });
  const detected = adapters.filter((a) => a.detected);
  if (!detected.length) {
    console.log(paint.yellow('! no known coding agents detected. Add one via ~/.skillo/config.json -> "adapters".'));
  }

  const { results, pruned, drift } = syncLibrary(root, detected, { force: Boolean(flags.force) });
  const lines = summarize(results);
  if (lines.length) {
    console.log(paint.green('✓ linked into:'));
    for (const l of lines) console.log(l);
  }
  for (const r of [...new Set(pruned.map((p) => p.resource))]) console.log(paint.dim(`  pruned removed resource: ${r}`));
  for (const d of drift) console.log(paint.yellow(`! copy drifted: ${d} (fix with skillo sync --force)`));

  const wantHooks = flags.hooks !== undefined ? flags.hooks !== false : await askHooks();
  if (wantHooks) {
    for (const ad of detected) {
      for (const h of ad.hooks) {
        const res = installHook(h);
        if (res) console.log(res.changed ? paint.green(`✓ ${ad.label}: session-start hook -> ${res.file}`) : paint.dim(`= ${ad.label}: hook already installed`));
      }
    }
    const manual = hookHelpText(detected);
    if (manual) {
      console.log('Manual (agents without native hook support):');
      console.log(manual);
    }
  }

  const n = results.filter((r) => r.action === 'linked' || r.action === 'ok').length;
  console.log('');
  console.log(paint.green(`✓ setup complete — ${n} resource link(s) live. Published skills appear in every new agent session.`));
  console.log(paint.dim('  tip: run `skillo doctor` to verify, `skillo sync` to update manually.'));
  return 0;
}
