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
