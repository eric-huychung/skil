import { createHash } from 'node:crypto';
import type { LabelPoolRow } from './market-types.js';

/** The text Jev reads for one skill. Null description/excerpt render as empty so the format is stable. */
export function buildLabelState(row: LabelPoolRow): string {
  return [
    `name: ${row.name}`,
    `repo: ${row.source}`,
    `description: ${row.description ?? ''}`,
    `excerpt: ${row.labelExcerpt ?? ''}`,
  ].join('\n');
}

/** sha256 hex of a label state; a changed hash means the skill needs relabelling. */
export function stateHash(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}
