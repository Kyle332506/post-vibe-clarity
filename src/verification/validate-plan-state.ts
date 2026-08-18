import { realpath, stat } from 'node:fs/promises';
import type { VerificationPlan } from '../model/verification.js';
import { validateVerificationPlan } from '../validation/verification-plan-schema.js';
import { TOOLKIT_VERSION } from '../version.js';
import { selectedSkillInputLocations } from './build-verification-plan.js';
import { discoverVerificationCommands } from './discover-commands.js';
import { digestInputLocations } from './input-digests.js';
import { canonicalJson, fingerprintPlan } from './plan-fingerprint.js';
import { resolveProjectRoot } from './project-path.js';

export const STALE_PLAN_ERROR = 'Verification plan is stale; create and approve a new plan.';

function requireEqual(left: unknown, right: unknown): void {
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(STALE_PLAN_ERROR);
}

async function resolveSkillsRoot(path: string): Promise<string> {
  const resolved = await realpath(path);
  if (!(await stat(resolved)).isDirectory()) throw new Error(STALE_PLAN_ERROR);
  return resolved;
}

export async function validatePlanState(plan: VerificationPlan): Promise<void> {
  try {
    const validation = await validateVerificationPlan(plan);
    if (!validation.ok) throw new Error(STALE_PLAN_ERROR);
    if (plan.toolkitVersion !== TOOLKIT_VERSION) throw new Error(STALE_PLAN_ERROR);
    if (fingerprintPlan(plan) !== plan.fingerprint) throw new Error(STALE_PLAN_ERROR);

    const [projectRoot, skillsRoot] = await Promise.all([
      resolveProjectRoot(plan.projectRoot),
      resolveSkillsRoot(plan.skillsRoot),
    ]);
    if (projectRoot !== plan.projectRoot || skillsRoot !== plan.skillsRoot) throw new Error(STALE_PLAN_ERROR);

    const excludedIds = new Set(plan.excludedCommands.map(({ id }) => id));
    const discovery = await discoverVerificationCommands(projectRoot, excludedIds);
    requireEqual(discovery.commands, plan.commands);
    requireEqual(discovery.excludedCommands, plan.excludedCommands);
    requireEqual(discovery.categoryAssessments, plan.categoryAssessments);
    requireEqual(discovery.coverageGaps, plan.coverageGaps);

    const recordedInputLocations = new Set(plan.inputDigests.map(({ location }) => location));
    if (discovery.inputLocations.some((location) => !recordedInputLocations.has(location))) {
      throw new Error(STALE_PLAN_ERROR);
    }
    requireEqual(await digestInputLocations(projectRoot, [...recordedInputLocations]), plan.inputDigests);

    const skillLocations = await selectedSkillInputLocations(skillsRoot, plan.planningReport.manifest);
    requireEqual(skillLocations, plan.skillDigests.map(({ location }) => location));
    requireEqual(await digestInputLocations(skillsRoot, skillLocations), plan.skillDigests);
  } catch {
    throw new Error(STALE_PLAN_ERROR);
  }
}
