import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isErr, isOk } from '../core/result.js';
import { ConfigAdapter } from './config-adapter.js';

describe('ConfigAdapter', () => {
  let tmpDir: string;
  let adapter: ConfigAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'contextkit-config-'));
    adapter = new ConfigAdapter();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('parses a valid YAML config file', () => {
      const path = join(tmpDir, '.contextkit.yml');
      writeFileSync(
        path,
        [
          'version: "1.0"',
          'collections:',
          '  frontend:',
          '    - obra/react-patterns',
          '    - addyosmani/performance-review',
        ].join('\n')
      );

      const result = adapter.read(path);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({
          version: '1.0',
          collections: { frontend: ['obra/react-patterns', 'addyosmani/performance-review'] },
        });
      }
    });

    it('returns an error when the file does not exist', () => {
      const result = adapter.read(join(tmpDir, 'missing.yml'));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('missing.yml');
      }
    });

    it('returns an error when the file contains malformed YAML', () => {
      const path = join(tmpDir, 'bad.yml');
      writeFileSync(path, 'collections:\n  frontend: [unclosed');

      const result = adapter.read(path);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain(path);
      }
    });
  });

  describe('validate', () => {
    it('accepts a well-formed config', () => {
      const result = adapter.validate({
        version: '1.0',
        collections: { frontend: ['obra/react-patterns'] },
      });

      expect(isOk(result)).toBe(true);
    });

    it('rejects a config missing the collections key', () => {
      const result = adapter.validate({ version: '1.0' } as never);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('collections');
      }
    });

    it('rejects a collection whose skills are not an array', () => {
      const result = adapter.validate({
        version: '1.0',
        collections: { frontend: 'obra/react-patterns' } as never,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('frontend');
      }
    });
  });
});
