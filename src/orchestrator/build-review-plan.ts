import type { SkillDescriptor } from '../catalog/load-catalog.js';
import type { CheckRegistry, RequiredAccess } from './check-registry.js';

export type ReviewPlanItem =
  | { checkId: string; checkVersion: string; skillId: string; skillVersion: string; status: 'ready'; actionLevel: 0 | 1; requiredAccess: readonly RequiredAccess[] }
  | { checkId: string; checkVersion: 'unknown'; skillId: string; skillVersion: string; status: 'unavailable'; reason: string };

export function buildReviewPlan(skills: SkillDescriptor[], registry: CheckRegistry): ReviewPlanItem[] {
  return skills.flatMap((skill) => skill.checks.map((checkId): ReviewPlanItem => {
    const implementation = registry.get(checkId);
    if (!implementation) {
      return {
        checkId,
        checkVersion: 'unknown',
        skillId: skill.id,
        skillVersion: skill.skillVersion,
        status: 'unavailable',
        reason: 'No check implementation is registered.',
      };
    }
    const actionLevel = implementation.actionLevel;
    if (actionLevel !== 0 && actionLevel !== 1) {
      throw new Error(`Foundation runner cannot execute Level ${actionLevel} check ${checkId}`);
    }
    return {
      checkId,
      checkVersion: implementation.version,
      skillId: skill.id,
      skillVersion: skill.skillVersion,
      status: 'ready',
      actionLevel,
      requiredAccess: implementation.requiredAccess,
    };
  }));
}
