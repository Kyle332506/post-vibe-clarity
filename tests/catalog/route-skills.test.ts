import { describe, expect, it } from 'vitest';
import type { SkillDescriptor } from '../../src/catalog/load-catalog.js';
import { routeSkills } from '../../src/catalog/route-skills.js';
import type { CapabilityManifest } from '../../src/model/capability.js';

const manifest: CapabilityManifest = {
  schemaVersion: '0.1',
  projectRoot: '/fixture',
  generatedAt: '2026-08-18T12:00:00.000Z',
  artifacts: [],
  frameworks: [],
  services: [],
  capabilities: [],
};

const auditSkill: SkillDescriptor = {
  schemaVersion: '0.1',
  id: 'audit-skill',
  skillVersion: '0.1.0',
  domains: ['security-privacy'],
  modes: ['audit'],
  maxActionLevel: 0,
  checks: ['audit-skill.check'],
  directory: '/fixtures/audit-skill',
};

const verifySkill: SkillDescriptor = {
  schemaVersion: '0.1',
  id: 'verify-skill',
  skillVersion: '0.1.0',
  domains: ['release-delivery'],
  modes: ['verify'],
  maxActionLevel: 1,
  checks: ['verify-skill.check'],
  directory: '/fixtures/verify-skill',
};

describe('routeSkills', () => {
  it('routes only audit skills by default', () => {
    expect(routeSkills(manifest, [auditSkill, verifySkill])).toEqual([auditSkill]);
  });

  it('routes only verify skills in verify mode', () => {
    expect(routeSkills(manifest, [auditSkill, verifySkill], 'verify')).toEqual([verifySkill]);
  });
});
