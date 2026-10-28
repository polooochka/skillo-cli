# {{LIBRARY_NAME}}

Team library of reusable **skills**, **agents** and **workflows** for AI coding
agents — delivered to every member's machine by git, hosted by GitHub for **$0**.

## Consume (all team members)

```bash
npx skillo setup git@github.com:YOUR-ORG/{{LIBRARY_NAME}}.git
```

That clones this repo to `~/.skillo`, links every resource into all detected
coding agents (Claude Code, Codex, ZCode/GLM, Kimi, Gemini…) and offers a
session-start sync hook. A published skill appears in every agent's **next
session** — no manual step.

## Publish (requires Write access)

```bash
skillo new skill my-skill     # scaffold
# ...edit...
skillo publish
```

## Roles (RBAC via GitHub)

| Role  | GitHub permission | Can do |
|-------|-------------------|--------|
| Admin | repo **Admin**    | manage people & branch protection; approve anything |
| Editor | repo **Write**   | publish changes (per-folder rules via [CODEOWNERS](CODEOWNERS)) |
| Consumer | repo **Read**  | `skillo setup` / `skillo sync` |

CI (`.github/workflows/validate.yml`) rejects pushes with invalid frontmatter
or a stale `manifest.json`.

## Layout

```
skills/<name>/SKILL.md      universal format (YAML frontmatter: name, description, version)
agents/<name>/AGENT.md
workflows/<name>/WORKFLOW.md
manifest.json               content hashes — regenerate with `skillo manifest`
CODEOWNERS                  per-folder publish governance
```
