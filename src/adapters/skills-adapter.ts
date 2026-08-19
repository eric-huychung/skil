import axios from 'axios';
import type { ISkillsAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { IDE, Skill } from '../types/index.js';

const SKILLS_SH_BASE_URL = 'https://skills.sh';
const SEARCH_RESULT_LIMIT = 20;

interface SkillsSearchResponse {
  data: Array<{ id: string }>;
}

/**
 * Real implementation of ISkillsAdapter, backed by the skills.sh search API
 * and (in later tasks) `npx skills add` / `skillsmith`. Used in production;
 * tests use InMemorySkillsAdapter instead so CollectionEngine tests never hit
 * the network or spawn subprocesses.
 */
export class SkillsAdapter implements ISkillsAdapter {
  constructor(private readonly apiKey: string | undefined = process.env.SKILLS_API_KEY) {}

  async search(query: string): Promise<Result<Skill[]>> {
    if (!this.apiKey) {
      return err(new Error('Missing skills.sh API key. Set the SKILLS_API_KEY environment variable.'));
    }

    try {
      const response = await axios.get<SkillsSearchResponse>(`${SKILLS_SH_BASE_URL}/api/v1/skills/search`, {
        params: { q: query, limit: SEARCH_RESULT_LIMIT },
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      const skills: Skill[] = response.data.data.map((result) => ({
        id: result.id,
        source: 'skills.sh',
        installedAt: '',
      }));
      return ok(skills);
    } catch (error) {
      return err(new Error(`Failed to search skills.sh for '${query}': ${(error as Error).message}`));
    }
  }

  async install(_skillId: string): Promise<Result<void>> {
    return err(new Error('SkillsAdapter.install is not implemented yet'));
  }

  async convert(_skillId: string, _targetIDE: IDE): Promise<Result<void>> {
    return err(new Error('SkillsAdapter.convert is not implemented yet'));
  }

  getInstalled(): Skill[] {
    return [];
  }
}
