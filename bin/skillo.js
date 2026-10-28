#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2))
  .then((code) => {
    if (code && Number.isFinite(code)) process.exit(code);
  })
  .catch((err) => {
    const debug = process.argv.includes('--debug');
    console.error(`skillo: ${err && err.message ? err.message : err}`);
    if (debug && err && err.stack) console.error(err.stack);
    process.exit(1);
  });
