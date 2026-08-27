import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { IUsageCollector } from '../interfaces/adapters.js';
import { ok, type Result } from '../core/result.js';
import type { UsageEvent } from '../types/index.js';

export function encodeClaudeProjectPath(projectRoot: string): string {
  const normalized = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.replace(/\//g, '-');
}

type ClaudeToolUse = {
  type?: string;
  name?: string;
  input?: { file_path?: string };
};

type ClaudeLine = {
  type?: string;
  message?: { content?: ClaudeToolUse[] | string };
};

/**
 * Reads Claude Code session JSONL under `~/.claude/projects/<encoded-cwd>/`.
 * Counts Read tool calls whose path is a catalog skill's SKILL.md.
 * Missing dir or unreadable files → []. Copilot/Cursor logs are not parsed.
 */
export class ClaudeUsageCollector implements IUsageCollector {
  constructor(
    private readonly homeDir: string = homedir()
  ) {}

  async collect(opts: { projectRoot: string; skillIds: string[] }): Promise<Result<UsageEvent[]>> {
    const dir = join(this.homeDir, '.claude', 'projects', encodeClaudeProjectPath(opts.projectRoot));
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return ok([]);
      }
      return ok([]);
    }

    const events: UsageEvent[] = [];
    const jsonl = names.filter((name) => name.endsWith('.jsonl'));
    for (const name of jsonl) {
      let text: string;
      try {
        text = await readFile(join(dir, name), 'utf8');
      } catch {
        continue;
      }
      for (const line of text.split('\n')) {
        const skillId = skillIdFromClaudeLine(line, opts.skillIds);
        if (skillId) {
          events.push({ skillId, source: 'claude' });
        }
      }
    }
    return ok(events);
  }
}

function skillIdFromClaudeLine(line: string, skillIds: string[]): string | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  let parsed: ClaudeLine;
  try {
    parsed = JSON.parse(trimmed) as ClaudeLine;
  } catch {
    return undefined;
  }
  const content = parsed.message?.content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const block of content) {
    if (block.type !== 'tool_use' || block.name !== 'Read') {
      continue;
    }
    const filePath = block.input?.file_path;
    if (!filePath) {
      continue;
    }
    const matched = matchSkillId(filePath, skillIds);
    if (matched) {
      return matched;
    }
  }
  return undefined;
}

function matchSkillId(filePath: string, skillIds: string[]): string | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  const matches = skillIds.filter((id) => normalized.endsWith(`/${id}/SKILL.md`));
  return matches.sort((a, b) => b.length - a.length)[0];
}
