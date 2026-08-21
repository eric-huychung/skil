import type { IConfigAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { Config } from '../types/index.js';

/**
 * In-memory stand-in for the real ConfigAdapter, used as a test double.
 * Not for production use.
 */
export class InMemoryConfigAdapter implements IConfigAdapter {
  private configs = new Map<string, Config>();

  read(path: string): Result<Config> {
    if (!this.configs.has(path)) {
      return err(new Error(`No config exists at '${path}'`));
    }
    return ok(this.configs.get(path) as Config);
  }

  validate(config: Config): Result<void> {
    if (typeof config.collections !== 'object' || config.collections === null) {
      return err(new Error(
        "Config must have a 'collections' object mapping collection names to skill ID arrays, e.g.:\ncollections:\n  frontend:\n    - owner/skill-name"
      ));
    }
    for (const [name, skills] of Object.entries(config.collections)) {
      if (!Array.isArray(skills)) {
        return err(new Error(`Collection '${name}' must be an array of skill IDs, e.g. ['owner/skill-name']`));
      }
    }
    return ok(undefined);
  }

  /** Test helper: seeds the in-memory contents of a config file at `path`. */
  write(path: string, config: Config): void {
    this.configs.set(path, config);
  }

  /** Test helper: clears all in-memory state between tests. */
  reset(): void {
    this.configs.clear();
  }
}
