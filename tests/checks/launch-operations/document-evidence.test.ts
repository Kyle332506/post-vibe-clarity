import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_OPERATIONS_EVIDENCE_BYTES,
  evaluateDocumentEvidence,
  supportedOperationsEvidenceExtensions,
} from '../../../src/checks/launch-operations/document-evidence.js';
import type { DocumentEvidenceProfile } from '../../../src/checks/launch-operations/types.js';

const temporaryRoots: string[] = [];

const profile: DocumentEvidenceProfile = {
  candidatePaths: [/(?:^|\/)deploy(?:ment)?\.md$/iu],
  requirements: [
    { id: 'target', patterns: [/\b(?:production|staging|registry)\b/iu] },
    { id: 'procedure', patterns: [/^\s*\d+[.)]\s+\S/mu] },
    { id: 'verification', patterns: [/\b(?:verify|smoke test|confirm)\b/iu] },
  ],
  riskPatterns: [/\bno rollback path\b/giu],
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRepository(files: Record<string, string | Uint8Array>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-document-evidence-'));
  temporaryRoots.push(root);
  await Promise.all(Object.entries(files).map(async ([location, content]) => {
    const path = join(root, location);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }));
  return root;
}

describe('evaluateDocumentEvidence', () => {
  it('aggregates requirement matches from multiple supported candidates with normalized relative evidence', async () => {
    const root = await createRepository({
      'docs/deployment.md': 'Deploy to production.\n1. Publish the release.\n',
      'runbooks/deploy.md': 'Confirm the smoke test after release.\n',
    });

    const result = await evaluateDocumentEvidence(root, [], profile);

    expect(result).toEqual({
      status: 'usable',
      evidence: [
        {
          kind: 'file',
          location: 'docs/deployment.md',
          summary: 'Repository operations evidence matched the versioned content profile.',
        },
        {
          kind: 'file',
          location: 'runbooks/deploy.md',
          summary: 'Repository operations evidence matched the versioned content profile.',
        },
      ],
      riskEvidence: [],
      matchedRequirementIds: ['procedure', 'target', 'verification'],
      missingRequirementIds: [],
      unverifiedBoundaries: [],
    });
  });

  it('returns insufficient for an empty or irrelevant candidate filename', async () => {
    const root = await createRepository({
      'deployment.md': '',
      'docs/deploy.md': 'A general project overview without operational details.\n',
    });

    const result = await evaluateDocumentEvidence(root, [], profile);

    expect(result.status).toBe('insufficient');
    expect(result.evidence).toEqual([]);
    expect(result.matchedRequirementIds).toEqual([]);
    expect(result.missingRequirementIds).toEqual(['procedure', 'target', 'verification']);
    expect(result.unverifiedBoundaries).toEqual([]);
  });

  it('returns missing when no candidate path exists', async () => {
    const root = await createRepository({ 'README.md': 'Project overview.\n' });

    await expect(evaluateDocumentEvidence(root, [], profile)).resolves.toEqual({
      status: 'missing',
      evidence: [],
      riskEvidence: [],
      matchedRequirementIds: [],
      missingRequirementIds: ['procedure', 'target', 'verification'],
      unverifiedBoundaries: [],
    });
  });

  it('accepts only the bounded supported text, configuration, and source extensions', async () => {
    const root = await createRepository({
      'deployment.pdf': 'production\n1. deploy\nverify\n',
    });

    const result = await evaluateDocumentEvidence(root, [], {
      ...profile,
      candidatePaths: [/(?:^|\/)deployment\.pdf$/iu],
    });

    expect([...supportedOperationsEvidenceExtensions].sort()).toEqual([
      '.go', '.java', '.js', '.json', '.jsx', '.kt', '.md', '.mdx', '.py', '.rb', '.rs',
      '.swift', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
    ]);
    expect(result.status).toBe('missing');
  });

  it('does not read an oversized candidate and records an unverified boundary', async () => {
    const root = await createRepository({
      'deployment.md': `${'x'.repeat(MAX_OPERATIONS_EVIDENCE_BYTES)} production 1. deploy verify`,
    });

    const result = await evaluateDocumentEvidence(root, [], profile);

    expect(result.status).toBe('insufficient');
    expect(result.evidence).toEqual([]);
    expect(result.unverifiedBoundaries).toEqual([
      `deployment.md exceeds the ${MAX_OPERATIONS_EVIDENCE_BYTES}-byte operations evidence limit.`,
    ]);
  });

  it('rejects NUL-containing content as unsupported binary evidence', async () => {
    const root = await createRepository({
      'deployment.md': new Uint8Array([0x70, 0x72, 0x6f, 0x64, 0x00, 0x75, 0x63, 0x74, 0x69, 0x6f, 0x6e]),
    });

    const result = await evaluateDocumentEvidence(root, [], profile);

    expect(result.status).toBe('insufficient');
    expect(result.unverifiedBoundaries).toEqual([
      'deployment.md contains unsupported binary content.',
    ]);
  });

  it('rejects invalid UTF-8 content even when its valid bytes match every requirement', async () => {
    const root = await createRepository({
      'deployment.md': new Uint8Array([
        0x70, 0x72, 0x6f, 0x64, 0x75, 0x63, 0x74, 0x69, 0x6f, 0x6e, 0x0a,
        0x31, 0x2e, 0x20, 0x64, 0x65, 0x70, 0x6c, 0x6f, 0x79, 0x0a,
        0x76, 0x65, 0x72, 0x69, 0x66, 0x79, 0x0a, 0xff,
      ]),
    });

    const result = await evaluateDocumentEvidence(root, [], profile);

    expect(result.status).toBe('insufficient');
    expect(result.evidence).toEqual([]);
    expect(result.unverifiedBoundaries).toEqual([
      'deployment.md contains unsupported binary content.',
    ]);
  });

  it('excludes requested artifacts and generated or dependency directories', async () => {
    const root = await createRepository({
      'deployment.md': 'Project overview.\n',
      'excluded/deployment.md': 'production\n1. deploy\nverify\n',
      'node_modules/deployment.md': 'production\n1. deploy\nverify\n',
      '.git/deployment.md': 'production\n1. deploy\nverify\n',
      '.postvibe/deployment.md': 'production\n1. deploy\nverify\n',
      'coverage/deployment.md': 'production\n1. deploy\nverify\n',
      'dist/deployment.md': 'production\n1. deploy\nverify\n',
    });

    const result = await evaluateDocumentEvidence(root, ['excluded/deployment.md'], profile);

    expect(result.status).toBe('insufficient');
    expect(result.evidence).toEqual([]);
    expect(result.matchedRequirementIds).toEqual([]);
  });

  it('does not follow symlinks or accept non-regular candidates', async () => {
    const root = await createRepository({
      'source.md': 'production\n1. deploy\nverify\n',
      'deployment.md': 'Overview.\n',
    });
    await symlink(join(root, 'source.md'), join(root, 'linked-deployment.md'));
    await mkdir(join(root, 'directory-deployment.md'));

    const result = await evaluateDocumentEvidence(root, [], {
      ...profile,
      candidatePaths: [/(?:^|\/)(?:deployment|linked-deployment|directory-deployment)\.md$/iu],
    });

    expect((await lstat(join(root, 'linked-deployment.md'))).isSymbolicLink()).toBe(true);
    expect(result.status).toBe('insufficient');
    expect(result.evidence).toEqual([]);
    expect(result.matchedRequirementIds).toEqual([]);
  });

  it.runIf(process.platform !== 'win32')('does not rewrite literal POSIX backslashes and never returns source content', async () => {
    const sourceContent = 'production\n1. deploy\nverify\ncontrolled source value never return';
    const root = await createRepository({
      'nested/deployment.md': sourceContent,
      'literal\\deployment.md': sourceContent,
    });

    const result = await evaluateDocumentEvidence(root, [], {
      ...profile,
      candidatePaths: [/(?:^|\/|\\)deployment\.md$/iu],
    });
    const serialized = JSON.stringify(result);

    expect(result.evidence.map(({ location }) => location)).toEqual([
      'literal\\deployment.md',
      'nested/deployment.md',
    ]);
    expect(result.evidence.every(({ location }) => location !== undefined && !location.startsWith(root))).toBe(true);
    expect(result.evidence.every(({ summary }) => summary.length < 100)).toBe(true);
    expect(serialized).not.toContain(sourceContent);
    expect(serialized).not.toContain('controlled source value never return');
  });

  it('returns risk evidence separately and resets stateful regular expressions between candidates', async () => {
    const root = await createRepository({
      'first/deployment.md': 'production\n1. deploy\nverify\nno rollback path\n',
      'second/deployment.md': 'production\n1. deploy\nverify\nno rollback path\n',
    });

    const result = await evaluateDocumentEvidence(root, [], profile);

    expect(result.status).toBe('usable');
    expect(result.riskEvidence.map(({ location }) => location)).toEqual([
      'first/deployment.md',
      'second/deployment.md',
    ]);
  });

  it('keeps a leading-whitespace standalone risk statement active in a plain-text candidate', async () => {
    const root = await createRepository({
      'deployment.txt': '    no rollback path\n',
    });

    const result = await evaluateDocumentEvidence(root, [], {
      ...profile,
      candidatePaths: [/(?:^|\/)deployment\.txt$/iu],
      riskPatterns: [/^[\t ]*no rollback path[.!;,]*[\t ]*$/imu],
    });

    expect(result.riskEvidence).toEqual([{
      kind: 'file',
      location: 'deployment.txt',
      summary: 'Repository text explicitly describes the check-specific risky condition.',
    }]);
  });

  it('does not report rollback risk quoted across Markdown lines after introductory prose', async () => {
    const root = await createRepository({
      'deployment.md': 'The guide says, “\nno rollback path\n”\n',
    });

    const result = await evaluateDocumentEvidence(root, [], {
      ...profile,
      riskPatterns: [/^[\t ]*no rollback path[.!;,]*[\t ]*$/imu],
    });

    expect(result.riskEvidence).toEqual([]);
  });
});
