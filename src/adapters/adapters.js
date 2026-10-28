import fs from 'node:fs';
import { expandHome, which, IS_WIN } from '../util.js';

function loadRegistry() {
  return JSON.parse(fs.readFileSync(new URL('./registry.json', import.meta.url), 'utf8'));
}

function checkDetect(d) {
  if (d.startsWith('dir:')) return fs.existsSync(expandHome(d.slice(4)));
  if (d.startsWith('bin:')) return Boolean(which(d.slice(4)));
  return fs.existsSync(expandHome(d));
}

function mergeAdapter(key, base, ov) {
  return {
    key,
    label: (ov && ov.label) || base.label || key,
    detect: (ov && ov.detect) || base.detect || [],
    install: { ...(base.install || {}), ...((ov && ov.install) || {}) },
    hooks: (ov && ov.hooks) || base.hooks || [],
  };
}

/**
 * Registry defaults merged with user overrides from config:
 *   cfg.disableDefaultAdapters: true        -> ignore built-ins (tests, custom-only setups)
 *   cfg.adapters.<key>                      -> override detect/install/label
 *   cfg.adapters.<key>.disabled: true       -> turn a built-in off
 * Returns [{ key, label, detect, install, hooks, detected }].
 */
export function resolveAdapters(cfg, { only } = {}) {
  const reg = loadRegistry();
  const overrides = (cfg && cfg.adapters) || {};
  const map = new Map();

  if (!(cfg && cfg.disableDefaultAdapters)) {
    for (const [k, v] of Object.entries(reg)) {
      map.set(k, mergeAdapter(k, v, overrides[k]));
    }
  }
  for (const [k, v] of Object.entries(overrides)) {
    map.set(k, mergeAdapter(k, map.get(k) || { label: k, detect: [], install: {}, hooks: [] }, v));
  }

  const onlySet = only ? new Set(only.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const out = [];
  for (const [key, ad] of map) {
    if (overrides[key] && overrides[key].disabled) continue;
    if (onlySet && !onlySet.has(key)) continue;
    out.push({ ...ad, detected: ad.detect.some(checkDetect) });
  }
  return out;
}
