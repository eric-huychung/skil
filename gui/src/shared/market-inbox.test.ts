import { describe, expect, it } from 'vitest';
import {
  marketInboxIds,
  mergeMarketInbox,
  parseMarketInbox,
  rememberMarketSkill,
} from './market-inbox.js';

describe('marketInboxIds', () => {
  it('keeps Discover ids and drops skills that came from the project scan', () => {
    expect(
      marketInboxIds(['obra/react-patterns', 'tdd', 'ui/styling'], [
        { id: 'tdd', source: 'local' },
        { id: 'ui/styling', source: 'local' },
        { id: 'obra/react-patterns', source: 'skills.sh' },
      ])
    ).toEqual(['obra/react-patterns']);
  });
});

describe('mergeMarketInbox', () => {
  it('appends new ids and skips duplicates', () => {
    expect(mergeMarketInbox(['obra/react-patterns'], ['obra/react-patterns', 'addyosmani/api-design'])).toEqual([
      'obra/react-patterns',
      'addyosmani/api-design',
    ]);
  });
});

describe('rememberMarketSkill', () => {
  it('adds a new id and is a no-op when it is already present', () => {
    expect(rememberMarketSkill('obra/react-patterns', [])).toEqual(['obra/react-patterns']);
    expect(rememberMarketSkill('obra/react-patterns', ['obra/react-patterns'])).toEqual(['obra/react-patterns']);
  });
});

describe('parseMarketInbox', () => {
  it('reads a stored list and drops junk', () => {
    expect(parseMarketInbox(['obra/react-patterns', 3, '', 'obra/react-patterns'])).toEqual([
      'obra/react-patterns',
    ]);
    expect(parseMarketInbox({ ids: ['obra/react-patterns'] })).toEqual([]);
  });
});
