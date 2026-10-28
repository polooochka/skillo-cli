import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDir, paint, SkilloError, slugOk } from '../util.js';
import { loadConfig, requireLibraryRoot } from '../config.js';

const TYPE_DIRS = { skill: 'skills', agent: 'agents', workflow: 'workflows' };
const MAIN = { skills: 'SKILL.md', agents: 'AGENT.md', workflows: 'WORKFLOW.md' };

function templateFile(typeDir) {
  const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'library', typeDir, '_template');
  return base;
}

export async function run({ args }) {
  const [type, name] = args;
  if (!type || !TYPE_DIRS[type]) {
    throw new SkilloError('usage: skillo new <skill|agent|workflow> <name>');
  }
  if (!name || !slugOk(name)) throw new SkilloError(`invalid name "${name}": use lowercase letters, digits, dot, dash, underscore`);

  const cfg = loadConfig();
  const root = requireLibraryRoot(cfg);
  const typeDir = TYPE_DIRS[type];
  const dest = path.join(root, typeDir, name);
  if (fs.existsSync(dest)) throw new SkilloError(`${typeDir}/${name} already exists`);

  copyDir(templateFile(typeDir), dest, (fileName, content) => {
    if (MAIN[typeDir] === fileName) {
      return content.replaceAll('{{RESOURCE_NAME}}', name).replaceAll('{{LIBRARY_NAME}}', path.basename(root));
    }
    return content.replaceAll('{{RESOURCE_NAME}}', name);
  });

  console.log(paint.green(`✓ created ${typeDir}/${name}/${MAIN[typeDir]}`));
  console.log(paint.dim('  edit it, then: skillo publish   (or git add -A && git commit && git push)'));
  return 0;
}
