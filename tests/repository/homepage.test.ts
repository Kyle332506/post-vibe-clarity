import { describe, expect, it } from 'vitest';
import {
  expectLocalLinksResolve,
  expectNoEmoji,
  headingPosition,
  readRepositoryFile,
} from './repository-docs.js';

const fullDisclaimer = 'PostVibeClarity supports production preparation, but it does not guarantee that a project is production-ready.';
const exactReportDisclaimer = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';

describe('repository homepage', () => {
  it('leads from production preparation to agent installation', async () => {
    const readme = await readRepositoryFile('README.md');
    expect(readme).toContain('Prepare vibe-coded projects for production with evidence—not guesswork.');
    expect(readme).toContain('## Install with your coding agent');
    expect(headingPosition(readme, 'Install with your coding agent')).toBeGreaterThan(0);
    expect(headingPosition(readme, 'Install with your coding agent')).toBeLessThan(headingPosition(readme, 'How it works'));
    expect(readme).toContain('v0.3 · Launch operations');
    expect(readme).toContain('[Install](#install-with-your-coding-agent)');
    expect(readme).toContain('[Example project](examples/launch-candidate/README.md)');
    expect(readme).toContain('[Example report](docs/examples/sample-report.md)');
    expect(readme).toContain('[Current coverage](docs/foundation-coverage.md)');
  });

  it('puts host guides immediately after the copy-paste prompt and before deeper material', async () => {
    const readme = await readRepositoryFile('README.md');
    const prompt = readme.indexOf('> Install PostVibeClarity for this project');
    const guideTable = readme.indexOf('| Agent | Project path | Invocation | Evidence label |');
    const limitation = headingPosition(readme, 'Important limitation');
    const architecture = headingPosition(readme, 'Project shapes represented by the architecture');

    expect(prompt).toBeGreaterThan(0);
    expect(readme).toContain('at `v0.3.0`');
    expect(readme).toContain('verify all six skills are available');
    expect(guideTable).toBeGreaterThan(prompt);
    expect(guideTable).toBeLessThan(limitation);
    expect(guideTable).toBeLessThan(architecture);
    expect(readme.match(/\| Agent \| Project path \| Invocation \| Evidence label \|/g)).toHaveLength(1);
  });

  it('shows a concise roadmap before community links', async () => {
    const readme = await readRepositoryFile('README.md');
    expect(headingPosition(readme, 'Roadmap')).toBeGreaterThan(0);
    expect(headingPosition(readme, 'Roadmap')).toBeLessThan(headingPosition(readme, 'Community and project policies'));
    expect(readme).toContain('Broader production-readiness checks');
    expect(readme).toContain('[full roadmap](ROADMAP.md)');
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

  it('summarizes eight Level 0 checks while keeping live operations unimplemented', async () => {
    const readme = await readRepositoryFile('README.md');

    expect(readme).toMatch(/six deterministic[\s\S]{0,120}repository-only[\s\S]{0,120}operations checks/i);
    expect(readme).toMatch(/eight Level 0 checks[\s\S]{0,120}six portable skills/i);
    expect(readme).toMatch(/provider[\s\S]{0,100}production verification[\s\S]{0,100}(?:not implemented|unimplemented)/i);
    expect(readme).toContain(exactReportDisclaimer);
  });

  it('uses no emojis and resolves local links', async () => {
    const readme = await readRepositoryFile('README.md');
    expectNoEmoji(readme, 'README.md');
    await expectLocalLinksResolve('README.md', readme);
  });
});
