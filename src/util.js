import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const IS_WIN = process.platform === 'win32';

export class SkilloError extends Error {}

export function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** skillo's state dir (~/.skillo), overridable via SKILLO_HOME for tests. */
export function stateDir() {
  if (process.env.SKILLO_HOME) return path.resolve(expandHome(process.env.SKILLO_HOME));
  return path.join(os.homedir(), '.skillo');
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Content hash that is stable across git checkouts: autocrlf turns LF files
 * into CRLF on Windows clones, so text content (no NUL bytes) is normalized
 * to LF before hashing. Binary content is hashed as-is.
 */
export function contentHash(buf) {
  if (!buf.includes(0)) {
    const s = buf.toString('utf8');
    if (s.includes('\r\n')) return sha256(s.replace(/\r\n/g, '\n'));
  }
  return sha256(buf);
}

export function slugOk(name) {
  return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(name);
}

/** Resource folders are direct children; `_` and `.` prefixes are reserved (templates, trash). */
export function isResourceDir(name) {
  return !name.startsWith('_') && !name.startsWith('.');
}

/** Deterministic recursive file listing: [{ rel (posix separators), abs }] sorted by rel. */
export function walkFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(abs, base));
    else if (e.isFile()) {
      out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs });
    }
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

export function copyDir(src, dest, transform = null) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d, transform);
    else if (e.isFile()) {
      let content = fs.readFileSync(s, 'utf8');
      if (transform) content = transform(e.name, content);
      fs.writeFileSync(d, content);
    }
  }
}

// ---------------------------------------------------------------------------
// minimal ANSI styling (respects NO_COLOR / non-TTY)
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const paint = {
  green: (s) => wrap('32', s),
  yellow: (s) => wrap('33', s),
  red: (s) => wrap('31', s),
  cyan: (s) => wrap('36', s),
  dim: (s) => wrap('2', s),
  bold: (s) => wrap('1', s),
};

/** Best-effort `which` without dependencies. Returns absolute path or null. */
export function which(cmd) {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const exts = IS_WIN ? [''] : [''];
  const winExts = IS_WIN ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';') : [];
  for (const rawDir of pathEnv.split(path.delimiter)) {
    const dir = rawDir.trim().replace(/^"(.*)"$/, '$1');
    if (!dir) continue;
    const candidates = [path.join(dir, cmd)];
    for (const ext of winExts) candidates.push(path.join(dir, cmd + ext.toLowerCase()), path.join(dir, cmd + ext));
    for (const cand of candidates) {
      try {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
      } catch {
        /* ignore */
      }
    }
    void exts;
  }
  return null;
}
