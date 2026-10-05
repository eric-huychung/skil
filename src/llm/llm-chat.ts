import { err, ok, type Result } from '../core/result.js';

/** The three BYOK presets. Anthropic's `/v1/chat/completions` is OpenAI-shaped, so one client covers all three. */
export type LlmProvider = 'anthropic' | 'openai' | 'openrouter';

/**
 * A user's own LLM key, direct to the provider. `complete` is the only
 * method — health()'s conflict/vague-trigger slice and Settings' ping
 * both call it. Never routed through skil's backend or AI Gateway; see
 * `JevSkillClassifier` for that separate, key-less path.
 */
export interface LlmChat {
  complete(opts: { system: string; user: string; maxTokens?: number }): Promise<Result<string>>;
}

interface ProviderPreset {
  baseUrl: string;
  /** Hardcoded cheap model id. Swap later — not user-configurable in v1. */
  model: string;
}

const PRESETS: Record<LlmProvider, ProviderPreset> = {
  // Alias tracks current Haiku; dated 3.5 snapshot retired Feb 2026.
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5' },
  // 4.1-nano: cheapest chat-completions model without a reasoning-token tax (gpt-5-nano would eat the 5-token ping).
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-nano' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-nano' },
};

const DEFAULT_MAX_TOKENS = 500;
/** Hang cap so a dead provider cannot pin the GUI refresh loop. */
export const LLM_REQUEST_TIMEOUT_MS = 15_000;

interface ChatCompletionBody {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/** Direct-to-provider OpenAI-chat-completions client. One request shape, three base URLs. */
export class HttpLlmChat implements LlmChat {
  constructor(
    private readonly provider: LlmProvider,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = LLM_REQUEST_TIMEOUT_MS
  ) {}

  async complete(opts: { system: string; user: string; maxTokens?: number }): Promise<Result<string>> {
    const preset = PRESETS[this.provider];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${preset.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: preset.model,
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
          ],
        }),
      });
    } catch (error) {
      if (isAbortError(error)) {
        return err(new Error(`LlmChat: ${this.provider} timed out after ${this.timeoutMs}ms.`));
      }
      return err(new Error(`LlmChat: ${error instanceof Error ? error.message : 'request failed'}`));
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return err(new Error(`LlmChat: ${this.provider} rejected the API key (${response.status}).`));
      }
      if (response.status === 429) {
        return err(new Error(`LlmChat: ${this.provider} rate-limited the key (429). Retry later.`));
      }
      return err(new Error(`LlmChat: ${this.provider} returned ${response.status}.`));
    }

    let body: ChatCompletionBody;
    try {
      body = (await response.json()) as ChatCompletionBody;
    } catch {
      return err(new Error(`LlmChat: ${this.provider} returned an invalid JSON body.`));
    }

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return err(new Error(`LlmChat: ${this.provider} response had no message content.`));
    }
    return ok(content);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Builds the one client for a provider + key. Tests inject `fetchImpl`; prod defaults to global `fetch`. */
export function createLlmChat(
  provider: LlmProvider,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = LLM_REQUEST_TIMEOUT_MS
): LlmChat {
  return new HttpLlmChat(provider, apiKey, fetchImpl, timeoutMs);
}

/**
 * Settings' "Save" button: a 1-token call that succeeds on a valid key
 * and surfaces the same clear error `complete` returns on a bad one
 * (e.g. "rejected the API key (401)"). Never persists anything.
 */
export async function pingLlmChat(chat: LlmChat): Promise<Result<void>> {
  const result = await chat.complete({ system: 'Reply with one word: pong.', user: 'ping', maxTokens: 5 });
  if (!result.ok) {
    return err(result.error);
  }
  return ok(undefined);
}
