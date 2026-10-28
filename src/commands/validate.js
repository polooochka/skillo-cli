import fs from 'node:fs';
import path from 'node:path';
import { paint, SkilloError, slugOk } from '../util.js';
import { listResources, mainFile, manifestFresh } from '../manifest.js';
import { parseFrontmatter } from '../frontmatter.js';

/**
 * Validate every resource; returns array of problem strings (empty = ok).
 * Pure function so `publish` and CI can both use it.
 */
export function validateLibrary(libraryRoot) {
  const problems = [];
  const seen = new Map();
  for (const r of listResources(libraryRoot)) {
    const id = `${r.typeDir}/${r.name}`;
    if (!slugOk(r.name)) problems.push(`${id}: folder name must be lowercase [a-z0-9._-]`);
    const mf = mainFile(r);
    if (!fs.existsSync(mf)) {
      problems.push(`${id}: missing ${path.basename(mf)}`);
      continue;
    }
    const { data, hasFrontmatter } = parseFrontmatter(fs.readFileSync(mf, 'utf8'));
    if (!hasFrontmatter) {
      problems.push(`${id}: ${path.basename(mf)} has no --- frontmatter block`);
      continue;
    }
    if (!data.name) problems.push(`${id}: frontmatter missing "name"`);
    else if (data.name !== r.name) problems.push(`${id}: frontmatter name "${data.name}" != folder name`);
    if (!data.description) problems.push(`${id}: frontmatter missing "description" (agents use it to decide when to load this)`);
    const key = `${r.typeDir}/${data.name || r.name}`;
    if (seen.has(key)) problems.push(`${id}: duplicate of ${seen.get(key)}`);
    seen.set(key, id);
  }
  return problems;
}

export async function run({ args, flags }) {
  const dir = args[0] ? args[0] : process.cwd();
  if (!fs.existsSync(dir)) throw new SkilloError(`no such directory: ${dir}`);
  const problems = validateLibrary(dir);
  const count = listResources(dir).length;
  if (problems.length) {
    for (const p of problems) console.log(paint.red(`✗ ${p}`));
    throw new SkilloError(`${problems.length} problem(s) found`);
  }
  console.log(paint.green(`✓ ${count} resource(s) valid`));
  if (flags.manifest) {
    if (!manifestFresh(dir)) {
      throw new SkilloError('manifest.json is stale — regenerate with `skillo manifest` and commit');
    }
    console.log(paint.green('✓ manifest.json fresh'));
  }
  return 0;
}
