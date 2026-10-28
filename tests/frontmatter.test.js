import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../src/frontmatter.js';

test('parses flat key: value frontmatter', () => {
  const { data, hasFrontmatter } = parseFrontmatter('---\nname: hello\ndescription: "quoted desc"\nversion: 1.2.3\n---\n\n# Body');
  assert.equal(hasFrontmatter, true);
  assert.equal(data.name, 'hello');
  assert.equal(data.description, 'quoted desc');
  assert.equal(data.version, '1.2.3');
});

test('handles nested yaml blocks without crashing', () => {
  const { data } = parseFrontmatter('---\nname: x\nnested:\n  a: 1\n---\nbody');
  assert.equal(data.name, 'x');
  assert.equal(data.nested, undefined);
});

test('no frontmatter', () => {
  const { hasFrontmatter } = parseFrontmatter('just text');
  assert.equal(hasFrontmatter, false);
});

test('handles CRLF and BOM', () => {
  const { data } = parseFrontmatter('\uFEFF---\r\nname: win\r\n---\r\nbody');
  assert.equal(data.name, 'win');
});
