export function rememberMarketSkill(id: string, inbox: readonly string[]): string[] {
  const next = id.trim();
  if (!next || inbox.includes(next)) return [...inbox];
  return [...inbox, next];
}

export function mergeMarketInbox(existing: readonly string[], incoming: readonly string[]): string[] {
  const next = [...existing];
  for (const id of incoming) {
    const trimmed = id.trim();
    if (!trimmed || next.includes(trimmed)) continue;
    next.push(trimmed);
  }
  return next;
}

export function parseMarketInbox(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return mergeMarketInbox([], raw.filter((item): item is string => typeof item === 'string'));
}

export function marketInboxIds(
  inbox: readonly string[],
  catalog: ReadonlyArray<{ id: string; source: string }>
): string[] {
  const local = new Set(catalog.filter((skill) => skill.source === 'local').map((skill) => skill.id));
  return inbox.filter((id) => !local.has(id));
}
