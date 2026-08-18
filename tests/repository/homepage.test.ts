import { describe, expect, it } from 'vitest';
import {
  expectLocalLinksResolve,
  expectNoEmoji,
  headingPosition,
  readRepositoryFile,
} from './repository-docs.js';

const fullDisclaimer = 'PostVibeClarity supports production preparation, but it does not guarantee that a project is production-ready.';

describe('repository homepage', () => {
  it('leads from production preparation to agent installation', async () => {
    const readme = await readRepositoryFile('README.md');
    expect(readme).toContain('Prepare vibe-coded projects for production with evidence—not guesswork.');
    expect(readme).toContain('## Install with your coding agent');
    expect(headingPosition(readme, 'Install with your coding agent')).toBeGreaterThan(0);
    expect(headingPosition(readme, 'Install with your coding agent')).toBeLessThan(headingPosition(readme, 'How it works'));
    expect(readme).toContain('v0.1 · Stable foundation');
  });

  it('states the readiness and security boundary without burying it', async () => {
    const [readme, disclaimer] = await Promise.all([
      readRepositoryFile('README.md'),
      readRepositoryFile('DISCLAIMER.md'),
    ]);
    for (const source of [readme, disclaimer]) {
      expect(source).toContain(fullDisclaimer);
      expect(source).toContain('does not guarantee that a project is production-ready');
      expect(source).toContain('cannot find every vulnerability');
      expect(source).toContain('prove that security is fully hardened');
    }
    expect(readme.toLowerCase()).not.toContain('certified production ready');
  });

  it('uses no emojis and resolves local links', async () => {
    const readme = await readRepositoryFile('README.md');
    expectNoEmoji(readme, 'README.md');
    await expectLocalLinksResolve('README.md', readme);
  });
});
