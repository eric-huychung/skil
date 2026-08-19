import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import type { IConfigAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { Config } from '../types/index.js';

/**
 * Real implementation of IConfigAdapter, backed by js-yaml. Used in
 * production; tests use InMemoryConfigAdapter instead so CollectionEngine
 * tests never touch disk.
 */
export class ConfigAdapter implements IConfigAdapter {
  read(path: string): Result<Config> {
    let contents: string;
    try {
      contents = readFileSync(path, 'utf-8');
    } catch (error) {
      return err(new Error(`Failed to read '${path}': ${(error as Error).message}`));
    }

    try {
      return ok(load(contents) as Config);
    } catch (error) {
      return err(new Error(`Failed to parse YAML in '${path}': ${(error as Error).message}`));
    }
  }

  write(_path: string, _config: Config): Result<void> {
    return err(new Error('ConfigAdapter.write is not implemented yet'));
  }

  validate(_config: Config): Result<void> {
    return err(new Error('ConfigAdapter.validate is not implemented yet'));
  }
}
