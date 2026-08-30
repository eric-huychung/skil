/**
 * Result<T> represents the outcome of an operation that can fail.
 *
 * Business logic in skil never throws for expected failure cases
 * (e.g. "collection not found"). Instead it returns a Result, forcing
 * callers to explicitly handle both the success and error paths.
 *
 * @example
 * function findCollection(name: string): Result<Collection> {
 *   const collection = state.collections.find((c) => c.name === name);
 *   if (!collection) {
 *     return err(new Error(`Collection '${name}' not found`));
 *   }
 *   return ok(collection);
 * }
 *
 * const result = findCollection('frontend');
 * if (isOk(result)) {
 *   console.log(result.value.name);
 * } else {
 *   console.error(result.error.message);
 * }
 */
export type EngineErrorCode = 'COMMAND_NAME_COLLISION';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error; code?: EngineErrorCode; labels?: string[] };

/** Wraps a value in a successful Result. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Wraps an Error in a failed Result. Conflict extras sit next to Error so they survive IPC. */
export function err<T = never>(
  error: Error,
  extras?: { code: EngineErrorCode; labels?: string[] }
): Result<T> {
  return extras ? { ok: false, error, code: extras.code, labels: extras.labels } : { ok: false, error };
}

/** Narrows a Result to its success branch, exposing `.value`. */
export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok;
}

/** Narrows a Result to its failure branch, exposing `.error`. */
export function isErr<T>(
  result: Result<T>
): result is { ok: false; error: Error; code?: EngineErrorCode; labels?: string[] } {
  return !result.ok;
}
