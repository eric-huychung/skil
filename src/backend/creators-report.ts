import { err, isOk, ok, type Result } from '../core/result.js';
import { creatorKey, gateCreators, type CreatorGateCache, type CreatorGateSkill } from './creator-gate.js';
import { mergeAliases, rankCandidates, selectThirty, type CreatorCandidate } from './creator-ranking.js';
import { CREATORS_SHELF_SIZE, type CreatorsConfig } from './market-creators.js';
import type { MarketStore } from './market-store.js';
import { fetchOfficialOwners } from './official-owners.js';
import type { JevClient } from './jev-client.js';

/**
 * The creators report (design §4.7, laptop only): proposes the 30 Creators slots and prints
 * a paste-ready YAML block. Read-only: it never writes the YAML or the market store.
 */

/** Owners pulled from `market_owner_stats` before merging aliases. */
const TOP_OWNERS = 100;
const GITHUB_USERS_URL = 'https://api.github.com/users/';

/** One candidate's tech-gate answer. `null` probability/domain: Jev could not answer this run. */
export interface GateVerdict {
  techProbability: number | null;
  domain: string | null;
  /** After `tech:` overrides and the YAML cutoff. */
  passes: boolean;
}

/**
 * Tech-gate seam (`JevCreatorGate` below is the real one).
 * Candidates missing from the map pass with no verdict. Without a gate, every candidate passes.
 */
export interface CreatorGate {
  judge(candidates: readonly CreatorCandidate[], config: CreatorsConfig): Promise<Result<Map<string, GateVerdict>>>;
}

export interface JevCreatorGateDeps {
  jev: JevClient;
  /** The label pool supplies skill descriptions; the checks table is the gate cache (its only write). */
  store: Pick<MarketStore, 'listLabelPool'> & CreatorGateCache;
  /** Per-creator Jev failures are reported here (the creator is left out unless `tech: true`). */
  warn?: (line: string) => void;
}

/**
 * The real tech gate (report steps 2-3): Jev via `gateCreators` with its cache, then
 * `tech:` override first, then `blocked`, then probability >= the YAML `techCutoff`.
 * Blocked candidates are not sent to Jev. A store error or Jev auth error fails the gate.
 */
export class JevCreatorGate implements CreatorGate {
  constructor(private readonly deps: JevCreatorGateDeps) {}

  async judge(candidates: readonly CreatorCandidate[], config: CreatorsConfig): Promise<Result<Map<string, GateVerdict>>> {
    const blocked = new Set(config.blocked.map((owner) => owner.toLowerCase()));
    const judged = candidates.filter((c) => !c.owners.some((owner) => blocked.has(owner.toLowerCase())));
    if (judged.length === 0) return ok(new Map());

    const pool = await this.deps.store.listLabelPool();
    if (!isOk(pool)) return err(pool.error);
    const skillsByOwner = new Map<string, CreatorGateSkill[]>();
    for (const row of pool.value) {
      const owner = row.owner.toLowerCase();
      const skills = skillsByOwner.get(owner) ?? [];
      skills.push({ name: row.name, description: row.description, installs: row.installs });
      skillsByOwner.set(owner, skills);
    }

    const gated = await gateCreators(
      judged.map((c) => ({ owners: c.owners, skills: c.owners.flatMap((o) => skillsByOwner.get(o.toLowerCase()) ?? []) })),
      this.deps.jev,
      this.deps.store
    );
    if (!isOk(gated)) return err(gated.error);
    const checks = new Map(gated.value.checks.map((check) => [check.creatorKey, check]));
    for (const failure of gated.value.failed) {
      this.deps.warn?.(`Tech gate: no answer for ${failure.creatorKey} (${failure.message})`);
    }

    const overrides = new Map(config.creators.map((creator) => [creator.slug, creator.tech]));
    const verdicts = new Map<string, GateVerdict>();
    for (const candidate of judged) {
      const check = checks.get(creatorKey(candidate.owners));
      const override = overrides.get(candidate.key);
      verdicts.set(candidate.key, {
        techProbability: check?.techProbability ?? null,
        domain: check?.domain ?? null,
        passes: override ?? (check !== undefined && check.techProbability >= config.techCutoff),
      });
    }
    return ok(verdicts);
  }
}

