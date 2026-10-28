import readline from 'node:readline/promises';
import { paint, SkilloError } from '../util.js';
import { loadConfig, requireLibraryRoot } from '../config.js';
import * as g from '../git.js';
import { validateLibrary } from './validate.js';
import { writeManifest, manifestFresh } from '../manifest.js';

/**
 * Fetch and rebase onto origin/<branch> before pushing, so two authors who
 * publish concurrently never see a non-fast-forward rejection.
 *
 * The one conflict that is mechanical rather than editorial is manifest.json
 * (two authors each adding a skill both regenerate it against different
 * bases). There we take origin's copy and regenerate from the merged tree,
 * which by then contains both skills — the union is exactly what the
 * deterministic generator would produce. Any other conflict (same skill
 * edited on both sides) is a real editorial conflict: abort and hand it to
 * the author.
 */
function syncWithOrigin(root) {
  let b;
  try {
    b = g.headBranch(root);
  } catch {
    return;
  }
  g.fetchOrigin(root);
  try {
    g.git(['rev-parse', '--verify', '--quiet', `origin/${b}`], { cwd: root });
  } catch {
    return; // first push — no upstream yet
  }
  const behind = g.git(['rev-list', '--count', `HEAD..origin/${b}`], { cwd: root });
  if (behind === '0') return;
  try {
    g.git(['rebase', `origin/${b}`], { cwd: root });
    console.log(paint.dim(`  rebased onto origin/${b} (${behind} teammate commit(s))`));
  } catch {
    const conflicted = g.git(['diff', '--name-only', '--diff-filter=U'], { cwd: root })
      .split(/\r?\n/)
      .filter(Boolean);
    if (conflicted.length === 1 && conflicted[0] === 'manifest.json') {
      g.git(['checkout', `origin/${b}`, '--', 'manifest.json'], { cwd: root });
      writeManifest(root); // merged tree already contains both sides' skills
      g.git(['add', 'manifest.json'], { cwd: root });
      g.git(['rebase', '--continue'], { cwd: root, env: { GIT_EDITOR: 'true' } });
      console.log(paint.green(`  auto-merged manifest.json with ${behind} teammate commit(s)`));
      return;
    }
    g.git(['rebase', '--abort'], { cwd: root });
    throw new SkilloError(
      `your changes conflict with teammates' edits in: ${conflicted.join(', ')} — ` +
        'resolve with `git pull --rebase`, then run `skillo publish` again'
    );
  }
}

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
    syncWithOrigin(root);
    // the rebase may have changed the manifest relative to our local commits
    if (!manifestFresh(root)) {
      writeManifest(root);
      g.addAll(root);
      if (g.stagedFiles(root).length) g.commit(root, msg);
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

  syncWithOrigin(root);
  // a rebase against teammates' commits can invalidate our manifest
  if (!manifestFresh(root)) {
    writeManifest(root);
    g.addAll(root);
    if (g.stagedFiles(root).length) g.commit(root, `${msg} (manifest refresh)`);
  }

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
