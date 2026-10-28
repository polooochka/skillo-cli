import fs from 'node:fs';
import { paint, SkilloError } from './util.js';

const HELP = `
${paint.bold('skillo')} — provider-agnostic skills/agents/workflows library
Git-backed. $0 hosting. One command setup. Works with Claude Code, Codex, ZCode/GLM, Kimi, Gemini...

${paint.bold('Users (consumers):')}
  skillo setup <repo-url>     one-time: clone library + link into all detected agents [+ hooks]
  skillo sync                 pull + re-link (runs automatically at session start if hooks installed)
  skillo doctor               verify setup: detection, links, drift, hooks

${paint.bold('Authors (editors):')}
  skillo new <skill|agent|workflow> <name>   scaffold a resource in the library
  skillo publish [-m msg]                    validate + manifest + commit + push
  skillo list [--json]                       show library contents

${paint.bold('Admins:')}
  skillo init [name] [--here]  scaffold a new library repo (then push to a private GitHub repo)
  skillo validate [dir] [--manifest]         CI check
  skillo manifest [--check]                  regenerate/verify manifest.json

${paint.bold('RBAC')} = GitHub permissions: Admin -> manage people, Write -> publish (gated per-folder
by CODEOWNERS), Read -> consume. See README.md for details.

Options: --agent <a,b>  limit adapters   --force  replace conflicting links
         --hooks / --no-hooks     --json   --debug
`.trim();

function parseFlags(argv) {
  const flags = {};
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      const next = argv[i + 1];
      if (v !== undefined) flags[k] = v;
      else if (next !== undefined && !next.startsWith('--')) {
        flags[k] = next;
        i++;
      } else flags[k] = true;
    } else if (a.startsWith('-') && a.length === 2 && a !== '-') {
      flags[a[1]] = true; // short flags are boolean (-m handled via --m alias too)
    } else {
      args.push(a);
    }
  }
  return { flags, args };
}

export async function main(argv) {
  const [cmd, ...rest] = argv;
  const { flags, args } = parseFlags(rest);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return 0;
  }
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
    return 0;
  }

  const commands = {
    init: () => import('./commands/init.js'),
    setup: () => import('./commands/setup.js'),
    sync: () => import('./commands/sync.js'),
    new: () => import('./commands/new.js'),
    publish: () => import('./commands/publish.js'),
    list: () => import('./commands/list.js'),
    doctor: () => import('./commands/doctor.js'),
    manifest: () => import('./commands/manifest.js'),
    validate: () => import('./commands/validate.js'),
  };

  const load = commands[cmd];
  if (!load) {
    console.error(`skillo: unknown command "${cmd}"\n`);
    console.log(HELP);
    return 2;
  }
  const mod = await load();
  return (await mod.run({ args, flags })) ?? 0;
}

export { SkilloError };
