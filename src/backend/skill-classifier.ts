import { ok, type Result } from '../core/result.js';
import type { MarketClassifyRow, MarketField } from './market-types.js';
import type { SkillLabel } from './shelf-assembler.js';

/**
 * Assigns each skill 0–2 field slugs. Prod adapter calls Vercel AI
 * Gateway; tests inject `FakeSkillClassifier`.
 */
export interface SkillClassifier {
  classify(skills: MarketClassifyRow[], fields: MarketField[]): Promise<Result<SkillLabel[]>>;
}

/** Programmable classifier for tests. Missing ids → no slugs. */
export class FakeSkillClassifier implements SkillClassifier {
  constructor(private readonly labels = new Map<string, string[]>()) {}

  async classify(skills: MarketClassifyRow[], _fields: MarketField[]): Promise<Result<SkillLabel[]>> {
    return ok(skills.map((skill) => ({ id: skill.id, fieldSlugs: this.labels.get(skill.id) ?? [] })));
  }
}
