import fs from 'node:fs';
import { paint } from '../util.js';
import { loadConfig, requireLibraryRoot } from '../config.js';
import { listResources, mainFile } from '../manifest.js';
import { parseFrontmatter } from '../frontmatter.js';

export async function run({ flags }) {
  const cfg = loadConfig();
  const root = requireLibraryRoot(cfg);
  const resources = listResources(root);
  const rows = resources.map((r) => {
    let fm = {};
    try {
      fm = parseFrontmatter(fs.readFileSync(mainFile(r), 'utf8')).data;
    } catch {
      /* listed broken resources too */
    }
    return { type: r.type, name: r.name, version: fm.version || '0.0.0', description: fm.description || '' };
  });

  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  if (!rows.length) {
    console.log(paint.yellow('library is empty — add one with `skillo new skill my-skill`'));
    return 0;
  }
  for (const t of ['skill', 'agent', 'workflow']) {
    const items = rows.filter((r) => r.type === t);
    if (!items.length) continue;
    console.log(paint.bold(`${t}s (${items.length}):`));
    for (const i of items) {
      console.log(`  ${paint.cyan(i.name)} ${paint.dim(`v${i.version}`)} — ${i.description}`);
    }
  }
  return 0;
}
