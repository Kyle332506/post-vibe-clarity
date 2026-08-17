import { resolve } from 'node:path';
import { loadSkillCatalog, type SkillDescriptor } from '../catalog/load-catalog.js';
import { routeSkills } from '../catalog/route-skills.js';
import { privacyNoticeCheck } from '../checks/launch-essentials.js';
import { secretExposureCheck } from '../checks/secret-exposure.js';
import { discoverProject } from '../discovery/discover-project.js';
import type { Finding } from '../model/finding.js';
import { summarizeFindings, type ReadinessReport } from '../model/report.js';
import { buildReviewPlan, type ReviewPlanItem } from './build-review-plan.js';
import type { CheckImplementation, CheckRegistry } from './check-registry.js';

export interface RunReviewOptions {
  root: string;
  skillsRoot: string;
  now?: () => string;
}

const disclaimer = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';

export const foundationCheckImplementations: readonly CheckImplementation[] = [
  privacyNoticeCheck,
  secretExposureCheck,
];

function compareFindings(left: Finding, right: Finding): number {
  return left.checkId.localeCompare(right.checkId) || left.id.localeCompare(right.id);
}

function unavailableFinding(
  item: Extract<ReviewPlanItem, { status: 'unavailable' }>,
  skill: SkillDescriptor,
): Finding {
  return {
    id: `${item.checkId}.unavailable`,
    checkId: item.checkId,
    skillVersion: '0.1.0',
    domains: skill.domains,
    actionLevel: 'human-review-needed',
    outcome: 'unverified',
    title: `${item.checkId} could not be run`,
    impact: 'The review could not determine whether this check passes.',
    evidence: [],
    evidenceConfidence: 'insufficient',
    applicability: `The ${item.skillId} skill was routed to this project.`,
    recommendation: 'Make the check implementation available and run the review again.',
    verification: `Run ${item.checkId} after its implementation is available.`,
    humanReviewRequired: true,
    unverifiedBoundaries: [item.reason],
  };
}

export async function runReview(options: RunReviewOptions): Promise<ReadinessReport> {
  const root = resolve(options.root);
  const skillsRoot = resolve(options.skillsRoot);
  const generatedAt = (options.now ?? (() => new Date().toISOString()))();
  const manifest = await discoverProject(root, () => generatedAt);
  const catalog = await loadSkillCatalog(skillsRoot);
  const routedSkills = routeSkills(manifest, catalog);
  const registry: CheckRegistry = new Map(foundationCheckImplementations.map((implementation) => [implementation.id, implementation]));
  const plan = buildReviewPlan(routedSkills, registry);
  const skillsById = new Map(routedSkills.map((skill) => [skill.id, skill]));
  const findings: Finding[] = [];

  for (const item of plan.filter((planItem) => planItem.status === 'unavailable')) {
    const skill = skillsById.get(item.skillId);
    if (!skill) throw new Error(`Routed skill not found for check ${item.checkId}`);
    findings.push(unavailableFinding(item, skill));
  }

  for (const item of plan.filter((planItem) => planItem.status === 'ready').sort((left, right) => left.checkId.localeCompare(right.checkId))) {
    const implementation = registry.get(item.checkId);
    if (implementation) findings.push(...await implementation.run({ root, manifest }));
  }

  findings.sort(compareFindings);

  return {
    schemaVersion: '0.1',
    runId: `pvc-${generatedAt.replace(/\D/g, '')}`,
    generatedAt,
    toolkitVersion: '0.1.0',
    partial: findings.some((finding) => finding.outcome === 'unverified'),
    manifest,
    findings,
    summary: summarizeFindings(findings),
    disclaimer,
  };
}
