import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, ok } from './result.js';

describe('ok', () => {
  it('creates a successful result carrying the value', () => {
    const result = ok(42);

    expect(result).toEqual({ ok: true, value: 42 });
  });
});

describe('err', () => {
  it('creates a failed result carrying the error', () => {
    const error = new Error('collection not found');
    const result = err(error);

    expect(result).toEqual({ ok: false, error });
  });
});

describe('isOk', () => {
  it('returns true for success results', () => {
    expect(isOk(ok('value'))).toBe(true);
  });

  it('returns false for error results', () => {
    expect(isOk(err(new Error('boom')))).toBe(false);
  });

  it('narrows the type so .value is accessible without a cast', () => {
    const result = ok({ name: 'frontend' });

    if (isOk(result)) {
      // If this didn't narrow correctly, TypeScript would fail to compile.
      expect(result.value.name).toBe('frontend');
    } else {
      throw new Error('expected isOk to be true');
    }
  });
});

describe('isErr', () => {
  it('returns true for error results', () => {
    expect(isErr(err(new Error('boom')))).toBe(true);
  });

  it('returns false for success results', () => {
    expect(isErr(ok('value'))).toBe(false);
  });

  it('narrows the type so .error is accessible without a cast', () => {
    const result = err(new Error('collection not found'));

    if (isErr(result)) {
      expect(result.error.message).toBe('collection not found');
    } else {
      throw new Error('expected isErr to be true');
    }
  });
});
