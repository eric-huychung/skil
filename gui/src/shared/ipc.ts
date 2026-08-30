import type { Result } from '../../../src/core/result.js';
import type { AdoptResult, BrowseView, Collection, IDE, LeftoverRecord, OriginCheck, OriginStatus, RuleRecord, ScanResult, Skill, SkillRecord, UsageRow } from '../../../src/types/index.js';
import type { MarketSearchRow, ShelfRole } from '../../../src/backend/market-types.js';

export type { AdoptResult, BrowseView, Collection, IDE, LeftoverRecord, MarketSearchRow, OriginCheck, OriginStatus, Result, RuleRecord, ScanResult, ShelfRole, Skill, SkillRecord, UsageRow };

/**
 * Client-side shape of `GET /api/market/preview`'s `data` — not exported by
 * `market-types.ts` since that's the store's `MarketListingDetail` (no
 * `skillMd`/`audit`/`installCommand`; those are assembled in the read
 * handler). This is what the GUI (and Landing) actually receive over HTTP.
 */
export interface MarketPreviewData {
  id: string;
  name: string;
  installs: number;
  url: string;
  installUrl: string | null;
  installCommand: string;
  skillMd: string | null;
  audit: { status: 'pass' | 'warn' | 'fail' | 'none' };
}

/**
 * IPC channel names shared between the main process (handler registration)
 * and the preload script (invoke calls). Renderer code never sees channel
 * names directly — it only sees the typed `window.skil` bridge.
 */
export const IPC_CHANNELS = {
  listCollections: 'skil:list-collections',
  createCollection: 'skil:create-collection',
  removeSkillFromCollection: 'skil:remove-skill-from-collection',
  setCommandEnabled: 'skil:set-command-enabled',
  browseSkills: 'skil:browse-skills',
  listSkills: 'skil:list-skills',
  install: 'skil:install',
  addSkill: 'skil:add-skill',
  deleteCollection: 'skil:delete-collection',
  pickProjectFolder: 'skil:pick-project-folder',
  pickDestinationFolder: 'skil:pick-destination-folder',
  bindProjectFolder: 'skil:bind-project-folder',
  getProjectRoot: 'skil:get-project-root',
  listRecentFolders: 'skil:list-recent-folders',
  removeRecentFolder: 'skil:remove-recent-folder',
  scan: 'skil:scan',
  scanDidRun: 'skil:scan-did-run',
  deleteSkill: 'skil:delete-skill',
  usage: 'skil:usage',
  marketShelves: 'skil:market-shelves',
  marketSearch: 'skil:market-search',
  marketPreview: 'skil:market-preview',
  readSkillMd: 'skil:read-skill-md',
  originChecks: 'skil:origin-checks',
  updateFromMarket: 'skil:update-from-market',
  setSkillEnabled: 'skil:set-skill-enabled',
  listRules: 'skil:list-rules',
  readRule: 'skil:read-rule',
  setSharedRuleEnabled: 'skil:set-shared-rule-enabled',
  listLeftovers: 'skil:list-leftovers',
  adoptLeftovers: 'skil:adopt-leftovers',
} as const;

/**
 * Shape of the bridge exposed to the renderer via `contextBridge`. Engine
 * methods forward 1:1 over IPC and return the same `Result<T>` the engine
 * returns. `pickProjectFolder` / `getProjectRoot` / recent folders are GUI
 * session state — project root is adapter config, not an engine method.
 */
