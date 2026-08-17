import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSkillCatalog } from '../../src/catalog/load-catalog.js';
import { routeSkills } from '../../src/catalog/route-skills.js';
import type { CapabilityManifest } from '../../src/model/capability.js';

const root = fileURLToPath(new URL('../fixtures/skills', import.meta.url));
const base: CapabilityManifest = {
  schemaVersion: '0.1',
  projectRoot: '/fixture',
  generatedAt: '2026-08-17T12:00:00.000Z',
  artifacts: [],
  frameworks: [],
  services: [],
  capabilities: [],
};

describe('skill catalog', () => {
  it('loads valid sidecars next to Agent Skills', async () => {
    const catalog = await loadSkillCatalog(root);
    expect(catalog.map((skill) => skill.id)).toEqual(['launch-essentials', 'secret-exposure']);
  });

  it('skips instruction-only skill directories without an error', async () => {
    const catalog = await loadSkillCatalog(root);
    expect(catalog.map((skill) => skill.id)).not.toContain('instruction-only');
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
});
