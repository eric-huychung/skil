export type StatusKind =
  | 'load'
  | 'search'
  | 'preview'
  | 'add'
  | 'delete'
  | 'update'
  | 'rule'
  | 'toggle'
  | 'create'
  | 'export'
  | 'import';

/** User-facing copy for catalog and workspace failures. Never pass
 * Error.message through — those leak hostnames, paths, and stack fragments. */
export function statusCopy(kind: StatusKind): { title: string; detail: string } {
  switch (kind) {
    case 'search':
      return {
        title: "Search didn't go through",
        detail: 'Check your connection and try again.',
      };
    case 'preview':
      return {
        title: "Couldn't load this skill",
        detail: 'Try again in a moment.',
      };
    case 'add':
      return {
        title: "Couldn't add",
        detail: 'Try again in a moment.',
      };
    case 'delete':
      return {
        title: "Couldn't delete this skill",
        detail: 'Try again in a moment.',
      };
    case 'update':
      return {
        title: "Couldn't update this skill",
        detail: 'Try again in a moment.',
      };
    case 'rule':
      return {
        title: "Couldn't load this rule",
        detail: 'Try again in a moment.',
      };
    case 'toggle':
      return {
        title: "Couldn't update this rule",
        detail: 'Try again in a moment.',
      };
    case 'create':
      return {
        title: "Couldn't create that command",
        detail: 'That name may already be on the map.',
      };
    case 'export':
      return {
        title: "Couldn't export",
        detail: 'Try again in a moment.',
      };
    case 'import':
      return {
        title: "Couldn't import",
        detail: 'Try again in a moment.',
      };
    default:
      return {
        title: "Couldn't load skills",
        detail: 'The catalog is temporarily unavailable. Try again in a moment.',
      };
  }
}

/** Single-line form for CLI and other non-UI callers. */
export function statusLine(kind: StatusKind): string {
  const { title, detail } = statusCopy(kind);
  return `${title}. ${detail}`;
}
