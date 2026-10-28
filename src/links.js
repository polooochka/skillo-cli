import fs from 'node:fs';
import path from 'node:path';
import { stateDir, walkFiles, sha256, contentHash, SkilloError } from './util.js';

/**
 * Materializing a library resource into an agent dir:
 *   Windows: directory junction (no admin rights / DevMode needed — this is
 *            exactly how agentmemory links ~/.agents/skills into ~/.claude/skills)
 *   POSIX:   directory symlink
 *   fallback: recursive copy (recorded in state so `doctor` can detect drift)
 *
 * State file (~/.skillo/links.json) maps targetAbs -> { source, resource, mode, adapter }
 * so we can prune removed resources and detect copy drift.
 */

export function linksStatePath() {
  return path.join(stateDir(), 'links.json');
}

export function loadLinks() {
  try {
    return JSON.parse(fs.readFileSync(linksStatePath(), 'utf8'));
  } catch {
    return {};
  }
}

export function saveLinks(state) {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(linksStatePath(), JSON.stringify(state, null, 2) + '\n');
}

function safeReal(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Remove a junction/symlink (link only — never touches the target) or a real dir tree. */
export function removePath(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function hashTree(dir) {
  const parts = [];
  for (const f of walkFiles(dir)) parts.push(`${f.rel}:${contentHash(fs.readFileSync(f.abs))}`);
  return sha256(parts.join('\n'));
}

/**
 * Create/refresh `targetDir` pointing at `sourceDir`.
 * mode: 'junction' (win default) | 'symlink' | 'copy' — falls back to copy on failure.
 * Returns { action, mode } where action ∈ ok|linked|copied|conflict|exists-dir|exists-file
 */
export function materializeOne(sourceDir, targetDir, { mode, force } = {}) {
  const parent = path.dirname(targetDir);
  fs.mkdirSync(parent, { recursive: true });

  let st = null;
  try {
    st = fs.lstatSync(targetDir);
  } catch {
    /* not there */
  }

  if (st) {
    if (st.isSymbolicLink()) {
      let cur = null;
      try {
        cur = fs.readlinkSync(targetDir);
      } catch {
        /* broken link */
      }
      const curReal = safeReal(path.isAbsolute(cur || '') ? cur : path.resolve(parent, cur || ''));
      const srcReal = safeReal(sourceDir);
      if (curReal && srcReal && curReal === srcReal) return { action: 'ok', mode: 'link' };
      if (!force) return { action: 'conflict', mode: 'link', current: cur };
      removePath(targetDir);
      st = null;
    } else if (st.isDirectory()) {
      if (!force) return { action: 'exists-dir', mode: 'dir' };
      removePath(targetDir);
      st = null;
    } else if (!force) {
      return { action: 'exists-file', mode: 'file' };
    } else {
      removePath(targetDir);
    }
  }

  const want = mode || (process.platform === 'win32' ? 'junction' : 'symlink');
  if (want !== 'copy') {
    try {
      fs.symlinkSync(path.resolve(sourceDir), targetDir, want === 'symlink' ? 'dir' : 'junction');
      return { action: 'linked', mode: 'link' };
    } catch (e) {
      if (!mode || mode === 'auto') {
        // fall through to copy
      } else {
        throw new SkilloError(`failed to link ${targetDir}: ${e.message}`);
      }
    }
  }
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return { action: 'copied', mode: 'copy' };
}

/** True if a copy-mode link has diverged from its source. */
export function copyDrift(rec) {
  try {
    return hashTree(rec.source) !== hashTree(rec.target);
  } catch {
    return true;
  }
}

/** Verify a recorded link is still healthy. Returns { ok, detail }. */
export function checkLink(rec) {
  let st = null;
  try {
    st = fs.lstatSync(rec.target);
  } catch {
    return { ok: false, detail: 'missing (target gone)' };
  }
  if (st.isSymbolicLink()) {
    const real = safeReal(rec.target);
    if (!real) return { ok: false, detail: 'broken link' };
    const srcReal = safeReal(rec.source);
    if (srcReal && real === srcReal) return { ok: true, detail: 'link ok' };
    return { ok: false, detail: `points at ${real}` };
  }
  if (st.isDirectory()) {
    if (copyDrift(rec)) return { ok: false, detail: 'copy has drifted from library' };
    return { ok: true, detail: 'copy ok' };
  }
  return { ok: false, detail: 'unexpected file at link path' };
}
