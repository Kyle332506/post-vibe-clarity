import { describe, expect, it } from 'vitest';
import { isProjectFileExcluded } from '../../src/discovery/file-index.js';

describe('isProjectFileExcluded', () => {
  it.runIf(process.platform !== 'win32')('treats a backslash as a valid POSIX filename character', () => {
    expect(isProjectFileExcluded('src/node_modules\\fixture.ts')).toBe(false);
    expect(isProjectFileExcluded('src/node_modules/fixture.ts')).toBe(true);
  });

  it.runIf(process.platform === 'win32')('accepts both Windows path separators', () => {
    expect(isProjectFileExcluded('src\\node_modules\\fixture.ts')).toBe(true);
    expect(isProjectFileExcluded('src/node_modules/fixture.ts')).toBe(true);
  });
});
