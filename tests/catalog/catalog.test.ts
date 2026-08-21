import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSkillCatalog } from '../../src/catalog/load-catalog.js';
import { routeSkills } from '../../src/catalog/route-skills.js';
import type { CapabilityManifest } from '../../src/model/capability.js';

const root = fileURLToPath(new URL('../fixtures/skills', import.meta.url));
const packagedSkillsRoot = fileURLToPath(new URL('../../skills', import.meta.url));
const base: CapabilityManifest = {
  schemaVersion: '0.1',
  projectRoot: '/fixture',
  generatedAt: '2026-08-17T12:00:00.000Z',
  artifacts: [],
  frameworks: [],
  services: [],
  capabilities: [],
};

function skillDocument(name: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: Use when exercising a catalog validation fixture.',
    'license: Apache-2.0',
    '---',
    '',
    `# ${name}`,
    '',
  ].join('\n');
}

function readinessDocument(
  id: string,
  check: string,
  mode: 'audit' | 'propose' | 'remediate' | 'verify' = 'audit',
): string {
  return [
    'schemaVersion: "0.1"',
    `id: ${id}`,
    'skillVersion: "0.1.0"',
    'domains:',
    '  - security-privacy',
    'modes:',
    `  - ${mode}`,
    'maxActionLevel: 0',
    'checks:',
    `  - ${check}`,
    '',
  ].join('\n');
}

async function writeCatalogSkill(
  catalogRoot: string,
  directoryName: string,
  frontmatterName: string,
  sidecarId: string,
  check: string,
  mode: 'audit' | 'propose' | 'remediate' | 'verify' = 'audit',
): Promise<void> {
  const directory = join(catalogRoot, directoryName);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'SKILL.md'), skillDocument(frontmatterName));
  await writeFile(join(directory, 'readiness.yaml'), readinessDocument(sidecarId, check, mode));
}

describe('skill catalog', () => {
  it('loads the exact launch operations package without an applicability restriction', async () => {
    const catalog = await loadSkillCatalog(packagedSkillsRoot);
    const launchOperations = catalog.find(({ id }) => id === 'launch-operations');

    expect(launchOperations).toEqual({
      schemaVersion: '0.1',
      id: 'launch-operations',
      skillVersion: '0.1.0',
      domains: [
        'data-correctness',
        'reliability-recovery',
        'operations-observability',
        'maintainability-change-safety',
        'release-delivery',
      ],
      modes: ['audit', 'propose', 'remediate', 'verify'],
      maxActionLevel: 2,
      checks: [
        'launch-operations.release-process',
        'launch-operations.rollback-process',
        'launch-operations.monitoring-response',
        'launch-operations.health-check',
        'launch-operations.backup-restore',
        'launch-operations.maintenance-ownership',
      ],
      directory: join(packagedSkillsRoot, 'launch-operations'),
    });
    expect(launchOperations).not.toHaveProperty('appliesTo');
  });

  it('loads valid sidecars next to Agent Skills', async () => {
    const catalog = await loadSkillCatalog(root);
    expect(catalog.map((skill) => skill.id)).toEqual(['launch-essentials', 'secret-exposure']);
    expect(catalog.map((skill) => skill.skillVersion)).toEqual(['0.1.0', '0.1.0']);
  });

  it('skips instruction-only skill directories without an error', async () => {
    const catalog = await loadSkillCatalog(root);
    expect(catalog.map((skill) => skill.id)).not.toContain('instruction-only');
  });

  it('loads a verify-only sidecar', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-catalog-verify-mode-'));

    try {
      await writeCatalogSkill(
        temporaryRoot,
        'verify-only',
        'verify-only',
        'verify-only',
        'verify-only.check',
        'verify',
      );

      await expect(loadSkillCatalog(temporaryRoot)).resolves.toMatchObject([
        { id: 'verify-only', modes: ['verify'] },
      ]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('routes universal skills and matching capability skills', async () => {
    const catalog = await loadSkillCatalog(root);
    expect(routeSkills(base, catalog).map((skill) => skill.id)).toEqual(['secret-exposure']);
    const personalDataManifest: CapabilityManifest = {
      ...base,
      capabilities: [{ value: 'collects-personal-data', confidence: 'likely', evidence: [] }],
    };
    expect(routeSkills(personalDataManifest, catalog).map((skill) => skill.id)).toEqual([
      'launch-essentials',
      'secret-exposure',
    ]);
  });

  it('rejects a SKILL frontmatter name that does not match its directory', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-catalog-identity-'));

    try {
      await writeCatalogSkill(temporaryRoot, 'directory-name', 'frontmatter-name', 'directory-name', 'directory-name.scan');
      await expect(loadSkillCatalog(temporaryRoot)).rejects.toThrow(
        'directory-name/SKILL.md name must match directory name "directory-name"',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects a sidecar ID that does not match its directory and SKILL identity', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-catalog-sidecar-'));

    try {
      await writeCatalogSkill(temporaryRoot, 'directory-name', 'directory-name', 'sidecar-name', 'sidecar-name.scan');
      await expect(loadSkillCatalog(temporaryRoot)).rejects.toThrow(
        'directory-name/readiness.yaml id must match directory name "directory-name"',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects a sidecar-bearing skill without YAML frontmatter', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-catalog-frontmatter-'));
    const directory = join(temporaryRoot, 'missing-frontmatter');

    try {
      await mkdir(directory);
      await writeFile(join(directory, 'SKILL.md'), '# Missing frontmatter\n');
      await writeFile(
        join(directory, 'readiness.yaml'),
        readinessDocument('missing-frontmatter', 'missing-frontmatter.scan'),
      );
      await expect(loadSkillCatalog(temporaryRoot)).rejects.toThrow(
        'missing-frontmatter/SKILL.md must contain YAML frontmatter',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects duplicate skill IDs across catalog directories', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-catalog-duplicate-skill-'));

    try {
      await writeCatalogSkill(temporaryRoot, 'first', 'first', 'shared', 'first.scan');
      await writeCatalogSkill(temporaryRoot, 'second', 'second', 'shared', 'second.scan');
      await expect(loadSkillCatalog(temporaryRoot)).rejects.toThrow(
        'Duplicate skill id "shared" is owned by first and second',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects duplicate check ownership across skills', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-catalog-duplicate-check-'));

    try {
      await writeCatalogSkill(temporaryRoot, 'first', 'first', 'first', 'shared.scan');
      await writeCatalogSkill(temporaryRoot, 'second', 'second', 'second', 'shared.scan');
      await expect(loadSkillCatalog(temporaryRoot)).rejects.toThrow(
        'Duplicate check id "shared.scan" is owned by first and second',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
