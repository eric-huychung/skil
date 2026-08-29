import axios from 'axios';
import { err, isOk, ok, type Result } from '../core/result.js';
import type { BrowseView, Skill } from '../types/index.js';
import type { MarketSearchRow, ShelfRole } from './market-types.js';

export interface DiscoverHit {
  id: string;
  name?: string;
  installs?: number;
}

export interface DiscoverPreview {
  id: string;
  name: string;
  installs: number;
  url: string;
  installUrl: string | null;
  installCommand: string;
  skillMd: string | null;
  audit: { status: 'pass' | 'warn' | 'fail' | 'none' };
}

export interface Discover {
  shelves(): Promise<Result<ShelfRole[]>>;
  search(query: string): Promise<Result<DiscoverHit[]>>;
  preview(id: string): Promise<Result<DiscoverPreview>>;
  browse(view: BrowseView): Promise<Result<DiscoverHit[]>>;
}

type GetJson = (url: string, config?: { params?: Record<string, string> }) => Promise<{ data: { data: unknown } }>;

/**
 * One Discover seam for CLI and GUI. Index reads hit `/api/market/*`.
 * Live browse is the adapter the caller already has (skills.sh leaderboard).
 */
export function createDiscover(opts: {
  apiBaseUrl: string;
  browse: (view: BrowseView) => Promise<Result<Skill[]>>;
  get?: GetJson;
}): Discover {
  const base = opts.apiBaseUrl.replace(/\/+$/, '');
  const get = opts.get ?? axios.get.bind(axios);

  return {
    async shelves() {
      try {
        const response = await get(`${base}/api/market/shelves`);
        return ok(response.data.data as ShelfRole[]);
      } catch {
        return err(new Error('store_error'));
      }
    },
    async search(query: string) {
      try {
        const response = await get(`${base}/api/market/search`, { params: { q: query } });
        return ok(response.data.data as MarketSearchRow[]);
      } catch {
        return err(new Error('store_error'));
      }
    },
    async preview(id: string) {
      try {
        const response = await get(`${base}/api/market/preview`, { params: { id } });
        return ok(response.data.data as DiscoverPreview);
      } catch {
        return err(new Error('store_error'));
      }
    },
    async browse(view: BrowseView) {
      const result = await opts.browse(view);
      if (!isOk(result)) {
        return err(result.error);
      }
      return ok(
        result.value.map((skill) => ({
          id: skill.id,
          name: skill.name,
          installs: skill.installs,
        }))
      );
    },
  };
}

/** Test / help-only fallback: typed search and browse stay on the engine. */
export function engineAsDiscover(engine: {
  search(query: string): Promise<Result<Skill[]>>;
  browse(view: BrowseView): Promise<Result<Skill[]>>;
}): Discover {
  return {
    shelves: async () => ok([]),
    search: (query) => engine.search(query),
    preview: async () => err(new Error('unused')),
    browse: (view) => engine.browse(view),
  };
}
