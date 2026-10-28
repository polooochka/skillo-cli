import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandHome, paint } from './util.js';

/**
 * Session-start sync hooks — this is what makes published skills visible
 * "immediately": the next agent session runs `skillo sync` before anything else.
 *
 * Claude Code: ~/.claude/settings.json -> hooks.SessionStart[]
 * ZCode:       ~/.zcode/cli/config.json -> hooks.enabled + hooks.events.SessionStart[]
 */

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

const SYNC_ENTRY = { type: 'command', command: 'skillo sync' };
const MATCHER = 'startup|resume';

export function installClaudeHook() {
  const p = expandHome('~/.claude/settings.json');
  const cfg = readJson(p);
  const h = (cfg.hooks = cfg.hooks || {});
  const list = (h.SessionStart = h.SessionStart || []);
  if (list.some((e) => (e.hooks || []).some((x) => x.command === SYNC_ENTRY.command))) {
    return { changed: false, file: p };
  }
  list.push({ matcher: MATCHER, hooks: [SYNC_ENTRY] });
  writeJson(p, cfg);
  return { changed: true, file: p };
}

export function claudeHookInstalled() {
  const cfg = readJson(expandHome('~/.claude/settings.json'));
  return Boolean(cfg.hooks?.SessionStart?.some((e) => (e.hooks || []).some((x) => x.command === SYNC_ENTRY.command)));
}

// ZCode config-file hooks must have hooks.enabled: true to run at all.
const ZCODE_ENTRY = {
  matcher: MATCHER,
  hooks: [{ type: 'process', command: 'skillo', args: ['sync'], timeoutMs: 20000, statusMessage: 'skillo sync' }],
};

export function installZcodeHook() {
  const p = expandHome('~/.zcode/cli/config.json');
  const cfg = readJson(p);
  const h = (cfg.hooks = cfg.hooks || {});
  h.enabled = true;
  const events = (h.events = h.events || {});
  const list = (events.SessionStart = events.SessionStart || []);
  if (list.some((e) => JSON.stringify(e.hooks || []) === JSON.stringify(ZCODE_ENTRY.hooks))) {
    return { changed: false, file: p };
  }
  list.push(ZCODE_ENTRY);
  writeJson(p, cfg);
  return { changed: true, file: p };
}

export function zcodeHookInstalled() {
  const cfg = readJson(expandHome('~/.zcode/cli/config.json'));
  return Boolean(
    cfg.hooks?.enabled &&
      cfg.hooks?.events?.SessionStart?.some((e) => JSON.stringify(e.hooks || []) === JSON.stringify(ZCODE_ENTRY.hooks))
  );
}

const HOOK_HELP = {
  claude: installClaudeHook,
  zcode: installZcodeHook,
};

export function installHook(key) {
  const fn = HOOK_HELP[key];
  return fn ? fn() : null;
}

export function hookHelpText(adapters) {
  const lines = [];
  for (const ad of adapters) {
    if (ad.hooks.length) continue; // supported natively
    lines.push(paint.dim(`  - ${ad.label}: add a session-start command running \`skillo sync\` (shell profile / scheduler)`));
  }
  return lines.join('\n');
}
