import { describe, expect, it } from 'vitest';
import type { SkillDescriptor } from '../../src/catalog/load-catalog.js';
import type { CheckImplementation, CheckRegistry } from '../../src/orchestrator/check-registry.js';
import { buildReviewPlan } from '../../src/orchestrator/build-review-plan.js';

const secretExposure: SkillDescriptor = {
  schemaVersion: '0.1',
  id: 'secret-exposure',
  skillVersion: '0.1.0',
  domains: ['release-delivery', 'operations-observability'],
  modes: ['audit'],
  maxActionLevel: 0,
  checks: ['secret-exposure.scan', 'secret-exposure.entropy'],
  directory: '/fixtures/secret-exposure',
};

const readyCheck: CheckImplementation = {
  id: 'secret-exposure.scan',
  version: '0.1.0',
  domains: ['release-delivery'],
  actionLevel: 0,
  requiredAccess: ['filesystem-read'],
  async run() {
    return [];
  },
};

describe('buildReviewPlan', () => {
  it('preserves exact check domains for ready checks while unavailable checks use skill domains', () => {
    const registry: CheckRegistry = new Map([[readyCheck.id, readyCheck]]);

    expect(buildReviewPlan([secretExposure], registry)).toEqual([
      {
        checkId: 'secret-exposure.scan',
        checkVersion: '0.1.0',
        skillId: 'secret-exposure',
        skillVersion: '0.1.0',
        domains: ['release-delivery'],
        status: 'ready',
        actionLevel: 0,
        requiredAccess: ['filesystem-read'],
      },
      {
        checkId: 'secret-exposure.entropy',
        checkVersion: 'unknown',
        skillId: 'secret-exposure',
        skillVersion: '0.1.0',
        domains: ['release-delivery', 'operations-observability'],
        status: 'unavailable',
        reason: 'No check implementation is registered.',
      },
    ]);
  });

  it('rejects registered checks above Level 1', () => {
    const levelTwoCheck: CheckImplementation = {
      ...readyCheck,
      actionLevel: 2,
    };
    const registry: CheckRegistry = new Map([[levelTwoCheck.id, levelTwoCheck]]);

    expect(() => buildReviewPlan([secretExposure], registry)).toThrow(
      'Foundation runner cannot execute Level 2 check secret-exposure.scan',
    );
  });
});
