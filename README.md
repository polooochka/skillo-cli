# skillo

**One team library of reusable skills, agents and workflows — delivered to every AI coding agent.**

Works with Claude Code, OpenAI Codex, ZCode/GLM, Kimi, Gemini CLI — and anything else,
via a data-driven adapter registry. Hosting is **a private GitHub repo**: no servers,
no database, **$0 forever**. All computation happens on the client; the repo only
stores and returns resources.

> This repo is the **CLI**. Your skills live in your own private "library" repo
> (scaffolded by `skillo init`) — e.g. `polooochka/skillo` in this setup.

```bash
# consumers — one command, done (until published on npm, install from GitHub):
npm i -g github:polooochka/skillo-cli
skillo setup https://github.com/YOUR-ORG/team-skills.git

# authors:
skillo new skill pdf-report   # scaffold
skillo publish                # validate → manifest → commit → push
```

A published skill appears in every teammate's **next agent session** (session-start
sync hook) or on the next `skillo sync` — minutes, not sprint-planning cycles.

## How it works

```
editor: skillo publish ──git push──▶ private GitHub repo  (= the "service")
                                          │
each machine: ~/.skillo/library  ◆────────┘  (git clone / fast-forward pull)
      │
      ├─ junction into ~/.agents/skills/…     (ZCode + shared convention)
      ├─ junction into ~/.claude/skills/…     (Claude Code)
      ├─ junction into ~/.codex/skills/…      (Codex)
      ├─ junction into ~/.gemini/skills/…     (Gemini CLI)
      └─ junction into ~/.kimi/skills/…       (Kimi)
```

- **Junctions/symlinks**, not copies: pulling new commits updates every agent
  instantly through the same path — only add/remove need re-linking, which
  `sync` does automatically. On Windows these are directory junctions: no admin
  rights, no Developer Mode (same mechanism agentmemory uses).
- **Safety**: existing folders at a target path are never clobbered (skipped,
  warn; replace with `--force`). Copy fallback (used when links are impossible)
  is drift-checked on every sync.
- **Universal format**: `skills/<name>/SKILL.md` with YAML frontmatter
  (`name`, `description`, `version`) — the format converging across agents
  (Claude, Codex, ZCode, the agentskills.io convention).

## RBAC — roles without building an auth system

GitHub's permission model *is* the role system:

| Role | GitHub permission | What they can do |
|------|-------------------|------------------|
| **Admin** | repo Admin | invite people, set roles, manage branch protection |
| **Editor** | repo Write | publish (gated per-folder by `CODEOWNERS` + protected `main`) |
| **Consumer** | repo Read | `skillo setup` / `skillo sync` |

Per-folder **publish** control is native: `/skills/team-x/ @YOUR-ORG/team-x` in
`CODEOWNERS` means changes there need review from that team. Per-folder *read*
control, if ever needed, is a config-flagged phase 2 (thin Cloudflare proxy —
contract already fixed in [docs/proxy-api.md](docs/proxy-api.md); CLI and repo
layout unchanged).

## CLI

| Command | Purpose |
|---|---|
| `skillo init [name]` | scaffold a new library repo (admin, once) |
| `skillo setup <repo-url>` | clone + detect agents + link + optional session-start hooks |
| `skillo sync` | fetch + fast-forward + re-link + prune removed |
| `skillo new <skill\|agent\|workflow> <name>` | scaffold a resource |
| `skillo publish [-m msg]` | validate + regenerate manifest + commit + push |
| `skillo list [--json]` | inventory |
| `skillo doctor` | diagnose detection, links, drift, hooks, freshness |
| `skillo validate [dir] --manifest` | CI gate |
| `skillo manifest [--check]` | regenerate / verify `manifest.json` |

Flags: `--agent a,b` limit adapters · `--force` replace conflicting links ·
`--hooks` / `--no-hooks` · `--json` · `--debug`.

### Adapters

Built-in and data-driven ([src/adapters/registry.json](src/adapters/registry.json)):
`agents-shared` (`~/.agents`, read by ZCode and friends), `zcode`, `claude`,
`codex`, `gemini`, `kimi`. Add or override any in `~/.skillo/config.json`:

```json
{
  "adapters": {
    "myagent": {
      "label": "My Agent",
      "detect": ["dir:~/.myagent", "bin:myagent"],
      "install": { "skill": "~/.myagent/skills" }
    }
  }
}
```

### Immediate visibility

`setup --hooks` installs a **session-start sync hook**:

- Claude Code → `~/.claude/settings.json` (`hooks.SessionStart`)
- ZCode → `~/.zcode/cli/config.json` (`hooks.enabled` + `hooks.events.SessionStart`, `process`-type — cross-platform)

Other agents: run `skillo sync` from a shell profile or OS scheduler — it's a
sub-second fast-forward in the common case.

## Development

```bash
npm test        # zero dependencies, Node >= 18
npm i -g .      # make `skillo` available on PATH (needed for hooks)
```

Project layout: `src/commands/*` (one file per command) · `src/sync-core.js`
(the delivery engine shared by setup/sync) · `src/adapters/` ·
`templates/library/` (what `skillo init` scaffolds) · `tests/`.
