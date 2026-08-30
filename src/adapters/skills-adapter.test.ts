import { afterEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { execa } from 'execa';
import { isErr, isOk } from '../core/result.js';
import { website } from '../config/website.js';
import { SkillsAdapter } from './skills-adapter.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

describe('SkillsAdapter', () => {
  afterEach(() => {
    nock.cleanAll();
    vi.mocked(execa).mockReset();
  });

  describe('search', () => {
    it('returns skills parsed from a successful backend response, with no auth required', async () => {
      nock(website.apiBaseUrl)
        .get('/api/skills/search')
        .query({ q: 'react' })
        .reply(200, {
          data: [{ id: 'obra/react-patterns' }],
        });

      const adapter = new SkillsAdapter();
      const result = await adapter.search('react');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([{ id: 'obra/react-patterns', source: 'skills.sh', installedAt: '' }]);
      }
    });

    it('calls a custom backend URL when SKIL_API_URL is set', async () => {
      nock('https://backend.example').get('/api/skills/search').query({ q: 'react' }).reply(200, { data: [] });

      const adapter = new SkillsAdapter('https://backend.example');
      const result = await adapter.search('react');

      expect(isOk(result)).toBe(true);
    });

    it('returns an empty array when no skills match', async () => {
      nock(website.apiBaseUrl).get('/api/skills/search').query(true).reply(200, { data: [] });

      const adapter = new SkillsAdapter();
      const result = await adapter.search('nonexistent-skill-xyz');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns an error when the backend request fails', async () => {
      nock(website.apiBaseUrl).get('/api/skills/search').query(true).reply(502, { message: 'skills.sh unavailable' });

      const adapter = new SkillsAdapter();
      const result = await adapter.search('react');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('react');
      }
    });
  });

  describe('install', () => {
    it('installs with cwd = project root and always the universal agent flag', async () => {
      vi.mocked(execa).mockResolvedValue({} as never);

      const adapter = new SkillsAdapter(website.apiBaseUrl, '/tmp/proj');
      const result = await adapter.install('obra/x');

      expect(isOk(result)).toBe(true);
      expect(execa).toHaveBeenCalledWith(
        'npx',
        ['skills', 'add', 'obra/x', '--agent', 'universal', '--copy', '-y'],
        {
          cwd: '/tmp/proj',
        }
      );
    });

    it('rewrites owner/repo/skill ids to owner/repo@skill so npx can find nested skills', async () => {
      vi.mocked(execa).mockResolvedValue({} as never);

      const adapter = new SkillsAdapter(website.apiBaseUrl, '/tmp/proj');
      const result = await adapter.install('anthropics/skills/frontend-design');

      expect(isOk(result)).toBe(true);
      expect(execa).toHaveBeenCalledWith(
        'npx',
        ['skills', 'add', 'anthropics/skills@frontend-design', '--agent', 'universal', '--copy', '-y'],
        { cwd: '/tmp/proj' }
      );
    });

    it('installs with cwd override when dest is passed', async () => {
      vi.mocked(execa).mockResolvedValue({} as never);

      const adapter = new SkillsAdapter(website.apiBaseUrl, '/tmp/proj');
      const result = await adapter.install('obra/x', { cwd: '/tmp/other-project' });

      expect(isOk(result)).toBe(true);
      expect(execa).toHaveBeenCalledWith(
        'npx',
        ['skills', 'add', 'obra/x', '--agent', 'universal', '--copy', '-y'],
        {
          cwd: '/tmp/other-project',
        }
      );
    });

    it('runs npx once per install', async () => {
      vi.mocked(execa).mockResolvedValue({} as never);

      const adapter = new SkillsAdapter(website.apiBaseUrl, '/tmp/proj');
      await adapter.install('obra/x');

      expect(execa).toHaveBeenCalledTimes(1);
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

  describe('browse', () => {
    it('maps leaderboard hits including install counts from a successful backend response', async () => {
      nock(website.apiBaseUrl)
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

    it('maps listing metadata without treating skills.sh source as Skill.source', async () => {
      nock(website.apiBaseUrl)
        .get('/api/skills')
        .query({ view: 'all-time' })
        .reply(200, {
          data: [
            {
              id: 'vercel-labs/skills/find-skills',
              slug: 'find-skills',
              name: 'find-skills',
              source: 'vercel-labs/skills',
              installs: 3052722,
              sourceType: 'github',
              installUrl: 'https://github.com/vercel-labs/skills',
              url: 'https://www.skills.sh/vercel-labs/skills/find-skills',
            },
          ],
        });

      const adapter = new SkillsAdapter();
      const result = await adapter.browse('all-time');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([
          {
            id: 'vercel-labs/skills/find-skills',
            source: 'skills.sh',
            installedAt: '',
            installs: 3052722,
            name: 'find-skills',
            repo: 'vercel-labs/skills',
            installUrl: 'https://github.com/vercel-labs/skills',
            url: 'https://www.skills.sh/vercel-labs/skills/find-skills',
          },
        ]);
      }
    });

    it('requests the trending view from the same backend path', async () => {
      nock(website.apiBaseUrl)
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
      nock(website.apiBaseUrl)
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

  describe('skillHash', () => {
    it('hashes the live SKILL.md from market preview', async () => {
      nock(website.apiBaseUrl)
        .get('/api/market/preview')
        .query({ id: 'obra/react-patterns' })
        .reply(200, { data: { skillMd: '# hello\n' } });

      const adapter = new SkillsAdapter();
      const result = await adapter.skillHash('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('returns null when preview has no body or the request fails', async () => {
      nock(website.apiBaseUrl)
        .get('/api/market/preview')
        .query({ id: 'missing' })
        .reply(404, { error: 'not_found' });

      const adapter = new SkillsAdapter();
      const result = await adapter.skillHash('missing');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBeNull();
      }
    });
  });
});
