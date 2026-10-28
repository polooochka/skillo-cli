import fs from 'node:fs';
import { paint, SkilloError } from '../util.js';
import { loadConfig, requireLibraryRoot } from '../config.js';
import { writeManifest, manifestFresh } from '../manifest.js';

export async function run({ flags }) {
  const cfg = loadConfig();
  const root = requireLibraryRoot(cfg);
  if (flags.check) {
    if (!manifestFresh(root)) throw new SkilloError('manifest.json is stale — run `skillo manifest` and commit');
    console.log(paint.green('✓ manifest.json fresh'));
    return 0;
  }
  const m = writeManifest(root);
  console.log(paint.green(`✓ manifest.json written (${Object.keys(m.resources).length} resources)`));
  return 0;
}
