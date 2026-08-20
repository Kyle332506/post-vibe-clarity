import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  expectLocalLinksResolve,
  expectNoEmoji,
  readRepositoryFile,
  repositoryPath,
} from './repository-docs.js';

const publicGuidance = [
  'README.md',
  'docs/foundation-coverage.md',
  'ROADMAP.md',
  'examples/launch-candidate/README.md',
] as const;

describe('foundation coverage documentation', () => {
  it('publishes the v0.2 executor package interface', async () => {
    const manifest = JSON.parse(await readRepositoryFile('package.json')) as {
      version?: string;
      scripts?: Record<string, string>;
    };
    expect(manifest.version).toBe('0.2.0');
    expect(manifest.scripts?.['test:executor']).toBe(
      'vitest run tests/verification tests/acceptance/universal-launch-baseline.acceptance.test.ts',
    );
  });

  it('resolves every local reference', async () => {
    const path = 'docs/foundation-coverage.md';
    const source = await readRepositoryFile(path);

    await expectLocalLinksResolve(path, source);
  });

  it('documents the optional approval-gated verification workflow and its containment boundary', async () => {
    const readme = await readRepositoryFile('README.md');

    expect(readme).toContain('postvibe review');
    expect(readme).toContain('postvibe plan');
    expect(readme).toContain('postvibe execute');
    expect(readme).toMatch(/exact[^\n]+fingerprint/i);
    expect(readme).toMatch(/declared commands only/i);
    expect(readme).toMatch(/exclusions remain unverified/i);
    expect(readme).toMatch(/\.postvibe\/[\s\S]{0,240}optional/i);
    expect(readme).toMatch(/never[\s\S]{0,100}\.gitignore/i);
    expect(readme).toMatch(/read files[\s\S]{0,160}\.env[\s\S]{0,160}change files[\s\S]{0,160}start processes[\s\S]{0,160}network/i);
    expect(readme).toMatch(/not a security sandbox/i);
    expect(readme).toMatch(/passing commands[\s\S]{0,200}production readiness[\s\S]{0,120}complete security/i);
    expect(readme).toContain('postvibe.verification.yaml');
  });

  it('states implemented Level 1 evidence and the remaining coverage gaps', async () => {
    const [coverage, roadmap, example] = await Promise.all([
      readRepositoryFile('docs/foundation-coverage.md'),
      readRepositoryFile('ROADMAP.md'),
      readRepositoryFile('examples/launch-candidate/README.md'),
    ]);

    expect(coverage).toMatch(/Level 1[\s\S]{0,160}(?:implemented|available)/i);
    for (const gap of ['deployment', 'operations', 'performance', 'legal sufficiency', 'deep shape packs', 'strong sandboxing']) {
      expect(`${coverage}\n${roadmap}`.toLowerCase()).toContain(gap);
    }
    expect(example).toMatch(/command evidence[\s\S]{0,240}after/i);
    expect(example).toMatch(/unknown[\s\S]{0,160}remain unknown/i);
  });

  it('distinguishes base report 0.1 from linked verified report 0.2 without stale implementation labels', async () => {
    const coverage = await readRepositoryFile('docs/foundation-coverage.md');

    expect(coverage).toMatch(/base[^\n]+v0\.1[\s\S]{0,180}verified[^\n]+v0\.2/i);
    expect(coverage).not.toContain('packaged v0.1 audit implementations');
  });

  it('keeps public guidance free of emoji, authorship attribution, readiness scores, and unconditional verdicts', async () => {
    for (const path of publicGuidance) {
      const source = await readRepositoryFile(path);
      expectNoEmoji(source, path);
      expect(source, `${path} contains authorship attribution`).not.toMatch(
        /\b(?:authored|created|generated|written)\s+(?:by|with)\s+(?:an?\s+)?(?:AI|artificial intelligence|language model|LLM)\b/i,
      );
      expect(source, `${path} contains a numeric readiness score`).not.toMatch(
        /\b(?:overall\s+)?(?:production\s+)?readiness\s+score\s*(?::|=|is)?\s*\d/i,
      );
      expect(source.toLowerCase()).not.toContain('certified production ready');
      expect(source.toLowerCase()).not.toContain('safe to launch');
    }
  });

  it('gives both launch candidates declared, bounded verification commands', async () => {
    for (const stage of ['before', 'after']) {
      const manifest = JSON.parse(await readRepositoryFile(`examples/launch-candidate/${stage}/package.json`)) as {
        scripts?: Record<string, string>;
      };
      expect(manifest.scripts).toMatchObject({
        build: expect.stringContaining('node'),
        typecheck: expect.stringContaining('node'),
        lint: expect.stringContaining('node'),
        test: expect.stringContaining('node'),
      });
    }
  });

  it('builds the compiled CLI through the launch walkthrough prerequisites', async () => {
    const example = await readRepositoryFile('examples/launch-candidate/README.md');
    const install = example.indexOf('pnpm install --frozen-lockfile');
    const build = example.indexOf('pnpm build');
    const firstCompiledInvocation = example.indexOf('node dist/src/cli.js');

    expect(install).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(install);
    expect(firstCompiledInvocation).toBeGreaterThan(build);

    const result = spawnSync('pnpm', ['build'], {
      cwd: repositoryPath('.'),
      encoding: 'utf8',
      shell: false,
    });
    expect(result.status, result.stderr).toBe(0);
    await expect(access(repositoryPath('dist/src/cli.js'))).resolves.toBeUndefined();
  });
});
