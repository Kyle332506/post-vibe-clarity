import { describe, expect, it } from 'vitest';
import { expectLocalLinksResolve, expectNoEmoji, readRepositoryFile } from './repository-docs.js';

const files = ['CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'SUPPORT.md'] as const;

describe('community health files', () => {
  it.each(files)('%s exists, has no emojis, and resolves local links', async (path) => {
    const source = await readRepositoryFile(path);
    expect(source.length).toBeGreaterThan(200);
    expectNoEmoji(source, path);
    await expectLocalLinksResolve(path, source);
  });

  it('routes vulnerabilities privately and avoids security guarantees', async () => {
    const security = await readRepositoryFile('SECURITY.md');
    expect(security).toContain('Report a vulnerability');
    expect(security).toContain('Security');
    expect(security).toContain('privately');
    expect(security.toLowerCase()).not.toContain('fully secure');
    expect(security.toLowerCase()).not.toContain('no vulnerabilities');
  });

  it('requires evidence and verification from contributors', async () => {
    const contributing = await readRepositoryFile('CONTRIBUTING.md');
    expect(contributing).toContain('pnpm verify:foundation');
    expect(contributing).toContain('Evidence');
    expect(contributing).toContain('No certification claims');
  });
});
