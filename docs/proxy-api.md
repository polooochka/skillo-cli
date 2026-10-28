# skillo proxy API (phase 2 contract)

The git transport (phase 1) needs **zero infrastructure**: the GitHub repo *is*
the service. This document pins the contract for the optional phase-2 auth
proxy, so it can be added later **without changing the CLI, the repo layout,
or the manifest format**.

## When you need it

- users without (or with no reason to have) GitHub accounts
- per-skill / per-team **read** visibility managed in one place
- usage auditing

Until then: RBAC = GitHub permissions (Admin / Write / Read) + CODEOWNERS for
per-folder publish control. Cost: $0.

## Transport switch

`~/.skillo/config.json`:

```json
{
  "transport": "https",
  "baseUrl": "https://skillo-proxy.example.workers.dev"
}
```

`skillo setup` / `skillo sync` behave identically; only the fetch layer differs.
Auth: `Authorization: Bearer <token>`; token stored in `~/.skillo/config.json`
(or `SKILLO_TOKEN` env var, preferred).

## Endpoints

### `GET /manifest`

Returns the same deterministic JSON that `skillo manifest` writes to
`manifest.json` (schema 1). Supports `ETag` / `If-None-Match` — clients should
send the cached ETag and treat `304` as up-to-date.

```
200 OK          { "schema": 1, "resources": { "skills/<name>": { "hash", "files", ... } } }
304 Not Modified
```

The server should compute the manifest from the git repo (single source of
truth) and cache by commit SHA.

### `GET /file?path=<resource-relative-path>`

Returns one file's raw content, filtered by the caller's roles:

```
200 OK          text/markdown
403 Forbidden   caller's role cannot read this resource
404 Not Found   unknown path
```

`path` is posix-style, relative to the repo root, e.g.
`skills/pdf-report/SKILL.md`. The client only requests paths listed in the
manifest it has, and only files that changed since the cached revision.

### `GET /sync?since=<manifest-etag>`  *(optional optimization)*

Server-diff: returns `{ changed: ["skills/x/SKILL.md", ...], removed: [...], manifest }`
so clients make one round-trip. Clients must tolerate `404` here and fall back
to manifest + file fetching.

## Roles (phase 2)

Server-side table, managed by an admin role:

| column  | notes                                        |
|---------|----------------------------------------------|
| user    | identity (email / SSO subject)               |
| role    | `admin` \| `editor` \| `consumer`            |
| scope   | optional: `skills/team-x/**` glob, empty = all |

- `admin` manages users/roles and publishes anything
- `editor` publishes resources their scope allows
- `consumer` reads resources their scope allows

Enforcement: `/file` and `/manifest` may be role-filtered; publish endpoints
(see below) check scope server-side.

### `PUT /file?path=...` *(only if write access is proxied)*

Optional. In the recommended deployment, writes keep going through **git**
(publishing via PR/branch protection is the governance layer — don't rebuild
it in the proxy); the proxy serves reads only.

## Reference implementation notes

Cloudflare Workers + D1 (roles) + R2 or the GitHub API (content) fits the
free tier. The worker holds a machine user's GitHub token and mirrors the
repo; content flows one way (git -> proxy), keeping git authoritative.
