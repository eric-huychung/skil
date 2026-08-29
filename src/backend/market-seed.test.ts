import { describe, expect, it } from 'vitest';
import { isOk } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import { SEED_FIELDS, SEED_ROLES } from './market-seed.js';

describe('market-seed', () => {
  it('seeds 6 roles and 21 fields', () => {
    expect(SEED_ROLES).toHaveLength(6);
    expect(SEED_FIELDS).toHaveLength(21);
    expect(SEED_ROLES.map((role) => role.slug)).toEqual(['swe', 'ui-ux', 'pm', 'data', 'agent', 'other']);
    expect(SEED_FIELDS.some((field) => field.slug === 'sql')).toBe(false);
    expect(SEED_FIELDS.some((field) => field.slug === 'workflow')).toBe(true);
    expect(SEED_FIELDS.some((field) => field.slug === 'integrations')).toBe(true);
  });

  it('every field points at a seeded role', () => {
    const roleSlugs = new Set(SEED_ROLES.map((role) => role.slug));
    for (const field of SEED_FIELDS) {
      expect(roleSlugs.has(field.roleSlug)).toBe(true);
    }
  });

  it('field slugs are unique', () => {
    const slugs = SEED_FIELDS.map((field) => field.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('loads into MarketStore and produces one shelf per role with fields, all empty until refresh', async () => {
    const store = new InMemoryMarketStore();
    for (const role of SEED_ROLES) {
      await store.upsertRole(role);
    }
    for (const field of SEED_FIELDS) {
      await store.upsertField(field);
    }

    const shelves = await store.listShelves();
    expect(isOk(shelves)).toBe(true);
    if (!isOk(shelves)) return;

    expect(shelves.value.map((role) => role.slug)).toEqual(['swe', 'ui-ux', 'pm', 'data', 'agent', 'other']);
    const totalFields = shelves.value.reduce((sum, role) => sum + role.fields.length, 0);
    expect(totalFields).toBe(21);
    for (const role of shelves.value) {
      for (const field of role.fields) {
        expect(field.skills).toEqual([]);
      }
    }
  });
});
