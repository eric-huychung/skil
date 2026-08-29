import { err, isOk, ok, type Result } from '../core/result.js';
import type { SkillClassifier } from './skill-classifier.js';
import type { MarketClassifyRow, MarketField } from './market-types.js';
import type { SkillLabel } from './shelf-assembler.js';

export const CLASSIFY_BATCH_SIZE = 20;
export const CLASSIFY_MODEL = 'openai/gpt-4o-mini';
/** Extra tries after a dropped request or 5xx/429. One failed batch still fails the run. */
export const CLASSIFY_FETCH_RETRIES = 2;
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const RETRY_DELAY_MS = 400;

export interface LlmSkillClassifierDeps {
  fetchImpl: typeof fetch;
  getAccessToken: () => Promise<string>;
}

interface ChatCompletionBody {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Classifies skills through Vercel AI Gateway. One failed batch fails
 * the whole run — no partial label list.
 */
export class LlmSkillClassifier implements SkillClassifier {
  constructor(private readonly deps: LlmSkillClassifierDeps) {}

  async classify(skills: MarketClassifyRow[], fields: MarketField[]): Promise<Result<SkillLabel[]>> {
    const labels: SkillLabel[] = [];
    for (let i = 0; i < skills.length; i += CLASSIFY_BATCH_SIZE) {
      const batch = skills.slice(i, i + CLASSIFY_BATCH_SIZE);
      const classified = await this.classifyBatch(batch, fields);
      if (!isOk(classified)) {
        return classified;
      }
      labels.push(...classified.value);
    }
    return ok(labels);
  }

  private async classifyBatch(
    skills: MarketClassifyRow[],
    fields: MarketField[],
  ): Promise<Result<SkillLabel[]>> {
    const token = await this.deps.getAccessToken();
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLASSIFY_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt(fields) },
          { role: 'user', content: JSON.stringify(skills.map(toPromptSkill)) },
        ],
      }),
    };

    const response = await postWithRetry(this.deps.fetchImpl, init);
    if (!isOk(response)) {
      return response;
    }

    let body: ChatCompletionBody;
    try {
      body = (await response.value.json()) as ChatCompletionBody;
    } catch {
      return err(new Error('LlmSkillClassifier: invalid JSON body'));
    }

    return parseLabels(body.choices?.[0]?.message?.content ?? '', skills);
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function postWithRetry(fetchImpl: typeof fetch, init: RequestInit): Promise<Result<Response>> {
  let lastError: Error = new Error('LlmSkillClassifier: request failed');
  for (let attempt = 0; attempt <= CLASSIFY_FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetchImpl(GATEWAY_URL, init);
      if (response.ok) {
        return ok(response);
      }
      lastError = new Error(`LlmSkillClassifier: gateway returned ${response.status}`);
      if (!shouldRetryStatus(response.status)) {
        return err(lastError);
      }
    } catch (error) {
      lastError = new Error(`LlmSkillClassifier: ${error instanceof Error ? error.message : 'request failed'}`);
    }
    if (attempt < CLASSIFY_FETCH_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  return err(lastError);
}

function systemPrompt(fields: MarketField[]): string {
  const slugs = fields.map((field) => field.slug).join(', ');
  return [
    'Assign each skill 0-2 category slugs for the job it does, not words that appear.',
    `Allowed slugs: ${slugs}.`,
    'tdd → testing. grill-me / handoff / find-skills / prototype → workflow.',
    'prisma / neon / supabase app postgres → database.',
    'Lark, Azure, Amazon seller, video-gen suites → integrations. amazon-product-research is NOT prd.',
    'Return JSON {"results":[{"id":"...","fieldSlugs":["slug"]}]} for every input id.',
  ].join(' ');
}

function toPromptSkill(skill: MarketClassifyRow): { id: string; name: string; description: string | null } {
  return { id: skill.id, name: skill.name, description: skill.description };
}

function parseLabels(content: string, skills: MarketClassifyRow[]): Result<SkillLabel[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return err(new Error('LlmSkillClassifier: model output is not JSON'));
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown }).results)
      ? (parsed as { results: unknown[] }).results
      : null;
  if (!rows) {
    return err(new Error('LlmSkillClassifier: missing results array'));
  }

  const byId = new Map<string, string[]>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const id = (row as { id?: unknown }).id;
    const fieldSlugs = (row as { fieldSlugs?: unknown }).fieldSlugs;
    if (typeof id !== 'string' || !Array.isArray(fieldSlugs)) continue;
    byId.set(
      id,
      fieldSlugs.filter((slug): slug is string => typeof slug === 'string'),
    );
  }

  return ok(skills.map((skill) => ({ id: skill.id, fieldSlugs: byId.get(skill.id) ?? [] })));
}
