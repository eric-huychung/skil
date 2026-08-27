import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const apiEntries = [
  'api/skills/index.ts',
  'api/skills/search.ts',
  'api/market/shelves.ts',
  'api/market/search.ts',
  'api/market/preview.ts',
  'api/cron/sync-market.ts',
].map((file) => resolve(repoRoot, file));

function relativeImportSpecifiers(source: string): string[] {
  return [...source.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g)].map((match) => match[1]!);
}

/**
 * Native Node ESM (what Vercel Functions use) will not map `.js` specifiers
 * onto `.ts` files. If a relative import does not exist on disk, the function
 * crashes at load time with FUNCTION_INVOCATION_FAILED.
 */
describe('Vercel function relative imports', () => {
  it('resolve to real files that native Node ESM can load', () => {
    execFileSync(resolve(repoRoot, 'node_modules/typescript/bin/tsc'), ['-p', 'tsconfig.json'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    for (const apiFile of apiEntries) {
      const specifiers = relativeImportSpecifiers(readFileSync(apiFile, 'utf8'));
      expect(specifiers.length, `${apiFile} should import compiled modules`).toBeGreaterThan(0);

      for (const spec of specifiers) {
        const resolved = resolve(dirname(apiFile), spec);
        expect(existsSync(resolved), `${apiFile} imports ${spec} -> ${resolved}`).toBe(true);

        execFileSync(
          process.execPath,
          ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(resolved).href)})`],
          { cwd: repoRoot, stdio: 'pipe' },
        );
      }
    }
  });
});