export interface SkilBridge {
  listCollections(): Promise<Collection[]>;
  createCollection(name: string, skillIds: string[]): Promise<Result<Collection>>;
  removeSkillFromCollection(name: string, skillId: string): Promise<Result<Collection>>;
  /**
   * Toggle a command on/off. `true` writes it as a human-only skill in
   * both live trees (restoring from parked, or self-healing, if
   * present); `false` parks it under `.skil/parked/commands/<name>`.
   */
  setCommandEnabled(name: string, enabled: boolean): Promise<Result<Collection>>;
  browseSkills(view: BrowseView): Promise<Result<Skill[]>>;
  /** Catalog rows from the last scan. Used by Sync for counts and source bars. */
  listSkills(): Promise<SkillRecord[]>;
  /**
   * Market `+`: writes a fresh skill into both live trees and upserts its
   * catalog row (`source: 'skills.sh'`). Does not require filing onto a
   * command.
   */
  install(skillId: string): Promise<Result<SkillRecord>>;
  addSkill(name: string, skillId: string): Promise<Result<Collection>>;
  deleteCollection(name: string): Promise<Result<void>>;
  /** Opens a directory dialog and binds the session. Returns the picked path, or `null` if canceled. */
  pickProjectFolder(): Promise<string | null>;
  /** Opens a directory dialog for install/export dest. Does not bind the session. */
  pickDestinationFolder(): Promise<string | null>;
  /** Bind an already-picked folder as the session project. Rebuilds the engine against that path. */
  bindProjectFolder(path: string): Promise<string | null>;
  /** Currently bound project folder, or `null` if none is bound. Last folder is restored on launch. */
  getProjectRoot(): Promise<string | null>;
  /** Up to five most recently bound folders, current first. Survives app restart. */
  listRecentFolders(): Promise<string[]>;
  /** Drop a folder from recents. If it is the bound folder, the session disconnects. Returns the remaining list. */
  removeRecentFolder(path: string): Promise<string[]>;
  /** Pull: scan SKILL.md folders into the catalog. Does not install. */
  scan(): Promise<Result<ScanResult>>;
  /**
   * Watcher (and successful Scan) push. Returns an unsubscribe function.
   * Renderer refreshes lists from this instead of polling.
   */
  onScan(listener: (result: ScanResult) => void): () => void;
  /** Deletes a project skill from disk (all IDE copies). Nested skill folders stay. */
  deleteSkill(skillId: string): Promise<Result<void>>;
  /** Claude-first read counts for catalog skills. Failure is an error Result; UI must not block export. */
  usage(): Promise<Result<UsageRow[]>>;
  /** Market index (Discover backend): role -> category -> top skills. Empty `data: []` if the index has no sync yet. */
  marketShelves(): Promise<Result<ShelfRole[]>>;
  /** Market index search across the full stored index (not just shelved skills). */
  marketSearch(query: string): Promise<Result<MarketSearchRow[]>>;
  /** Market index preview: stored listing fields plus a live SKILL.md/audit fetch. */
  marketPreview(id: string): Promise<Result<MarketPreviewData>>;
  /** On-disk SKILL.md for a catalog id. Missing catalog row or file is an error. */
  readSkillMd(skillId: string): Promise<Result<string>>;
  /** Market origin vs disk vs live SKILL.md. Empty if none of the catalog has originHash. */
  originChecks(): Promise<Result<OriginCheck[]>>;
  /** Re-install from the market. `replaceEdited` resets a forked copy. */
  updateFromMarket(skillId: string, opts?: { replaceEdited?: boolean }): Promise<Result<SkillRecord>>;
  /**
   * Toggle a catalog skill on/off. `false` parks the live pair; `true`
   * restores it (or re-fetches a market skill whose parked copy is gone).
   * This is the write — there is no separate install/export step.
   */
  setSkillEnabled(skillId: string, enabled: boolean): Promise<Result<SkillRecord>>;
  /** Rule rows on disk: shared `AGENTS.md` sections (togglable) plus glob rule files (read-only). Disk is SoT. */
  listRules(): Promise<RuleRecord[]>;
  /** Reads a rule body by id. */
  readRule(id: string): Promise<Result<string>>;
  /**
   * Toggle a shared-law rule. `true` upserts its `AGENTS.md` section
   * (restoring from parked); `false` removes the section and parks the
   * body under `.skil/parked/rules/<id>`. Refuses a `glob` rule id.
   */
  setSharedRuleEnabled(id: string, enabled: boolean): Promise<Result<RuleRecord>>;
  /** Skill/command/rule paths that are neither live nor parked (and never deprecated). */
  listLeftovers(): Promise<Result<LeftoverRecord[]>>;
  /** "Use ours and remove leftovers": copies missing ids into the live pair, then moves old paths to `.skil/deprecated/`. */
  adoptLeftovers(ids?: string[]): Promise<Result<AdoptResult>>;
}
