/** Shared status module.
 *  Loading: <StatusSkeleton variant="list" | "cards" | "preview" />
 *  Errors:  <StatusNotice kind={...} onRetry? layout="block" | "inline" />
 *  CLI:     statusLine(kind)
 */
export { StatusSkeleton, type StatusSkeletonVariant } from './StatusSkeleton';
export { StatusNotice } from './StatusNotice';
export { statusCopy, statusLine, type StatusKind } from '../../src/core/status-copy';
