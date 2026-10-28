/**
 * Minimal YAML frontmatter parsing — just flat `key: value` pairs between
 * `---` markers, which is all a SKILL.md/AGENT.md/WORKFLOW.md header needs.
 * Nested YAML is ignored (kept for human readers, not parsed).
 */
export function parseFrontmatter(text) {
  const m = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text, hasFrontmatter: false };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v === '') continue; // block scalars / nested yaml keys — not flat scalars
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) {
      v = v.slice(1, -1);
    }
    data[kv[1]] = v;
  }
  return { data, body: text.slice(m[0].length), hasFrontmatter: true };
}
