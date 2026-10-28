import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDir, paint, SkilloError, slugOk } from '../util.js';
import * as g from '../git.js';

function templateDir() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'library');
}

const TEXT_EXT = new Set(['.md', '.json', '.yml', '.yaml', '.txt', '.gitignore']);

export async function run({ args, flags }) {
  const here = Boolean(flags.here);
  const name = args[0] || 'skillo-library';
  if (!here && !slugOk(name)) throw new SkilloError(`invalid directory name: "${name}"`);
  const target = here ? process.cwd() : path.resolve(process.cwd(), name);
  if (!here && fs.existsSync(target)) throw new SkilloError(`${target} already exists`);
  if (here && !fs.existsSync(path.join(target, 'skillo.config.json')) && fs.readdirSync(target).length > 0) {
    throw new SkilloError('--here requires an empty directory (or an existing skillo library)');
  }

  copyDir(templateDir(), target, (fileName, content) => {
    const ext = path.extname(fileName).toLowerCase();
    return TEXT_EXT.has(ext) ? content.replaceAll('{{LIBRARY_NAME}}', path.basename(target)) : content;
  });

  g.git(['init', '-b', 'main'], { cwd: target });
  g.addAll(target);
  try {
    g.commit(target, 'chore: skillo library scaffold');
  } catch {
    /* identity problems surface on publish; scaffold files are in place */
  }

  console.log(paint.green(`✓ scaffolded skillo library at ${target}`));
  console.log('');
  console.log('Next steps (admin):');
  console.log(paint.cyan(`  1. Create a PRIVATE GitHub repo (e.g. ${path.basename(target)}).`));
  console.log(paint.cyan(`  2. cd ${path.basename(target)} && git remote add origin git@github.com:YOUR-ORG/${path.basename(target)}.git && git push -u origin main`));
  console.log(paint.cyan('  3. Protect the main branch (Settings → Branches) — publish governance comes from CODEOWNERS.'));
  console.log(paint.cyan('  4. Invite the team: Read = consume, Write = publish, Admin = manage roles.'));
  console.log('');
  console.log('Teammates then run a single command:');
  console.log(paint.bold(`  npx skillo setup git@github.com:YOUR-ORG/${path.basename(target)}.git`));
  return 0;
}
