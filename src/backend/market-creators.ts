import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

/** Number of slots on the Creators shelf. */
export const CREATORS_SHELF_SIZE = 30;

/** One Creators shelf slot, in display order. */
export interface CreatorEntry {
  slug: string;
  label: string;
  /** GitHub owners (first segment of `source`); several for an alias group. */
  owners: string[];
  pinned: boolean;
  /** Derived: any owner is in `officialOwners` ("Official on skills.sh"). */
  official: boolean;
  /** Optional tech-gate override, used only by the creators report. */
  tech?: boolean;
}

export interface CreatorsConfig {
  updatedAt: string;
  techCutoff: number;
  officialFetchedAt: string;
  officialOwners: string[];
  blocked: string[];
  creators: CreatorEntry[];
}

const CREATORS_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../data/market-creators.yaml');

function fail(message: string): never {
  throw new Error(`market-creators: ${message}`);
}

function dateString(value: unknown, field: string): string {
  const normalized =
    value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' ? value : '';
  if (normalized.length === 0) {
    fail(`${field} must be a non-empty date string`);
  }
  return normalized;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    fail(`${field} must be an array of non-empty strings`);
  }
  return value as string[];
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${field} must be a non-empty string`);
  }
  return value;
}

/** Parses and validates `data/market-creators.yaml`. Throws on malformed input. */
export function parseMarketCreators(contents: string): CreatorsConfig {
  const parsed = yaml.load(contents);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('root must be an object');
  }
  const root = parsed as Record<string, unknown>;

  const updatedAt = dateString(root.updatedAt, 'updatedAt');
  const officialFetchedAt = dateString(root.officialFetchedAt, 'officialFetchedAt');
  const { techCutoff } = root;
  if (typeof techCutoff !== 'number' || techCutoff < 0 || techCutoff > 1) {
    fail('techCutoff must be a number between 0 and 1');
  }
  const officialOwners = stringArray(root.officialOwners, 'officialOwners');
  if (officialOwners.length === 0) {
    fail('officialOwners must not be empty');
  }
  const blocked = stringArray(root.blocked ?? [], 'blocked');

  if (!Array.isArray(root.creators)) {
    fail('creators must be an array');
  }
  if (root.creators.length !== CREATORS_SHELF_SIZE) {
    fail(`creators must have exactly ${CREATORS_SHELF_SIZE} entries, got ${root.creators.length}`);
  }

  const official = new Set(officialOwners);
  const blockedSet = new Set(blocked);
  const slugs = new Set<string>();
  const ownerToSlug = new Map<string, string>();
  let seenUnpinned = false;

  const creators = root.creators.map((raw: unknown, index): CreatorEntry => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      fail(`creators[${index}] must be an object`);
    }
    const entry = raw as Record<string, unknown>;
    const slug = nonEmptyString(entry.slug, `creators[${index}].slug`);
    const label = nonEmptyString(entry.label, `creators[${index}].label`);
    const owners = stringArray(entry.owners, `creators[${index}].owners`);
    if (owners.length === 0) {
      fail(`creators[${index}].owners must not be empty`);
    }
    if (entry.pinned !== undefined && typeof entry.pinned !== 'boolean') {
      fail(`creators[${index}].pinned must be a boolean`);
    }
    if (entry.tech !== undefined && typeof entry.tech !== 'boolean') {
      fail(`creators[${index}].tech must be a boolean`);
    }
    const pinned = entry.pinned === true;

    if (pinned && seenUnpinned) {
      fail(`pinned creator "${slug}" must come before all unpinned creators`);
    }
    seenUnpinned ||= !pinned;

    if (slugs.has(slug)) {
      fail(`duplicate slug "${slug}"`);
    }
    slugs.add(slug);

    for (const owner of owners) {
      const claimedBy = ownerToSlug.get(owner);
      if (claimedBy !== undefined) {
        fail(`owner "${owner}" belongs to both "${claimedBy}" and "${slug}"`);
      }
      ownerToSlug.set(owner, slug);
      if (blockedSet.has(owner)) {
        fail(`owner "${owner}" of "${slug}" is blocked`);
      }
    }

    return {
      slug,
      label,
      owners,
      pinned,
      official: owners.some((owner) => official.has(owner)),
      ...(entry.tech !== undefined ? { tech: entry.tech as boolean } : {}),
    };
  });

  return { updatedAt, techCutoff, officialFetchedAt, officialOwners, blocked, creators };
}

/** Loads creators from the repo file. Override `path` in tests. */
export function loadMarketCreators(path = CREATORS_PATH): CreatorsConfig {
  return parseMarketCreators(readFileSync(path, 'utf8'));
}
