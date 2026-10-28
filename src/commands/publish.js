import readline from 'node:readline/promises';
import { paint, SkilloError } from '../util.js';
import { loadConfig, requireLibraryRoot } from '../config.js';
import * as g from '../git.js';
import { validateLibrary } from './validate.js';
import { writeManifest } from '../manifest.js';

async function askMessage() {
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question('Commit message [publish skills]: ')).trim() || null;
  } finally {
    rl.close();
  }
}

export async function run({ flags }) {
  const cfg = loadConfig();
  const root = requireLibraryRoot(cfg);
  if (!g.isRepo(root)) throw new SkilloError(`${root} is not a git repo — \`skillo init\` should have created one`);

  const problems = validateLibrary(root);
  if (problems.length) {
    for (const p of problems) console.log(paint.red(`  ✗ ${p}`));
    throw new SkilloError('validation failed — fix the issues above before publishing');
  }

  writeManifest(root); // deterministic; committed when it changes

  g.addAll(root);
  const staged = g.stagedFiles(root);
  if (!staged.length) {
    // nothing new to commit — but local commits ahead of origin still need a push
    let ahead = '1';
    try {
      const b = g.headBranch(root);
      ahead = g.git(['rev-list', '--count', `origin/${b}..${b}`], { cwd: root });
    } catch {
      /* no upstream yet — push to create it */
    }
    if (ahead === '0') {
      console.log(paint.yellow('nothing to publish — library already up to date'));
      return 0;
    }
    try {
      g.push(root);
      console.log(paint.green(`✓ pushed ${ahead} already-committed change(s)`));
    } catch (e) {
      console.log(paint.yellow('! push rejected — write access or CODEOWNERS review missing.'));
      throw e;
    }
    return 0;
  }

  const msg = flags.m || (await askMessage()) || 'publish skills';
  g.commit(root, msg);

  try {
    g.push(root);
    console.log(paint.green(`✓ published ${staged.length} file(s): ${msg}`));
    console.log(paint.dim('  every client sees this on their next session (session-start hook) or next `skillo sync`.'));
  } catch (e) {
    console.log(paint.yellow('! push rejected — this is publish governance working:'));
    console.log(paint.dim('  * write access: ask a repo Admin to add you as a collaborator (Write),'));
    console.log(paint.dim('  * folder rules: CODEOWNERS may require review from the folder owners.'));
    throw e;
  }
  return 0;
}
