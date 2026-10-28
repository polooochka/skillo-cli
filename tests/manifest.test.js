import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, writeManifest, manifestFresh, listResources } from '../src/manifest.js';

function makeLib() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillo-man-'));
  for (const [dir, file, body] of [
    ['skills/alpha', 'SKILL.md', '---\nname: alpha\ndescription: first\nversion: 0.1.0\n---\nA'],
    ['skills/beta', 'SKILL.md', '---\nname: beta\ndescription: second\n---\nB'],
    ['agents/helper', 'AGENT.md', '---\nname: helper\ndescription: does things\n---\nC'],
  ]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, file), body);
  }
  // ignored folders
  fs.mkdirSync(path.join(root, 'skills', '_template'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', '_template', 'SKILL.md'), '---\nname: t\n---\nT');
  return root;
}

let lib;
beforeEach(() => {
  lib = makeLib();
});

test('lists resources, skipping _ and . dirs', () => {
  const list = listResources(lib);
  assert.deepEqual(
    list.map((r) => `${r.typeDir}/${r.name}`).sort(),
    ['agents/helper', 'skills/alpha', 'skills/beta']
  );
});

test('manifest is deterministic and content-addressed', () => {
  const a = buildManifest(lib);
  const b = buildManifest(lib);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.schema, 1);
  assert.equal(a.resources['skills/alpha'].version, '0.1.0');
  assert.ok(a.resources['skills/alpha'].hash);
  assert.ok(a.resources['skills/alpha'].files['SKILL.md']);
  // content change -> hash change
  fs.appendFileSync(path.join(lib, 'skills/alpha', 'SKILL.md'), 'more');
  const c = buildManifest(lib);
  assert.notEqual(a.resources['skills/alpha'].hash, c.resources['skills/alpha'].hash);
});

test('freshness check detects stale manifest', () => {
  writeManifest(lib);
  assert.equal(manifestFresh(lib), true);
  fs.appendFileSync(path.join(lib, 'skills/beta', 'SKILL.md'), 'changed');
  assert.equal(manifestFresh(lib), false);
});

test('missing main file fails loudly', () => {
  fs.mkdirSync(path.join(lib, 'workflows/broken'), { recursive: true });
  assert.throws(() => buildManifest(lib), /missing WORKFLOW.md/);
});