export interface CreatorsReportDeps {
  store: Pick<MarketStore, 'listTopOwners'>;
  /** The current `data/market-creators.yaml`. */
  config: CreatorsConfig;
  fetchImpl: typeof fetch;
  /** Optional; without it the followers column shows "n/a" and GitHub is not called. */
  githubToken?: string;
  gate?: CreatorGate;
  now?: () => Date;
  size?: number;
}

export interface ReportRow {
  slug: string;
  /** From the YAML when the creator is already there, else the slug (a human edits it). */
  label: string;
  owners: string[];
  pinned: boolean;
  /** Score: installs of the creator's most-installed skill. */
  bestInstalls: number;
  techProbability: number | null;
  domain: string | null;
  followers: number | null;
  official: boolean;
  /** Carried over from the YAML so the paste block keeps it. */
  tech?: boolean;
}

export interface ReportModel {
  rows: ReportRow[];
  /** Proposed slugs not in the current YAML. */
  entering: string[];
  /** Current YAML creators not proposed. */
  leaving: { slug: string; label: string }[];
  /** Freshly fetched, or the saved list when the fetch failed. */
  officialOwners: string[];
  officialFetchedAt: string;
  previousOfficialOwners: string[];
  officialWarning?: string;
}

/** GitHub follower count for `owner`, or `null` on any failure (dotted owners are not GitHub users). */
export async function fetchGithubFollowers(
  owner: string,
  token: string,
  fetchImpl: typeof fetch
): Promise<number | null> {
  try {
    const response = await fetchImpl(`${GITHUB_USERS_URL}${encodeURIComponent(owner)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'skil-creators-report',
      },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { followers?: unknown };
    return typeof body.followers === 'number' ? body.followers : null;
  } catch {
    return null;
  }
}

export async function runCreatorsReport(deps: CreatorsReportDeps): Promise<Result<ReportModel>> {
  const { config } = deps;

  // 1. Top owners, aliases merged. Every YAML creator is an alias group so its slug is the key.
  const top = await deps.store.listTopOwners(TOP_OWNERS);
  if (!isOk(top)) return err(top.error);
  const ranked = rankCandidates(
    mergeAliases(
      top.value,
      config.creators.map((creator) => ({ slug: creator.slug, owners: creator.owners }))
    )
  );

  // 2-3. Tech gate (T12b). No gate: everyone passes, columns show n/a.
  let verdicts = new Map<string, GateVerdict>();
  if (deps.gate) {
    const judged = await deps.gate.judge(ranked, config);
    if (!isOk(judged)) return err(judged.error);
    verdicts = judged.value;
  }

  // 4. Pins first, then gate passers by score.
  const selected = selectThirty({
    ranked,
    pins: config.creators.filter((creator) => creator.pinned).map((creator) => ({ key: creator.slug, owners: creator.owners })),
    blocked: config.blocked,
    passes: (candidate) => verdicts.get(candidate.key)?.passes ?? true,
    size: deps.size ?? CREATORS_SHELF_SIZE,
  });

  // 5. Official owners; on failure keep the saved list and say so.
  const fetched = await fetchOfficialOwners(deps.fetchImpl);
  const officialOwners = isOk(fetched) ? fetched.value : config.officialOwners;
  const officialFetchedAt = isOk(fetched)
    ? (deps.now?.() ?? new Date()).toISOString().slice(0, 10)
    : config.officialFetchedAt;
  const official = new Set(officialOwners.map((owner) => owner.toLowerCase()));

  // 6. Followers, information only. One owner per creator keeps us under the rate limit.
  const token = deps.githubToken;
  const followers = await Promise.all(
    selected.map((creator) => {
      const owner = creator.owners[0];
      return token && owner ? fetchGithubFollowers(owner, token, deps.fetchImpl) : Promise.resolve(null);
    })
  );

  const bySlug = new Map(config.creators.map((creator) => [creator.slug, creator]));
  const rows = selected.map((creator, index): ReportRow => {
    const current = bySlug.get(creator.key);
    const verdict = verdicts.get(creator.key);
    return {
      slug: creator.key,
      label: current?.label ?? creator.key,
      owners: creator.owners,
      pinned: creator.pinned,
      bestInstalls: creator.bestInstalls,
      techProbability: verdict?.techProbability ?? null,
      domain: verdict?.domain ?? null,
      followers: followers[index] ?? null,
      official: creator.owners.some((owner) => official.has(owner.toLowerCase())),
      ...(current?.tech !== undefined ? { tech: current.tech } : {}),
    };
  });

  const proposed = new Set(rows.map((row) => row.slug));
  return ok({
    rows,
    entering: rows.filter((row) => !bySlug.has(row.slug)).map((row) => row.slug),
    leaving: config.creators
      .filter((creator) => !proposed.has(creator.slug))
      .map((creator) => ({ slug: creator.slug, label: creator.label })),
    officialOwners,
    officialFetchedAt,
    previousOfficialOwners: config.officialOwners,
    ...(isOk(fetched) ? {} : { officialWarning: `official list unchanged (${fetched.error.message})` }),
  });
}

const PLAIN_SCALAR = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

/** A YAML flow scalar: bare when safe, else double-quoted (JSON strings are valid YAML). */
function scalar(value: string): string {
  return PLAIN_SCALAR.test(value) && !/^(true|false|null|yes|no|on|off|~|[0-9.]+)$/i.test(value)
    ? value
    : JSON.stringify(value);
}

function flowList(values: readonly string[]): string {
  return `[${values.map(scalar).join(', ')}]`;
}

function yamlBlock(model: ReportModel): string {
  const creators = model.rows.map((row) => {
    const fields = [`slug: ${scalar(row.slug)}`, `label: ${scalar(row.label)}`, `owners: ${flowList(row.owners)}`];
    if (row.pinned) fields.push('pinned: true');
    if (row.tech !== undefined) fields.push(`tech: ${row.tech}`);
    return `  - { ${fields.join(', ')} }`;
  });
  return [
    `officialFetchedAt: ${model.officialFetchedAt}`,
    `officialOwners: ${flowList(model.officialOwners)}`,
    'creators:',
    ...creators,
    '',
  ].join('\n');
}

const na = (value: string | null): string => value ?? 'n/a';

function officialDiff(model: ReportModel): string {
  const before = new Set(model.previousOfficialOwners);
  const after = new Set(model.officialOwners);
  const changes = [
    ...model.officialOwners.filter((owner) => !before.has(owner)).map((owner) => `+${owner}`),
    ...model.previousOfficialOwners.filter((owner) => !after.has(owner)).map((owner) => `-${owner}`),
  ];
  return changes.length > 0 ? changes.join(', ') : 'unchanged';
}

/** The printable report: table, enter/leave, official diff, then the paste-ready YAML block. */
export function formatReport(model: ReportModel): string {
  const header = ['#', 'slug', 'score', 'tech', 'domain', 'followers', 'official', 'pinned', 'owners'];
  const cells = model.rows.map((row, index) => [
    String(index + 1),
    row.slug,
    row.bestInstalls.toLocaleString('en-US'),
    na(row.techProbability === null ? null : row.techProbability.toFixed(2)),
    na(row.domain),
    na(row.followers === null ? null : row.followers.toLocaleString('en-US')),
    row.official ? 'yes' : 'no',
    row.pinned ? 'pin' : '',
    row.owners.join(', '),
  ]);
  const widths = header.map((title, col) => Math.max(title.length, ...cells.map((line) => line[col]?.length ?? 0)));
  const render = (line: string[]) => line.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join('  ').trimEnd();

  const lines = [`Creators report: proposed ${model.rows.length}`];
  if (model.officialWarning) lines.push(`Warning: ${model.officialWarning}`);
  lines.push('', render(header), ...cells.map(render), '');
  lines.push(`Entering (${model.entering.length}): ${model.entering.join(', ') || '-'}`);
  lines.push(
    `Leaving (${model.leaving.length}): ${model.leaving.map((c) => `${c.slug} (${c.label})`).join(', ') || '-'}`
  );
  lines.push(`Official owners: ${officialDiff(model)}`);
  lines.push('', '--- paste into data/market-creators.yaml ---', yamlBlock(model));
  return lines.join('\n');
}

/** Runs and prints the report. Exit code: 0 unless the report could not be built (an /official failure is only a warning). */
export async function printCreatorsReport(
  deps: CreatorsReportDeps,
  out: { log: (line: string) => void; error: (line: string) => void }
): Promise<number> {
  const result = await runCreatorsReport(deps);
  if (!isOk(result)) {
    out.error(`Creators report failed: ${result.error.message}`);
    return 1;
  }
  out.log(formatReport(result.value));
  return 0;
}
