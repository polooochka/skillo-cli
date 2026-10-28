import fs from 'node:fs';
import { paint, which } from '../util.js';
import { configPath, loadConfig, resolveLibraryRoot } from '../config.js';
import * as g from '../git.js';
import { resolveAdapters } from '../adapters/adapters.js';
import { listResources, manifestFresh } from '../manifest.js';
import { loadLinks, checkLink } from '../links.js';
import { claudeHookInstalled, zcodeHookInstalled } from '../hooks.js';

export async function run() {
  const checks = [];
  const add = (name, ok, detail = '', warnOnly = false) => checks.push({ name, ok, detail, warnOnly });

  add('git available', g.hasGit());
  add('config exists', fs.existsSync(configPath()), configPath());

  const cfg = loadConfig();
  const root = resolveLibraryRoot(cfg, process.cwd(), { preferConfig: true });
  add('library located', Boolean(root), root || 'not set up — run `skillo setup <repo-url>`');

  if (root) {
    const isRepo = g.isRepo(root);
    add('library is a git repo', isRepo);
    if (isRepo) {
      add('library origin', Boolean(g.remoteUrl(root)), g.remoteUrl(root) || 'no origin remote');
      add('library clean', g.isClean(root), g.isClean(root) ? '' : 'local changes present');
      try {
        g.fetchOrigin(root);
        const b = g.headBranch(root);
        const behind = g.git(['rev-list', '--count', `HEAD..origin/${b}`], { cwd: root });
        add('library up to date', behind === '0', behind === '0' ? '' : `${behind} commit(s) behind — run skillo sync`, true);
      } catch (e) {
        add('library fetch', false, e.message, true);
      }
    }
    try {
      const problems = [];
      // reuse validate quietly
      const { validateLibrary } = await import('./validate.js');
      problems.push(...validateLibrary(root));
      add(`library valid (${listResources(root).length} resources)`, problems.length === 0, problems.slice(0, 3).join('; '));
    } catch (e) {
      add('library valid', false, e.message);
    }
    add('manifest.json fresh', manifestFresh(root), manifestFresh(root) ? '' : 'stale — run `skillo manifest`', true);
  }

  const adapters = resolveAdapters(cfg);
  const detected = adapters.filter((a) => a.detected);
  add(
    'coding agents detected',
    detected.length > 0,
    detected.map((a) => a.key).join(', ') || 'none — configure cfg.adapters'
  );

  const state = loadLinks();
  const entries = Object.entries(state);
  let bad = 0;
  const details = [];
  for (const [target, rec] of entries) {
    const r = checkLink(rec);
    if (!r.ok) {
      bad++;
      details.push(`${rec.resource} -> ${target}: ${r.detail}`);
    }
  }
  add(
    `resource links (${entries.length})`,
    bad === 0,
    bad ? details.slice(0, 4).join('; ') : 'all healthy'
  );

  add('skillo on PATH', Boolean(which('skillo')), which('skillo') || 'hooks run `skillo sync`; install with `npm i -g skillo` (or your local checkout)', true);
  add('claude sync hook', claudeHookInstalled(), 'session-start', true);
  add('zcode sync hook', zcodeHookInstalled(), 'session-start', true);

  let failed = 0;
  for (const c of checks) {
    if (c.ok) console.log(`  ${paint.green('✓')} ${c.name}${c.detail ? paint.dim(` — ${c.detail}`) : ''}`);
    else if (c.warnOnly) {
      console.log(`  ${paint.yellow('!')} ${c.name}${c.detail ? paint.dim(` — ${c.detail}`) : ''}`);
    } else {
      failed++;
      console.log(`  ${paint.red('✗')} ${c.name}${c.detail ? paint.dim(` — ${c.detail}`) : ''}`);
    }
  }
  console.log('');
  console.log(failed ? paint.red(`${failed} problem(s) found`) : paint.green('all critical checks passed'));
  return failed ? 1 : 0;
}
