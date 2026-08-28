import axios from 'axios';
import { createHash } from 'node:crypto';
import { execa } from 'execa';
import type { ISkillsAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { BrowseView, IDE, Skill } from '../types/index.js';
import { getApiBaseUrl } from '../config/website.js';
import { toSkillsAddSource } from '../backend/skills-add-source.js';

/** skills.sh V1Skill listing fields. `source` here is owner/repo, not SkillSource. */
interface SkillsShHit {
  id: string;
  name?: string;
  source?: string;
  installs?: number;
  installUrl?: string;
  url?: string;
}

interface SkillsListResponse {
  data: SkillsShHit[];
}

/**
 * vercel-labs/skills `--agent` names. `claude` is `claude-code`.
 * `agents` has no vercel name; `universal` is the documented agent that
 * writes `.agents/skills/`.
 */
const SKILLS_ADD_AGENT: Record<IDE, string> = {
  cursor: 'cursor',
  claude: 'claude-code',
  codex: 'codex',
  copilot: 'github-copilot',
  windsurf: 'windsurf',
  agents: 'universal',
};

function mapSkillsShHit(hit: SkillsShHit): Skill {
  return {
    id: hit.id,
    source: 'skills.sh',
    installedAt: '',
    ...(hit.installs !== undefined ? { installs: hit.installs } : {}),
    ...(hit.name ? { name: hit.name } : {}),
    ...(hit.source ? { repo: hit.source } : {}),
    ...(hit.installUrl ? { installUrl: hit.installUrl } : {}),
    ...(hit.url ? { url: hit.url } : {}),
  };
}

/**
 * Real implementation of ISkillsAdapter. `search` calls skil's own
 * backend (see `src/backend/skills-proxy.ts`), which authenticates to
 * skills.sh with a Vercel OIDC token — so no API key is ever needed here.
 * `install`/`convert` still shell out locally with `cwd` set to the
 * project root; skills.sh has no HTTP endpoint for either. `install`
 * picks the `--agent` flag from the target IDE and `--copy` so files
 * can be moved into this IDE's skills dir (Cursor's npx path is
 * `.agents/skills`, not `.cursor/skills`). Tests use
 * InMemorySkillsAdapter instead so CollectionEngine tests never hit the
 * network or spawn subprocesses.
 */
export class SkillsAdapter implements ISkillsAdapter {
  constructor(
    private readonly apiBaseUrl: string = getApiBaseUrl(),
    private readonly projectRoot: string = process.cwd()
  ) {}

  async search(query: string): Promise<Result<Skill[]>> {
    try {
      const response = await axios.get<SkillsListResponse>(`${this.apiBaseUrl}/api/skills/search`, {
        params: { q: query },
      });

      return ok(response.data.data.map(mapSkillsShHit));
    } catch (error) {
      return err(new Error(`Failed to search skills for '${query}': ${(error as Error).message}`));
    }
  }

  async browse(view: BrowseView): Promise<Result<Skill[]>> {
    try {
      const response = await axios.get<SkillsListResponse>(`${this.apiBaseUrl}/api/skills`, {
        params: { view, limit: 500 },
      });

      return ok(response.data.data.map(mapSkillsShHit));
    } catch (error) {
      return err(new Error(`Failed to browse ${view} skills: ${(error as Error).message}`));
    }
  }

  async install(skillId: string, targetIDE: IDE, opts?: { cwd?: string }): Promise<Result<void>> {
    try {
      await execa(
        'npx',
        [
          'skills',
          'add',
          toSkillsAddSource(skillId),
          '--agent',
          SKILLS_ADD_AGENT[targetIDE],
          '--copy',
          '-y',
        ],
        { cwd: opts?.cwd ?? this.projectRoot }
      );
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stderr =
        typeof error === 'object' && error && 'stderr' in error ? String((error as { stderr: unknown }).stderr).trim() : '';
      return err(
        new Error(`Failed to install skill '${skillId}': ${message}${stderr ? `\n${stderr}` : ''}`)
      );
    }
  }

  async convert(skillId: string, targetIDE: IDE): Promise<Result<void>> {
    try {
      await execa('skillsmith', ['convert', skillId, '--to', targetIDE], { cwd: this.projectRoot });
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

  async skillHash(skillId: string): Promise<Result<string | null>> {
    try {
      const response = await axios.get<{ data: { skillMd: string | null } }>(
        `${this.apiBaseUrl}/api/market/preview`,
        { params: { id: skillId } }
      );
      const skillMd = response.data.data.skillMd;
      if (!skillMd) {
        return ok(null);
      }
      return ok(createHash('sha256').update(skillMd, 'utf8').digest('hex'));
    } catch {
      return ok(null);
    }
  }
}
