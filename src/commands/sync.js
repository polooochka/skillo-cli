import { paint } from '../util.js';
import { loadConfig, requireConsumerRoot } from '../config.js';
import * as g from '../git.js';
import { resolveAdapters } from '../adapters/adapters.js';
import { syncLibrary, summarize } from '../sync-core.js';

export async function run({ flags }) {
  const cfg = loadConfig();
  const root = requireConsumerRoot(cfg);
  if (cfg.library?.url && cfg.transport !== 'https' && g.isRepo(root)) {
    g.fetchOrigin(root);
    if (g.isClean(root)) {
      const before = g.revHead(root);
      g.ffOnly(root);
      const after = g.revHead(root);
      if (before !== after) console.log(paint.green(`✓ library updated: ${before} -> ${after}`));
    } else {
      console.log(paint.yellow('! library has local changes — not updating. Resolve or stash them first.'));
    }
  }

  const adapters = resolveAdapters(cfg, { only: flags.agent });
  const { results, pruned, drift } = syncLibrary(root, adapters, { force: Boolean(flags.force) });
  const lines = summarize(results);
  if (lines.length) for (const l of lines) console.log(l);
  for (const r of [...new Set(pruned.map((p) => p.resource))]) console.log(paint.dim(`  pruned removed resource: ${r}`));
  for (const d of drift) console.log(paint.yellow(`! copy drifted: ${d} (fix with skillo sync --force)`));
  console.log(paint.green('✓ in sync.'));
  return 0;
}
