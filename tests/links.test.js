import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { materializeOne, removePath, checkLink, loadLinks, saveLinks, copyDrift } from '../src/links.js';

let src, target;
beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillo-links-'));
  src = path.join(tmp, 'source');
  target = path.join(tmp, 'agent-skills', 'res');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'SKILL.md'), '---\nname: x\n---\nhello');
});

test('junction/symlink materializes and reads through', () => {
  const res = materializeOne(src, target);
  assert.equal(res.action, 'linked');
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').includes('hello'), true);
  // idempotent re-run
  const again = materializeOne(src, target);
  assert.equal(again.action, 'ok');
});

test('removing a link never touches the source', () => {
  materializeOne(src, target);
  removePath(target);
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(path.join(src, 'SKILL.md')), true, 'source must survive');
});

test('conflict: existing real dir is skipped, force replaces', () => {
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'USER-FILE'), 'keep me');
  let res = materializeOne(src, target);
  assert.equal(res.action, 'exists-dir');
  assert.equal(fs.existsSync(path.join(target, 'USER-FILE')), true);
  res = materializeOne(src, target, { force: true });
  assert.ok(['linked', 'copied'].includes(res.action), `unexpected action ${res.action}`);
});

test('copy mode + drift detection', () => {
  const res = materializeOne(src, target, { mode: 'copy' });
  assert.equal(res.action, 'copied');
  const rec = { source: src, target };
  assert.equal(copyDrift(rec), false);
  fs.writeFileSync(path.join(src, 'SKILL.md'), 'changed');
  assert.equal(copyDrift(rec), true);
  const chk = checkLink(rec);
  assert.equal(chk.ok, false);
});

test('state round-trip', () => {
  const prev = process.env.SKILLO_HOME;
  process.env.SKILLO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'skillo-home-'));
  try {
    saveLinks({ '/x': { source: src, resource: 'skills/x', mode: 'link' } });
    assert.deepEqual(loadLinks()['/x'].resource, 'skills/x');
  } finally {
    if (prev === undefined) delete process.env.SKILLO_HOME;
    else process.env.SKILLO_HOME = prev;
  }
});
