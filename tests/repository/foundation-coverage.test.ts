import { describe, it } from 'vitest';
import { expectLocalLinksResolve, readRepositoryFile } from './repository-docs.js';

describe('foundation coverage documentation', () => {
  it('resolves every local reference', async () => {
    const path = 'docs/foundation-coverage.md';
    const source = await readRepositoryFile(path);

    await expectLocalLinksResolve(path, source);
  });
});
