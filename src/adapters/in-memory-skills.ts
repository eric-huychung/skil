import type { ISkillsAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { BrowseView, IDE, Skill } from '../types/index.js';

const HARDCODED_SEARCH_RESULTS: Skill[] = [
  { id: 'obra/react-patterns', source: 'skills.sh', installedAt: '' },
  { id: 'addyosmani/performance-review', source: 'skills.sh', installedAt: '' },
];

const HARDCODED_ALL_TIME: Skill[] = [
  { id: 'obra/react-patterns', source: 'skills.sh', installedAt: '', installs: 1200 },
  { id: 'addyosmani/performance-review', source: 'skills.sh', installedAt: '', installs: 800 },
];

const HARDCODED_TRENDING: Skill[] = [
  { id: 'vercel-labs/security-review', source: 'skills.sh', installedAt: '', installs: 90 },
  { id: 'obra/superpowers', source: 'skills.sh', installedAt: '', installs: 50 },
];

/**
 * In-memory stand-in for the real SkillsAdapter, used as a test double.
 * Not for production use.
 */
export class InMemorySkillsAdapter implements ISkillsAdapter {
  private installed: Skill[] = [];
  private installError: Error | null = null;
  private searchError: Error | null = null;
  private browseError: Error | null = null;
  private convertError: Error | null = null;

  async search(_query: string): Promise<Result<Skill[]>> {
    if (this.searchError) {
      return err(this.searchError);
    }
    return ok(HARDCODED_SEARCH_RESULTS);
  }

  async browse(view: BrowseView): Promise<Result<Skill[]>> {
    if (this.browseError) {
      return err(this.browseError);
    }
    return ok(view === 'trending' ? HARDCODED_TRENDING : HARDCODED_ALL_TIME);
  }

  async install(skillId: string): Promise<Result<void>> {
    if (this.installError) {
      return err(this.installError);
    }
    this.installed.push({ id: skillId, source: 'skills.sh', installedAt: new Date().toISOString() });
    return ok(undefined);
  }

  async convert(_skillId: string, _targetIDE: IDE): Promise<Result<void>> {
    if (this.convertError) {
      return err(this.convertError);
    }
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

  /** Test helper: makes the next browse() call(s) fail with `error`. */
  setBrowseError(error: Error): void {
    this.browseError = error;
  }

  /** Test helper: makes the next convert() call(s) fail with `error`. */
  setConvertError(error: Error): void {
    this.convertError = error;
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
    this.browseError = null;
    this.convertError = null;
  }
}
