import fs from 'node:fs';
import path from 'node:path';
import { stateDir, expandHome, SkilloError } from './util.js';

export function configPath() {
  return path.join(stateDir(), 'config.json');
}

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(cfg) {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n');
}

export function defaultLibraryRoot() {
  return path.join(stateDir(), 'library');
}

/**
 * Resolve the library checkout commands act on: the checkout you are standing
 * in wins (authors working in their own clone), otherwise the configured
 * ~/.skillo/library clone (consumers running `skillo new` from anywhere).
 */
export function resolveLibraryRoot(cfg, cwd = process.cwd(), { preferConfig = false } = {}) {
  const configured = cfg?.library?.root ? expandHome(cfg.library.root) : null;
  if (preferConfig && configured) return configured;
  let dir = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(dir, 'skillo.config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return configured;
}

/** Consumer commands (sync) always act on the setup clone, never on a random cwd. */
export function requireConsumerRoot(cfg) {
  if (!cfg?.library?.root) {
    throw new SkilloError('No library configured — run `skillo setup <repo-url>` first.');
  }
  return expandHome(cfg.library.root);
}

export function requireLibraryRoot(cfg, cwd) {
  const root = resolveLibraryRoot(cfg, cwd);
  if (!root) {
    throw new SkilloError(
      'No skillo library found. Run `skillo setup <repo-url>` first, or run this command inside a library checkout.'
    );
  }
  if (!fs.existsSync(path.join(root, 'skillo.config.json'))) {
    throw new SkilloError(`"${root}" is not a skillo library (missing skillo.config.json).`);
  }
  return root;
}
