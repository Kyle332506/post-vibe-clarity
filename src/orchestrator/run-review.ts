import { resolve } from 'node:path';
import { loadSkillCatalog, type SkillDescriptor } from '../catalog/load-catalog.js';
import { routeSkills } from '../catalog/route-skills.js';
import { privacyNoticeCheck } from '../checks/launch-essentials.js';
import { secretExposureCheck } from '../checks/secret-exposure.js';
import { discoverProject } from '../discovery/discover-project.js';
import type { Finding } from '../model/finding.js';
import {
  derivePartial,
  readinessDomains,
  summarizeReport,
  type CheckExecution,
  type CoverageGap,
  type ReadinessReport,
} from '../model/report.js';
import { validateReadinessReport } from '../validation/report-schema.js';
import { buildReviewPlan, type ReviewPlanItem } from './build-review-plan.js';
import type { CheckImplementation, CheckRegistry } from './check-registry.js';

export interface RunReviewOptions {
  root: string;
  skillsRoot: string;
  now?: () => string;
  checkImplementations?: readonly CheckImplementation[];
}

const disclaimer = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';

function freezeRegistration(implementation: CheckImplementation): CheckImplementation {
  const capturedRun = implementation.run;
  const run: CheckImplementation['run'] = Object.freeze((context) => capturedRun(context));
  return Object.freeze({
    id: implementation.id,
    version: implementation.version,
    actionLevel: implementation.actionLevel,
    requiredAccess: Object.freeze([...implementation.requiredAccess]),
    run,
  });
}

export const foundationCheckImplementations: readonly CheckImplementation[] = Object.freeze([
  freezeRegistration(privacyNoticeCheck),
  freezeRegistration(secretExposureCheck),
]);

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
    checkVersion: 'unknown',
    skillVersion: item.skillVersion,
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

function failedFinding(item: Extract<ReviewPlanItem, { status: 'ready' }>, skill: SkillDescriptor): Finding {
  return {
    id: `${item.checkId}.execution-failed`,
    checkId: item.checkId,
    checkVersion: item.checkVersion,
    skillVersion: item.skillVersion,
    domains: skill.domains,
    actionLevel: 'human-review-needed',
    outcome: 'unverified',
    title: `${item.checkId} did not complete`,
    impact: 'This area remains unverified because the check failed before producing a result.',
    evidence: [],
    evidenceConfidence: 'insufficient',
    applicability: `The ${item.skillId} skill was routed to this project.`,
    recommendation: 'Resolve the local execution problem and run the review again.',
    verification: `Run ${item.checkId} again and confirm it completes.`,
    humanReviewRequired: true,
    unverifiedBoundaries: ['The check failed before it could complete.'],
  };
}

function domainCoverageGaps(checkExecutions: CheckExecution[]): CoverageGap[] {
  const routedDomains = new Set(checkExecutions.flatMap(({ domains }) => domains));
  return readinessDomains
    .filter((domain) => !routedDomains.has(domain))
    .map((domain) => ({
      id: `domain.${domain}`,
      status: 'unverified',
      domains: [domain],
      reason: 'No routed check covers this domain in the current review.',
    }));
}

export async function runReview(options: RunReviewOptions): Promise<ReadinessReport> {
  const root = resolve(options.root);
  const skillsRoot = resolve(options.skillsRoot);
  const generatedAt = (options.now ?? (() => new Date().toISOString()))();
  const manifest = await discoverProject(root, () => generatedAt);
  const catalog = await loadSkillCatalog(skillsRoot);
  const routedSkills = routeSkills(manifest, catalog, 'audit');
  const registeredImplementations = options.checkImplementations === undefined
    ? foundationCheckImplementations
    : options.checkImplementations.map(freezeRegistration);
  const registry: CheckRegistry = new Map(registeredImplementations.map((implementation) => [implementation.id, implementation]));
  const plan = buildReviewPlan(routedSkills, registry);
  const skillsById = new Map(routedSkills.map((skill) => [skill.id, skill]));
  const findings: Finding[] = [];
  const checkExecutions: CheckExecution[] = [];
  const coverageGaps: CoverageGap[] = [];

  for (const item of [...plan].sort((left, right) => left.checkId.localeCompare(right.checkId))) {
    const skill = skillsById.get(item.skillId);
    if (!skill) throw new Error(`Routed skill not found for check ${item.checkId}`);

    if (item.status === 'unavailable') {
      const finding = unavailableFinding(item, skill);
      findings.push(finding);
      checkExecutions.push({
        checkId: item.checkId,
        checkVersion: item.checkVersion,
        skillId: item.skillId,
        skillVersion: item.skillVersion,
        domains: skill.domains,
        status: 'unavailable',
        findingIds: [finding.id],
      });
      coverageGaps.push({
        id: `check.${item.checkId}`,
        checkId: item.checkId,
        skillId: item.skillId,
        status: 'unavailable',
        domains: skill.domains,
        reason: item.reason,
      });
      continue;
    }

    const implementation = registry.get(item.checkId);
    if (!implementation) throw new Error(`Ready check implementation not found for ${item.checkId}`);

    try {
      const checkFindings = await implementation.run({ root, manifest });
      findings.push(...checkFindings);
      const unverifiedFindings = checkFindings.filter(({ outcome }) => outcome === 'unverified');
      const status = unverifiedFindings.length > 0 ? 'unverified' : 'completed';
      checkExecutions.push({
        checkId: item.checkId,
        checkVersion: item.checkVersion,
        skillId: item.skillId,
        skillVersion: item.skillVersion,
        domains: skill.domains,
        status,
        findingIds: checkFindings.map(({ id }) => id).sort(),
      });
      if (status === 'unverified') {
        const reasons = unverifiedFindings.flatMap(({ unverifiedBoundaries }) => unverifiedBoundaries ?? []);
        coverageGaps.push({
          id: `check.${item.checkId}`,
          checkId: item.checkId,
          skillId: item.skillId,
          status,
          domains: skill.domains,
          reason: reasons.length > 0
            ? [...new Set(reasons)].sort().join(' ')
            : 'The check completed without enough evidence to verify this area.',
        });
      }
    } catch {
      const finding = failedFinding(item, skill);
      findings.push(finding);
      checkExecutions.push({
        checkId: item.checkId,
        checkVersion: item.checkVersion,
        skillId: item.skillId,
        skillVersion: item.skillVersion,
        domains: skill.domains,
        status: 'failed',
        findingIds: [finding.id],
      });
      coverageGaps.push({
        id: `check.${item.checkId}`,
        checkId: item.checkId,
        skillId: item.skillId,
        status: 'failed',
        domains: skill.domains,
        reason: 'The check failed before it could complete. Run it again after resolving the local execution problem.',
      });
    }
  }

  findings.sort(compareFindings);
  coverageGaps.push(...domainCoverageGaps(checkExecutions));
  coverageGaps.sort((left, right) => left.id.localeCompare(right.id));

  const report: ReadinessReport = {
    schemaVersion: '0.1',
    runId: `pvc-${generatedAt.replace(/\D/g, '')}`,
    generatedAt,
    toolkitVersion: '0.1.0',
    partial: derivePartial(checkExecutions, coverageGaps),
    manifest,
    checkExecutions,
    coverageGaps,
    findings,
    summary: summarizeReport(findings, checkExecutions, coverageGaps),
    disclaimer,
  };

  const validation = await validateReadinessReport(report);
  if (!validation.ok) {
    throw new Error('Generated report failed versioned runtime validation.');
  }
  return report;
}
