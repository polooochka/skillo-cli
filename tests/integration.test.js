import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { main } = await import('../src/cli.js');

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();
}

test('end-to-end: init -> publish -> setup -> sync -> prune -> collision', { timeout: 120000 }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillo-e2e-'));
  const home = path.join(tmp, 'home');
  const agentsDir = path.join(tmp, 'agents');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  process.env.SKILLO_HOME = home;
  t.after(() => {
    delete process.env.SKILLO_HOME;
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* windows may hold locks briefly */
    }
  });

  // -- init library scaffold -------------------------------------------------
  process.chdir(tmp);
  assert.equal(await main(['init', 'lib']), 0);
  const lib = path.join(tmp, 'lib');
  for (const f of ['skillo.config.json', 'CODEOWNERS', 'skills/_template/SKILL.md', '.github/workflows/validate.yml']) {
    assert.equal(fs.existsSync(path.join(lib, f)), true, `missing scaffold file ${f}`);
  }

  // identity + origin so publish can push
  git(['config', 'user.email', 'test@example.com'], { cwd: lib });
  git(['config', 'user.name', 'Test'], { cwd: lib });
  const origin = path.join(tmp, 'origin.git');
  git(['init', '--bare', '-b', 'main', origin]);
  git(['remote', 'add', 'origin', origin], { cwd: lib });

  // -- new + publish ----------------------------------------------------------
  process.chdir(lib);
  assert.equal(await main(['new', 'skill', 'hello-world']), 0);
  const skillDir = path.join(lib, 'skills', 'hello-world');
  const created = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  assert.ok(created.includes('name: hello-world'), 'template name not rewritten');
  assert.equal(await main(['publish']), 0);

  // -- setup against a fake agent (all built-in adapters disabled) ------------
  fs.writeFileSync(
    path.join(home, 'config.json'),
    JSON.stringify({
      disableDefaultAdapters: true,
      adapters: {
        testagent: {
          label: 'Test Agent',
          detect: [`dir:${agentsDir}`],
          install: { skill: path.join(agentsDir, 'skills') },
        },
      },
    })
  );
  assert.equal(await main(['setup', origin]), 0);
  const linked = path.join(agentsDir, 'skills', 'hello-world');
  assert.equal(fs.existsSync(path.join(linked, 'SKILL.md')), true, 'skill not linked into agent dir');
  if (process.platform === 'win32') {
    assert.equal(fs.lstatSync(linked).isSymbolicLink(), true, 'expected junction');
  }
  // doctor must see the fresh links as healthy (regression: state lost `target`)
  assert.equal(await main(['doctor']), 0);

  // -- publish a change, sync, see it immediately (same path, new content) ----
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: hello-world\ndescription: updated description v2\nversion: 0.2.0\n---\nbody v2'
  );
  assert.equal(await main(['publish', '-m', 'v2']), 0);
  assert.equal(await main(['sync']), 0);
  const throughLink = fs.readFileSync(path.join(linked, 'SKILL.md'), 'utf8');
  assert.ok(throughLink.includes('updated description v2'), 'change not visible through link');

  // -- remove from library -> pruned from agent dir ----------------------------
  fs.rmSync(skillDir, { recursive: true, force: true });
  assert.equal(await main(['publish', '-m', 'remove skill']), 0);
  assert.equal(await main(['sync']), 0);
  assert.equal(fs.existsSync(linked), false, 'removed skill still linked');
  assert.equal(fs.existsSync(path.join(home, 'library', 'skills')), true, 'library itself intact');

  // -- collision: existing real dir is never clobbered -------------------------
  const collideTarget = path.join(agentsDir, 'skills', 'collide');
  fs.mkdirSync(collideTarget, { recursive: true });
  fs.writeFileSync(path.join(collideTarget, 'USER-FILE'), 'precious');
  assert.equal(await main(['new', 'skill', 'collide']), 0);
  assert.equal(await main(['publish', '-m', 'add collide']), 0);
  assert.equal(await main(['sync']), 0);
  assert.equal(fs.readFileSync(path.join(collideTarget, 'USER-FILE'), 'utf8'), 'precious', 'user dir was clobbered!');

  // -- validate + manifest --check agree ---------------------------------------
  assert.equal(await main(['validate', lib, '--manifest']), 0);
  assert.equal(await main(['list', '--json']) ?? 0, 0);
  assert.equal(await main(['doctor']), 0);
});

test('concurrent authors: publish rebases and auto-merges manifest.json', { timeout: 120000 }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillo-two-'));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  process.env.SKILLO_HOME = home;
  t.after(() => {
    delete process.env.SKILLO_HOME;
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* windows locks */
    }
  });

  process.chdir(tmp);
  assert.equal(await main(['init', 'lib1']), 0);
  const lib1 = path.join(tmp, 'lib1');
  git(['config', 'user.email', 'a@test'], { cwd: lib1 });
  git(['config', 'user.name', 'A'], { cwd: lib1 });
  const origin = path.join(tmp, 'origin.git');
  git(['init', '--bare', '-b', 'main', origin]);
  git(['remote', 'add', 'origin', origin], { cwd: lib1 });
  process.chdir(lib1);
  assert.equal(await main(['publish', '-m', 'initial']), 0);

  // author B clones, but does NOT pull A's next change before publishing
  const lib2 = path.join(tmp, 'lib2');
  git(['clone', '-q', origin, lib2]);
  git(['config', 'user.email', 'b@test'], { cwd: lib2 });
  git(['config', 'user.name', 'B'], { cwd: lib2 });

  process.chdir(lib1);
  assert.equal(await main(['new', 'skill', 'x-one']), 0);
  fs.writeFileSync(
    path.join(lib1, 'skills', 'x-one', 'SKILL.md'),
    '---\nname: x-one\ndescription: author A skill\nversion: 0.1.0\n---\nA'
  );
  assert.equal(await main(['publish', '-m', 'x-one']), 0);

  // B edits a DIFFERENT skill and pushes without pulling -> must not fail
  process.chdir(lib2);
  assert.equal(await main(['new', 'skill', 'x-two']), 0);
  fs.writeFileSync(
    path.join(lib2, 'skills', 'x-two', 'SKILL.md'),
    '---\nname: x-two\ndescription: author B skill\nversion: 0.1.0\n---\nB'
  );
  assert.equal(await main(['publish', '-m', 'x-two']), 0);

  // merged tree has both skills and a manifest covering both
  assert.equal(fs.existsSync(path.join(lib2, 'skills', 'x-one')), true, "A's skill missing after rebase");
  assert.equal(fs.existsSync(path.join(lib2, 'skills', 'x-two')), true);
  const man = JSON.parse(fs.readFileSync(path.join(lib2, 'manifest.json'), 'utf8'));
  assert.ok(man.resources['skills/x-one'] && man.resources['skills/x-two'], 'manifest not a union');
  const remoteTree = git(['ls-tree', '--name-only', 'origin/main:skills'], { cwd: lib2 });
  assert.ok(remoteTree.includes('x-one') && remoteTree.includes('x-two'), 'remote missing one skill');
});

test('validate rejects broken frontmatter', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillo-val-'));
  const bad = path.join(tmp, 'skills', 'bad');
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'SKILL.md'), 'no frontmatter here');
  const { validateLibrary } = await import('../src/commands/validate.js');
  const problems = validateLibrary(tmp);
  assert.ok(problems.some((p) => p.includes('skills/bad')), JSON.stringify(problems));
  fs.rmSync(tmp, { recursive: true, force: true });
});
