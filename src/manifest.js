import fs from 'node:fs';
import path from 'node:path';
import { walkFiles, sha256, contentHash, isResourceDir, SkilloError } from './util.js';
import { parseFrontmatter } from './frontmatter.js';

export const TYPES = ['skills', 'agents', 'workflows'];
export const MAIN_FILE = { skills: 'SKILL.md', agents: 'AGENT.md', workflows: 'WORKFLOW.md' };

/** Every resource (folder with a main file) in the library. */
export function listResources(libraryRoot) {
  const out = [];
  for (const typeDir of TYPES) {
    const dir = path.join(libraryRoot, typeDir);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || !isResourceDir(e.name)) continue;
      out.push({
        type: typeDir.slice(0, -1),
        typeDir,
        name: e.name,
        dir: path.join(dir, e.name),
      });
    }
  }
  return out.sort((a, b) => (a.typeDir + '/' + a.name < b.typeDir + '/' + b.name ? -1 : 1));
}

export function mainFile(resource) {
  return path.join(resource.dir, MAIN_FILE[resource.typeDir]);
}

export function hashResource(resDir) {
  const files = {};
  for (const f of walkFiles(resDir)) files[f.rel] = contentHash(fs.readFileSync(f.abs));
  const hash = sha256(Object.entries(files).map(([k, v]) => `${k}:${v}`).join('\n'));
  return { hash, files };
}

/**
 * Deterministic content manifest — no timestamps, so CI can enforce freshness
 * with a plain equality check and git diffs stay meaningful.
 */
export function buildManifest(libraryRoot) {
  const resources = {};
  for (const r of listResources(libraryRoot)) {
    const mf = mainFile(r);
    if (!fs.existsSync(mf)) {
      throw new SkilloError(`${r.typeDir}/${r.name}: missing ${MAIN_FILE[r.typeDir]}`);
    }
    const fm = parseFrontmatter(fs.readFileSync(mf, 'utf8'));
    const { hash, files } = hashResource(r.dir);
    resources[`${r.typeDir}/${r.name}`] = {
      type: r.type,
      name: r.name,
      version: fm.data.version || '0.0.0',
      description: fm.data.description || '',
      hash,
      files,
    };
  }
  return { schema: 1, resources };
}

export function manifestPath(libraryRoot) {
  return path.join(libraryRoot, 'manifest.json');
}

export function writeManifest(libraryRoot) {
  const m = buildManifest(libraryRoot);
  fs.writeFileSync(manifestPath(libraryRoot), JSON.stringify(m, null, 2) + '\n');
  return m;
}

export function manifestFresh(libraryRoot) {
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(manifestPath(libraryRoot), 'utf8'));
  } catch {
    return false;
  }
  let fresh;
  try {
    fresh = buildManifest(libraryRoot);
  } catch {
    return false;
  }
  return JSON.stringify(existing) === JSON.stringify(fresh);
}
