import { describe, expect, it } from 'vitest';
import {
  COMMAND_DIR_BY_IDE,
  SKILL_ROOTS,
  SKILL_ROOT_BY_IDE,
  SKILL_SOURCE_BY_IDE,
  watchRoots,
} from './dock-layout.js';
import { RULE_DIR_BY_IDE } from './project-rules.js';

describe('watchRoots', () => {
  it('covers every skill root and command dir the engine uses', () => {
    const roots = watchRoots(Object.values(RULE_DIR_BY_IDE));

    for (const root of SKILL_ROOTS) {
      expect(roots).toContain(root);
    }
    for (const dir of Object.values(COMMAND_DIR_BY_IDE)) {
      expect(roots).toContain(dir);
    }
    for (const dir of Object.values(RULE_DIR_BY_IDE)) {
      expect(roots).toContain(dir);
    }
  });

  it('derives Sync source folders from skill roots', () => {
    for (const [ide, root] of Object.entries(SKILL_ROOT_BY_IDE)) {
      expect(root.startsWith(`${SKILL_SOURCE_BY_IDE[ide as keyof typeof SKILL_SOURCE_BY_IDE]}/`)).toBe(true);
    }
  });
});
