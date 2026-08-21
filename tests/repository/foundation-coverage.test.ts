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
  'docs/releases/v0.3.0.md',
  'examples/launch-candidate/README.md',
] as const;
const exactDisclaimer = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';
const operationsCheckIds = [
  'launch-operations.release-process',
  'launch-operations.rollback-process',
  'launch-operations.monitoring-response',
  'launch-operations.health-check',
  'launch-operations.backup-restore',
  'launch-operations.maintenance-ownership',
] as const;
const liveOperationsBoundary = 'The checks do not inspect live providers, deployment state, alert delivery, health endpoint responses, backup creation, restore results, or rollback execution.';
const operationsDocuments = [
  'release-and-deployment.md',
  'rollback-and-recovery.md',
  'monitoring-and-incident-response.md',
  'health-check.md',
  'backup-and-restore.md',
  'maintenance-ownership.md',
] as const;
const demonstrationSchema = `CREATE TABLE signup_metrics (
  id INTEGER PRIMARY KEY,
  recorded_at TEXT NOT NULL
);
`;

describe('foundation coverage documentation', () => {
  it('publishes the v0.3 executor package interface', async () => {
    const manifest = JSON.parse(await readRepositoryFile('package.json')) as {
      version?: string;
      scripts?: Record<string, string>;
    };
    expect(manifest.version).toBe('0.3.0');
    expect(manifest.scripts?.['test:executor']).toBe(
      'pnpm build && vitest run tests/verification tests/checks/launch-operations tests/discovery/operational-signals.test.ts tests/acceptance/universal-launch-baseline.acceptance.test.ts tests/acceptance/launch-operations.acceptance.test.ts',
    );
  });

  it('resolves every local reference', async () => {
    const path = 'docs/foundation-coverage.md';
    const source = await readRepositoryFile(path);

    await expectLocalLinksResolve(path, source);
  });

  it('documents the optional approval-gated verification workflow and its containment boundary', async () => {
    const [readme, coverage] = await Promise.all([
      readRepositoryFile('README.md'),
      readRepositoryFile('docs/foundation-coverage.md'),
    ]);

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
    expect(coverage).toMatch(/exact command declaration[\s\S]{0,120}direct launch/i);
    expect(coverage).toMatch(/does not freeze[\s\S]{0,120}dependencies/i);
    expect(coverage).toMatch(/every OS matrix job[\s\S]{0,160}own compiled CLI[\s\S]{0,160}another job's workspace/i);
  });

  it('distinguishes implemented repository operations evidence from remaining live verification gaps', async () => {
    const [coverage, roadmap, example] = await Promise.all([
      readRepositoryFile('docs/foundation-coverage.md'),
      readRepositoryFile('ROADMAP.md'),
      readRepositoryFile('examples/launch-candidate/README.md'),
    ]);

    expect(coverage).toMatch(/Level 1[\s\S]{0,160}(?:implemented|available)/i);
    expect(coverage).toMatch(/six deterministic[\s\S]{0,120}repository-only[\s\S]{0,120}Level 0 checks/i);
    expect(coverage).toMatch(/filename alone[\s\S]{0,160}(?:does not|never)[\s\S]{0,80}(?:pass|satisf)/i);
    expect(coverage).toMatch(/missing or vague[\s\S]{0,100}unverified/i);
    expect(coverage).toContain(liveOperationsBoundary);
    for (const checkId of operationsCheckIds) expect(coverage).toContain(checkId);
    for (const gap of ['live provider', 'deployment state', 'performance', 'legal sufficiency', 'deep shape packs', 'strong sandboxing']) {
      expect(`${coverage}\n${roadmap}`.toLowerCase()).toContain(gap);
    }
    expect(roadmap).toMatch(/full live and provider operations verification[\s\S]{0,160}(?:future|remains open|unimplemented)/i);
    expect(example).toMatch(/command evidence[\s\S]{0,240}after/i);
    expect(example).toMatch(/unknown[\s\S]{0,160}remain unknown/i);
  });

  it('states the credential boundary without claiming repository credential-like bytes are inaccessible', async () => {
    const coverage = await readRepositoryFile('docs/foundation-coverage.md');

    expect(coverage).toContain(
      'No credential value is requested or used to access an external service.',
    );
    expect(coverage).toMatch(/repository candidate files may contain credential-like content[\s\S]{0,140}(?:read|inspect)[\s\S]{0,100}(?:bytes|content)/i);
    expect(coverage).not.toContain('They do not use credentials');
    expect(coverage).not.toContain('No credential or external service is accessed.');
  });

  it('documents separately approved Markdown-only operations remedies without widening audit authority', async () => {
    const [coverage, orchestrator] = await Promise.all([
      readRepositoryFile('docs/foundation-coverage.md'),
      readRepositoryFile('skills/post-vibe-clarity/SKILL.md'),
    ]);

    expect(orchestrator).toMatch(/route[\s\S]{0,120}`launch-operations`/i);
    expect(orchestrator).toMatch(/one finding[\s\S]{0,160}Level 2[\s\S]{0,160}preview/i);
    expect(`${coverage}\n${orchestrator}`).toMatch(/separate(?:ly)?[\s\S]{0,120}approv[\s\S]{0,160}Markdown/i);
    expect(`${coverage}\n${orchestrator}`).toMatch(/(?:preserve|record)[\s\S]{0,100}unknown[\s\S]{0,100}(?:decision|unresolved)/i);
    expect(orchestrator).toContain(
      'A repository audit authorizes no source, configuration, workflow, infrastructure, external-service, staging, commit, or release change.',
    );
    expect(orchestrator).toMatch(/broad readiness request[\s\S]{0,80}not[\s\S]{0,80}(?:approval|authorization)[\s\S]{0,80}(?:write|change)/i);
  });

  it('separates implemented Markdown remedies from broader future remediation and live rechecks', async () => {
    const roadmap = await readRepositoryFile('ROADMAP.md');

    expect(roadmap).toContain(
      'Separately approved Markdown runbooks and a fresh repository check are implemented for one operations finding at a time.',
    );
    expect(roadmap).toContain(
      'Broader approval-gated source, configuration, workflow, infrastructure, and external-service remediation, plus live rechecks.',
    );
    expect(roadmap).not.toContain('- Approval-gated remediation and fresh rechecks.');
  });

  it('publishes v0.3 release evidence with pinned upgrade guides and unchanged limits', async () => {
    const releasePath = 'docs/releases/v0.3.0.md';
    const release = await readRepositoryFile(releasePath);

    await expectLocalLinksResolve(releasePath, release);
    for (const checkId of operationsCheckIds) expect(release).toContain(checkId);
    for (const skill of [
      'post-vibe-clarity',
      'project-discovery',
      'secret-exposure',
      'launch-essentials',
      'launch-operations',
      'universal-verification',
    ]) {
      expect(release).toContain(skill);
    }
    expect(release).toMatch(/adaptive applicability/i);
    expect(release).toMatch(/guided[\s\S]{0,120}written remed/i);
    expect(release).toMatch(/before-and-after launch candidate/i);
    expect(release).toContain(liveOperationsBoundary);
    expect(release).toContain(exactDisclaimer);
    expect(release).toMatch(/upgrade[\s\S]{0,240}v0\.3\.0/i);
    for (const guide of ['agent-skills', 'codex', 'claude-code', 'cursor', 'windsurf']) {
      expect(release).toContain(`../installation/${guide}.md`);
    }
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

  it('keeps the operations walkthrough demonstration-only and repository-bounded', async () => {
    const [beforeSchema, afterSchema, walkthrough] = await Promise.all([
      readRepositoryFile('examples/launch-candidate/before/data/schema.sql'),
      readRepositoryFile('examples/launch-candidate/after/data/schema.sql'),
      readRepositoryFile('examples/launch-candidate/README.md'),
    ]);

    expect(beforeSchema).toBe(demonstrationSchema);
    expect(afterSchema).toBe(demonstrationSchema);
    for (const document of operationsDocuments) {
      await expect(access(repositoryPath(`examples/launch-candidate/before/docs/operations/${document}`)))
        .rejects.toMatchObject({ code: 'ENOENT' });
      const path = `examples/launch-candidate/after/docs/operations/${document}`;
      const source = await readRepositoryFile(path);
      expect(source).toMatch(/example repository guidance/i);
      expect(source).toMatch(/does not prove live behavior/i);
      expect(source, `${path} contains a remote endpoint`).not.toMatch(/\bhttps?:\/\//iu);
      expect(source, `${path} claims an operation was executed`).not.toMatch(
        /\b(?:we|the\s+(?:team|maintainer|owner|operator))\s+(?:deployed|published|executed|ran|restored|rolled back|tested)\b/iu,
      );
      expectNoEmoji(source, path);
    }

    expect(walkthrough).toMatch(/schema[\s\S]{0,200}intended demonstration data[\s\S]{0,200}not connected[\s\S]{0,120}in-memory runtime/i);
    expect(walkthrough).toMatch(/six repository evidence checks improve/i);
    for (const boundary of [
      'live deployment',
      'alerting',
      'health',
      'backups',
      'restoration',
      'rollback',
      'production behavior',
      'uncovered domains',
    ]) {
      expect(walkthrough.toLowerCase()).toContain(boundary);
    }
    expect(walkthrough).toMatch(/neither example[\s\S]{0,160}production template[\s\S]{0,160}production-readiness verdict/i);
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
  }, 15_000);
});
