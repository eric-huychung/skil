import axios from 'axios';
import { execa } from 'execa';
import type { ISkillsAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { BrowseView, IDE, Skill } from '../types/index.js';
import { getApiBaseUrl } from '../config/website.js';

interface SkillsSearchResponse {
  data: Array<{ id: string }>;
}

interface SkillsBrowseResponse {
  data: Array<{ id: string; installs?: number }>;
}

/**
 * Real implementation of ISkillsAdapter. `search` calls ContextKit's own
 * backend (see `src/backend/skills-proxy.ts`), which authenticates to
 * skills.sh with a Vercel OIDC token — so no API key is ever needed here.
 * `install`/`convert` still shell out locally; skills.sh has no HTTP
 * endpoint for either. Tests use InMemorySkillsAdapter instead so
 * CollectionEngine tests never hit the network or spawn subprocesses.
 */
export class SkillsAdapter implements ISkillsAdapter {
  constructor(private readonly apiBaseUrl: string = getApiBaseUrl()) {}

  async search(query: string): Promise<Result<Skill[]>> {
    try {
      const response = await axios.get<SkillsSearchResponse>(`${this.apiBaseUrl}/api/skills/search`, {
        params: { q: query },
      });

      const skills: Skill[] = response.data.data.map((result) => ({
        id: result.id,
        source: 'skills.sh',
        installedAt: '',
      }));
      return ok(skills);
    } catch (error) {
      return err(new Error(`Failed to search skills for '${query}': ${(error as Error).message}`));
    }
  }

  async browse(view: BrowseView): Promise<Result<Skill[]>> {
    try {
      const response = await axios.get<SkillsBrowseResponse>(`${this.apiBaseUrl}/api/skills`, {
        params: { view },
      });

      const skills: Skill[] = response.data.data.map((result) => ({
        id: result.id,
        source: 'skills.sh',
        installedAt: '',
        ...(result.installs !== undefined ? { installs: result.installs } : {}),
      }));
      return ok(skills);
    } catch (error) {
      return err(new Error(`Failed to browse ${view} skills: ${(error as Error).message}`));
    }
  }

  async install(skillId: string): Promise<Result<void>> {
    try {
      await execa('npx', ['skills', 'add', skillId]);
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to install skill '${skillId}': ${(error as Error).message}`));
    }
  }

  async convert(skillId: string, targetIDE: IDE): Promise<Result<void>> {
    try {
      await execa('skillsmith', ['convert', skillId, '--to', targetIDE]);
      return ok(undefined);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return err(new Error("skillsmith is not installed. Run 'npm install -g skillsmith' and try again."));
      }
      return err(new Error(`Failed to convert skill '${skillId}' for ${targetIDE}: ${(error as Error).message}`));
    }
  }

  getInstalled(): Skill[] {
    return [];
  }
}
