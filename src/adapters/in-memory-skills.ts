import type { ISkillsAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { IDE, Skill } from '../types/index.js';

const HARDCODED_SEARCH_RESULTS: Skill[] = [
  { id: 'obra/react-patterns', source: 'skills.sh', installedAt: '' },
  { id: 'addyosmani/performance-review', source: 'skills.sh', installedAt: '' },
];

/**
 * In-memory stand-in for the real SkillsAdapter, used as a test double.
 * Not for production use.
 */
export class InMemorySkillsAdapter implements ISkillsAdapter {
  private installed: Skill[] = [];
  private installError: Error | null = null;
  private searchError: Error | null = null;

  async search(_query: string): Promise<Result<Skill[]>> {
    if (this.searchError) {
      return err(this.searchError);
    }
    return ok(HARDCODED_SEARCH_RESULTS);
  }

  async install(skillId: string): Promise<Result<void>> {
    if (this.installError) {
      return err(this.installError);
    }
    this.installed.push({ id: skillId, source: 'skills.sh', installedAt: new Date().toISOString() });
    return ok(undefined);
  }

  async convert(_skillId: string, _targetIDE: IDE): Promise<Result<void>> {
    return ok(undefined);
  }

  getInstalled(): Skill[] {
    return [...this.installed];
  }

  /** Test helper: makes the next install() call(s) fail with `error`. */
  setInstallError(error: Error): void {
    this.installError = error;
  }

  /** Test helper: makes the next search() call(s) fail with `error`. */
  setSearchError(error: Error): void {
    this.searchError = error;
  }

  /** Test helper: seeds skills as if already installed by external tooling. */
  seedInstalled(skills: Skill[]): void {
    this.installed.push(...skills);
  }

  /** Test helper: clears all in-memory state between tests. */
  reset(): void {
    this.installed = [];
    this.installError = null;
    this.searchError = null;
  }
}
