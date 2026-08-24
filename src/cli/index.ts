#!/usr/bin/env node
import { createEngine } from '../create-engine.js';
import { createProgram } from './program.js';

function startEngine() {
  try {
    return createEngine();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const program = createProgram(startEngine());
await program.parseAsync(process.argv);
