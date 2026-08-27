import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../README.md'),
  'utf-8'
);

describe('README product loop', () => {
  it('documents Phase 11 verbs and the skil bin', () => {
    expect(readme).toMatch(/^# skil/m);
    expect(readme).toContain('skil scan');
    expect(readme).toContain('skil create');
    expect(readme).toContain('skil delete');
    expect(readme).toContain('skil list');
    expect(readme).toContain('skil inbox');
    expect(readme).toContain('inbox add');
    expect(readme).toContain('inbox file');
    expect(readme).toContain('skil install');
    expect(readme).toContain('--to');
    expect(readme).toContain('skil export');
    expect(readme).toContain('--replace');
    expect(readme).toContain('skil search');
    expect(readme).toContain('.skil/state.json');
    expect(readme).toContain('SKIL_API_URL');
    expect(readme).toContain('contextkit');
  });

  it('describes Inbox, scan, install, and export-our-file — not leftover product', () => {
    expect(readme.toLowerCase()).toContain('inbox');
    expect(readme).toMatch(/install/i);
    expect(readme).toMatch(/export/i);
    expect(readme).toMatch(/generated_by: skil|stamped command file/i);

    expect(readme.toLowerCase()).not.toContain('active collection');
    expect(readme.toLowerCase()).not.toContain('converts every skill');
    expect(readme.toLowerCase()).not.toContain('one-click');
    expect(readme.toLowerCase()).not.toContain('skillsmith');
    expect(readme.toLowerCase()).not.toContain('marketplace');
    expect(readme.toLowerCase()).not.toContain('linter');
    expect(readme).not.toMatch(/\bskil sync\b/);
    expect(readme).not.toMatch(/\bcontextkit sync\b/);
    expect(readme).not.toMatch(/\bskil run\b/);
    expect(readme).not.toMatch(/\bcontextkit run\b/);
    expect(readme).not.toMatch(/\bskil convert\b/);
    expect(readme).not.toMatch(/\bcontextkit convert\b/);
    expect(readme.toLowerCase()).not.toContain('import-from-ide');
    expect(readme.toLowerCase()).not.toContain('import from ide');
  });
});
