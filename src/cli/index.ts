#!/usr/bin/env node
import { createEngine } from '../create-engine.js';
import { createProgram } from './program.js';

const program = createProgram(createEngine());
await program.parseAsync(process.argv);
