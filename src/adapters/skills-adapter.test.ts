import { afterEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { execa } from 'execa';
import { isErr, isOk } from '../core/result.js';
import { SkillsAdapter } from './skills-adapter.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

describe('SkillsAdapter', () => {
  afterEach(() => {
    nock.cleanAll();
    vi.mocked(execa).mockReset();
  });

  describe('search', () => {
    it('returns skills parsed from a successful backend response, with no auth required', async () => {
      nock('https://contextkit.dev')
        .get('/api/skills/search')
        .query({ q: 'react' })
        .reply(200, {
          data: [{ id: 'obra/react-patterns', name: 'react-patterns', source: 'obra/react-patterns', sourceType: 'github' }],
        });

      const adapter = new SkillsAdapter();
      const result = await adapter.search('react');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([{ id: 'obra/react-patterns', source: 'skills.sh', installedAt: '' }]);
      }
    });

    it('calls a custom backend URL when CONTEXTKIT_API_URL is set', async () => {
      nock('https://backend.example').get('/api/skills/search').query({ q: 'react' }).reply(200, { data: [] });

      const adapter = new SkillsAdapter('https://backend.example');
      const result = await adapter.search('react');

      expect(isOk(result)).toBe(true);
    });

    it('returns an empty array when no skills match', async () => {
      nock('https://contextkit.dev').get('/api/skills/search').query(true).reply(200, { data: [] });

      const adapter = new SkillsAdapter();
      const result = await adapter.search('nonexistent-skill-xyz');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns an error when the backend request fails', async () => {
      nock('https://contextkit.dev').get('/api/skills/search').query(true).reply(502, { message: 'skills.sh unavailable' });

      const adapter = new SkillsAdapter();
      const result = await adapter.search('react');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('react');
      }
    });
  });

  describe('install', () => {
    it('installs a skill by running npx skills add', async () => {
      vi.mocked(execa).mockResolvedValue({} as never);

      const adapter = new SkillsAdapter();
      const result = await adapter.install('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      expect(execa).toHaveBeenCalledWith('npx', ['skills', 'add', 'obra/react-patterns']);
    });

    it('returns an error when the subprocess fails', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('npx: command failed with exit code 1'));

      const adapter = new SkillsAdapter();
      const result = await adapter.install('obra/react-patterns');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('obra/react-patterns');
        expect(result.error.message).toContain('command failed');
      }
    });
  });

  describe('convert', () => {
    it('converts a skill by running skillsmith convert', async () => {
      vi.mocked(execa).mockResolvedValue({} as never);

      const adapter = new SkillsAdapter();
      const result = await adapter.convert('obra/react-patterns', 'cursor');

      expect(isOk(result)).toBe(true);
      expect(execa).toHaveBeenCalledWith('skillsmith', ['convert', 'obra/react-patterns', '--to', 'cursor']);
    });

    it('returns an actionable error when skillsmith is not installed', async () => {
      const enoent = Object.assign(new Error('spawn skillsmith ENOENT'), { code: 'ENOENT' });
      vi.mocked(execa).mockRejectedValue(enoent);

      const adapter = new SkillsAdapter();
      const result = await adapter.convert('obra/react-patterns', 'claude');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('skillsmith');
        expect(result.error.message).toContain('npm install');
      }
    });

    it('returns an error when the subprocess fails for another reason', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('conversion failed: unsupported format'));

      const adapter = new SkillsAdapter();
      const result = await adapter.convert('obra/react-patterns', 'windsurf');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('obra/react-patterns');
        expect(result.error.message).toContain('unsupported format');
      }
    });
  });

  describe('browse', () => {
    it('maps leaderboard hits including install counts from a successful backend response', async () => {
      nock('https://contextkit.dev')
        .get('/api/skills')
        .query({ view: 'all-time' })
        .reply(200, {
          data: [{ id: 'obra/react-patterns', installs: 1200 }],
        });

      const adapter = new SkillsAdapter();
      const result = await adapter.browse('all-time');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([
          { id: 'obra/react-patterns', source: 'skills.sh', installedAt: '', installs: 1200 },
        ]);
      }
    });

    it('requests the trending view from the same backend path', async () => {
      nock('https://contextkit.dev')
        .get('/api/skills')
        .query({ view: 'trending' })
        .reply(200, {
          data: [{ id: 'vercel-labs/security-review', installs: 90 }],
        });

      const adapter = new SkillsAdapter();
      const result = await adapter.browse('trending');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([
          { id: 'vercel-labs/security-review', source: 'skills.sh', installedAt: '', installs: 90 },
        ]);
      }
    });

    it('returns an error when the backend request fails', async () => {
      nock('https://contextkit.dev')
        .get('/api/skills')
        .query({ view: 'all-time' })
        .reply(502, { message: 'skills.sh unavailable' });

      const adapter = new SkillsAdapter();
      const result = await adapter.browse('all-time');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('all-time');
      }
    });
  });
});
