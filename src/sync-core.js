import fs from 'node:fs';
import path from 'node:path';
import { listResources } from './manifest.js';
import { materializeOne, loadLinks, saveLinks, copyDrift } from './links.js';
import { expandHome } from './util.js';

/**
 * Materialize every library resource into every (detected) adapter's dirs and
 * prune links whose source was removed from the library. Shared by `setup`
 * and `sync` — this is the whole "delivery" step; after a git pull the same
 * absolute paths hold the new content, so existing junctions pick up edits
 * for free and only add/remove need action here.
 *
 * Returns { results: [{adapter, type, name, action, target}], pruned: [...], drift: [...] }.
 */
export function syncLibrary(libraryRoot, adapters, { force = false } = {}) {
  const resources = listResources(libraryRoot);
  const state = loadLinks();
  const results = [];

  for (const ad of adapters) {
    if (!ad.detected) continue;
    for (const [resType, installDirRaw] of Object.entries(ad.install)) {
      const installDir = expandHome(installDirRaw);
      for (const r of resources.filter((x) => x.type === resType)) {
        const target = path.join(installDir, r.name);
        const res = materializeOne(r.dir, target, { force });
        results.push({ adapter: ad.key, label: ad.label, type: resType, name: r.name, action: res.action, target });
        if (res.action === 'linked' || res.action === 'copied' || res.action === 'ok') {
          state[target] = {
            target,
            source: r.dir,
            resource: `${r.typeDir}/${r.name}`,
            mode: res.mode,
            adapter: ad.key,
          };
        }
      }
    }
  }

  // prune state entries whose source vanished from the library
  const pruned = [];
  for (const [target, rec] of Object.entries(state)) {
    if (!fs.existsSync(rec.source)) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
      delete state[target];
      pruned.push({ resource: rec.resource, target });
    }
  }

  // drift report for copy-mode links (junctions share storage, they cannot drift)
  const drift = [];
  for (const rec of Object.values(state)) {
    if (rec.mode === 'copy' && copyDrift(rec)) drift.push(rec.resource);
  }

  saveLinks(state);
  return { results, pruned, drift };
}

export function summarize(results) {
  const lines = [];
  const byAdapter = new Map();
  for (const r of results) {
    if (!byAdapter.has(r.adapter)) byAdapter.set(r.adapter, { label: r.label, items: [] });
    byAdapter.get(r.adapter).items.push(r);
  }
  for (const [key, { label, items }] of byAdapter) {
    const ok = items.filter((i) => i.action !== 'exists-dir' && i.action !== 'conflict' && i.action !== 'exists-file');
    const skipped = items.length - ok.length;
    const kinds = [...new Set(items.map((i) => i.type))].join(', ');
    lines.push(`  ${label} [${key}] (${kinds}): ${ok.length} materialized${skipped ? `, ${skipped} skipped (existing dirs — see doctor)` : ''}`);
  }
  return lines;
}
