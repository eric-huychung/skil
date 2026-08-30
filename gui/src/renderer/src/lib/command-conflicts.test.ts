import { describe, expect, it } from 'vitest';
import { conflictLabels, isCommandNameCollision } from './command-conflicts';

describe('conflict codes', () => {
  it('reads command-name-collision labels from the result', () => {
    expect(isCommandNameCollision({ code: 'COMMAND_NAME_COLLISION' })).toBe(true);
    expect(conflictLabels({ labels: ['build'] })).toEqual(['build']);
    expect(isCommandNameCollision({})).toBe(false);
  });
});
