import { realpath, stat } from 'node:fs/promises';
import { loadSkillCatalog } from '../catalog/load-catalog.js';
import { routeSkills } from '../catalog/route-skills.js';
import type { VerificationPlan } from '../model/verification.js';
import { runReview } from '../orchestrator/run-review.js';
import { validateVerificationPlan } from '../validation/verification-plan-schema.js';
import { TOOLKIT_VERSION } from '../version.js';
import { discoverVerificationCommands } from './discover-commands.js';
import { collectProjectInputDigests, digestInputLocations } from './input-digests.js';
import { fingerprintPlan, type FingerprintPlanInput } from './plan-fingerprint.js';
import { resolveProjectRoot } from './project-path.js';

export interface BuildVerificationPlanOptions {
  root: string;
  skillsRoot: string;
  excludedCommandIds: Set<string>;
  outputPath: string;
  now?: () => string;
}

export const VERIFICATION_DISCLAIMER = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';
export const CONTAINMENT_WARNING = 'Commands run as local processes with the current user privileges; this is not a security sandbox and does not block network or out-of-project filesystem access.';

async function resolveSkillsRoot(path: string): Promise<string> {
  let resolved: string;
  try {
    resolved = await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Skills root does not exist.');
    throw error;
  }
  if (!(await stat(resolved)).isDirectory()) throw new Error('Skills root must be a directory.');
  return resolved;
}

export async function selectedSkillInputLocations(
  skillsRoot: string,
  manifest: VerificationPlan['planningReport']['manifest'],
): Promise<string[]> {
  const catalog = await loadSkillCatalog(skillsRoot);
  return routeSkills(manifest, catalog, 'verify')
    .flatMap(({ id }) => [`${id}/readiness.yaml`, `${id}/SKILL.md`])
    .sort((left, right) => left.localeCompare(right));
}

export async function buildVerificationPlan(options: BuildVerificationPlanOptions): Promise<VerificationPlan> {
  const [projectRoot, skillsRoot] = await Promise.all([
    resolveProjectRoot(options.root),
    resolveSkillsRoot(options.skillsRoot),
  ]);
  const generatedAt = (options.now ?? (() => new Date().toISOString()))();
  const [planningReport, discovery, inputDigests] = await Promise.all([
    runReview({ root: projectRoot, skillsRoot, now: () => generatedAt }),
    discoverVerificationCommands(projectRoot, options.excludedCommandIds),
    collectProjectInputDigests(projectRoot, options.outputPath),
  ]);
  const skillLocations = await selectedSkillInputLocations(skillsRoot, planningReport.manifest);
  const skillDigests = await digestInputLocations(skillsRoot, skillLocations);

  const fingerprintInput: FingerprintPlanInput = {
    schemaId: 'postvibe-verification-plan/0.1',
    schemaVersion: '0.1',
    toolkitVersion: TOOLKIT_VERSION,
    projectRoot,
    skillsRoot,
    planningReport,
    inputDigests,
    skillDigests,
    commands: discovery.commands,
    excludedCommands: discovery.excludedCommands,
    categoryAssessments: discovery.categoryAssessments,
    coverageGaps: discovery.coverageGaps,
    executionPolicy: {
      environmentPolicyVersion: 'env-filter/0.1',
      outputLimitBytes: 262144,
      executor: 'local-process/0.1',
    },
    containmentWarning: CONTAINMENT_WARNING,
    disclaimer: VERIFICATION_DISCLAIMER,
  };
  const fingerprint = fingerprintPlan(fingerprintInput);
  const plan: VerificationPlan = {
    ...fingerprintInput,
    planId: `pvp-${fingerprint.slice(0, 16)}`,
    fingerprint,
    generatedAt,
  };
  const validation = await validateVerificationPlan(plan);
  if (!validation.ok) throw new Error('Generated verification plan failed versioned runtime validation.');
  return plan;
}
