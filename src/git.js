import { execFileSync } from 'node:child_process';
import { SkilloError } from './util.js';

export function git(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    const raw = String((e.stderr || e.stdout || e.message || '')).trim();
    const tail = raw.split(/\r?\n/).filter(Boolean).slice(-2).join(' | ');
    throw new SkilloError(`git ${args.join(' ')} failed${tail ? `: ${tail}` : ''}`);
  }
}

export function hasGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const isRepo = (dir) => {
  try {
    git(['rev-parse', '--is-inside-work-tree'], { cwd: dir });
    return true;
  } catch {
    return false;
  }
};

export const clone = (url, dest) => git(['clone', url, dest]);

export const remoteUrl = (repo) => {
  try {
    return git(['remote', 'get-url', 'origin'], { cwd: repo });
  } catch {
    return null;
  }
};

export const fetchOrigin = (repo) => git(['fetch', 'origin', '--prune'], { cwd: repo });

export const headBranch = (repo) => git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo });

export const revHead = (repo) => git(['rev-parse', '--short', 'HEAD'], { cwd: repo });

export const isClean = (repo) => git(['status', '--porcelain'], { cwd: repo }) === '';

export const addAll = (repo) => git(['add', '-A'], { cwd: repo });

export function stagedFiles(repo) {
  return git(['diff', '--cached', '--name-only'], { cwd: repo }).split(/\r?\n/).filter(Boolean);
}

function hasIdentity(repo) {
  try {
    return git(['config', 'user.email'], { cwd: repo }).length > 0;
  } catch {
    return false;
  }
}

export function commit(repo, message) {
  if (hasIdentity(repo)) {
    git(['commit', '-m', message], { cwd: repo });
  } else {
    // first-run machines without git identity: commit anyway, say so
    git(['-c', 'user.name=skillo', '-c', 'user.email=skillo@localhost', 'commit', '-m', message], { cwd: repo });
  }
}

export function push(repo) {
  const b = headBranch(repo);
  git(['push', '-u', 'origin', b], { cwd: repo });
}

export function ffOnly(repo) {
  const b = headBranch(repo);
  git(['merge', '--ff-only', `origin/${b}`], { cwd: repo });
}
