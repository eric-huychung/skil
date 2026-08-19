import type { ISkillsAdapter } from '../interfaces/adapters.js';
import { ok, type Result } from '../core/result.js';
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

  async search(_query: string): Promise<Result<Skill[]>> {
    return ok(HARDCODED_SEARCH_RESULTS);
  }

  async install(skillId: string): Promise<Result<void>> {
    this.installed.push({ id: skillId, source: 'skills.sh', installedAt: new Date().toISOString() });
    return ok(undefined);
  }

  async convert(_skillId: string, _targetIDE: IDE): Promise<Result<void>> {
    return ok(undefined);
  }

  getInstalled(): Skill[] {
    return [...this.installed];
  }

  /** Test helper: clears all in-memory state between tests. */
  reset(): void {
    this.installed = [];
  }
}
