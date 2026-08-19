import { afterEach, describe, expect, it } from 'vitest';
import nock from 'nock';
import { isErr, isOk } from '../core/result.js';
import { SkillsAdapter } from './skills-adapter.js';

describe('SkillsAdapter', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('search', () => {
    it('returns skills parsed from a successful skills.sh response', async () => {
      nock('https://skills.sh')
        .get('/api/v1/skills/search')
        .query({ q: 'react', limit: '20' })
        .matchHeader('authorization', 'Bearer test-key')
        .reply(200, {
          data: [{ id: 'obra/react-patterns', name: 'react-patterns', source: 'obra/react-patterns', sourceType: 'github' }],
        });

      const adapter = new SkillsAdapter('test-key');
      const result = await adapter.search('react');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([{ id: 'obra/react-patterns', source: 'skills.sh', installedAt: '' }]);
      }
    });

    it('returns an empty array when no skills match', async () => {
      nock('https://skills.sh').get('/api/v1/skills/search').query(true).reply(200, { data: [] });

      const adapter = new SkillsAdapter('test-key');
      const result = await adapter.search('nonexistent-skill-xyz');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns an error when the request fails', async () => {
      nock('https://skills.sh').get('/api/v1/skills/search').query(true).reply(500);

      const adapter = new SkillsAdapter('test-key');
      const result = await adapter.search('react');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('react');
      }
    });

    it('returns an error when no API key is configured', async () => {
      const original = process.env.SKILLS_API_KEY;
      delete process.env.SKILLS_API_KEY;

      try {
        const adapter = new SkillsAdapter();
        const result = await adapter.search('react');

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.message).toContain('SKILLS_API_KEY');
        }
      } finally {
        if (original !== undefined) process.env.SKILLS_API_KEY = original;
      }
    });
  });
});
