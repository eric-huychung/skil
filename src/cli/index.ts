#!/usr/bin/env node
import { createEngine } from '../create-engine.js';
import { createDiscover } from '../backend/discover.js';
import { getApiBaseUrl } from '../config/website.js';
import { createProgram } from './program.js';

function startEngine() {
  try {
    return createEngine();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const engine = startEngine();
const discover = createDiscover({
  apiBaseUrl: getApiBaseUrl(),
  browse: (view) => engine.browse(view),
});
const program = createProgram(engine, discover);
await program.parseAsync(process.argv);
