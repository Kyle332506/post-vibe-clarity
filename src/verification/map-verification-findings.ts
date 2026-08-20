import type { ActionLevel, Domain, Finding, Outcome } from '../model/finding.js';
import type { CoverageGap } from '../model/report.js';
import type { VerificationFindingSet } from '../model/verified-report.js';
import type {
  CommandCategory,
  CommandResultStatus,
  VerificationCategoryAssessment,
  VerificationCommand,
  VerificationCommandResult,
  VerificationExecution,
  VerificationPlan,
} from '../model/verification.js';
import { validateExecutionAgainstPlan } from '../validation/verification-execution-schema.js';

const checkId = 'universal-verification.commands';
const checkVersion = '0.1.0';
const skillId = 'universal-verification';
const skillVersion = '0.1.0';
const checkDomains: Domain[] = [
  'data-correctness',
  'maintainability-change-safety',
  'release-delivery',
];

const categoryDomains: Record<CommandCategory, Domain[]> = {
  build: ['release-delivery'],
  test: ['data-correctness'],
  'type-check': ['data-correctness', 'maintainability-change-safety'],
  lint: ['maintainability-change-safety'],
};

const failedAction: Record<CommandCategory, ActionLevel> = {
  build: 'stop-before-launch',
  test: 'stop-before-launch',
  'type-check': 'resolve-before-launch',
  lint: 'resolve-before-launch',
};

const missingAction: Record<CommandCategory, ActionLevel> = {
  build: 'resolve-before-launch',
  test: 'resolve-before-launch',
  'type-check': 'plan-soon',
  lint: 'plan-soon',
};

function categoryLabel(category: CommandCategory): string {
  return category === 'type-check' ? 'Type-check' : `${category[0]!.toUpperCase()}${category.slice(1)}`;
}

function findingBase(category: CommandCategory) {
  return {
    checkId,
    checkVersion,
    skillVersion,
    domains: categoryDomains[category],
    humanReviewRequired: false,
  };
}

function resultOutcome(status: CommandResultStatus): Outcome {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  return 'unverified';
}

function resultAction(category: CommandCategory, status: CommandResultStatus): ActionLevel {
  if (status === 'passed') return 'improve-when-appropriate';
  if (status === 'failed') return failedAction[category];
  return missingAction[category];
}

function commandFinding(
  command: VerificationCommand,
  result: VerificationCommandResult,
  assessment: VerificationCategoryAssessment,
): Finding {
  const outcome = resultOutcome(result.status);
  const duration = result.durationMs === undefined ? 'unavailable' : `${result.durationMs} ms`;
  const reason = result.unverifiedReason ?? `The approved command reported ${result.status}.`;
  const evidence: Finding['evidence'] = [{
    kind: 'command',
    summary: `Status: ${result.status}; duration: ${duration}.`,
    location: command.source.location,
  }];
  evidence.push(...result.fileChanges.map((change) => ({
    kind: 'file' as const,
    summary: `Changed path (${change.kind}).`,
    location: change.path,
  })));

  return {
    id: `${checkId}.${command.id}`,
    ...findingBase(command.category),
    actionLevel: resultAction(command.category, result.status),
    outcome,
    title: `${categoryLabel(command.category)} command ${result.status}`,
    impact: outcome === 'passed'
      ? `The approved ${command.category} command completed successfully.`
      : outcome === 'failed'
        ? `The approved ${command.category} command completed and reported a failure.`
        : `The approved ${command.category} command did not produce complete verification evidence.`,
    evidence,
    evidenceConfidence: outcome === 'unverified' ? 'insufficient' : 'confirmed',
    applicability: assessment.reason,
    recommendation: outcome === 'failed'
      ? `Resolve the reported ${command.category} failure before relying on this verification.`
      : outcome === 'unverified'
        ? `Resolve the execution gap and run the same approved ${command.category} command again.`
        : `Retain the declared ${command.category} command for verification after relevant changes.`,
    verification: `Run ${command.id} again under an approved plan and record its result.`,
    humanReviewRequired: false,
    ...(outcome === 'unverified' ? { unverifiedBoundaries: [reason] } : {}),
  };
}

function excludedFinding(
  command: VerificationCommand,
  assessment: VerificationCategoryAssessment,
  plan: VerificationPlan,
): Finding {
  const gap = plan.coverageGaps.find(({ id }) => id === `command.${command.id}`);
  const reason = gap?.reason ?? `The declared ${command.category} command was excluded from the approved plan.`;
  return {
    id: `${checkId}.${command.id}`,
    ...findingBase(command.category),
    actionLevel: missingAction[command.category],
    outcome: 'unverified',
    title: `${categoryLabel(command.category)} command excluded`,
    impact: `The excluded ${command.category} command provides no execution evidence.`,
    evidence: [{
      kind: 'command',
      summary: 'Status: excluded; duration: unavailable.',
      location: command.source.location,
    }],
    evidenceConfidence: 'insufficient',
    applicability: assessment.reason,
    recommendation: `Approve and run ${command.id}, or retain the exclusion as an explicit evidence gap.`,
    verification: `Run ${command.id} under a newly approved plan and record its result.`,
    humanReviewRequired: false,
    unverifiedBoundaries: [reason],
  };
}

function categoryFinding(assessment: VerificationCategoryAssessment, plan: VerificationPlan): Finding {
  const notApplicable = assessment.state === 'not-applicable';
  const gap = plan.coverageGaps.find(({ category }) => category === assessment.category);
  const reason = gap?.reason ?? assessment.reason;
  return {
    id: `${checkId}.category.${assessment.category}`,
    ...findingBase(assessment.category),
    actionLevel: notApplicable ? 'improve-when-appropriate' : missingAction[assessment.category],
    outcome: notApplicable ? 'not-applicable' : 'unverified',
    title: `${categoryLabel(assessment.category)} verification ${notApplicable ? 'not applicable' : 'missing'}`,
    impact: notApplicable
      ? `The available project evidence indicates that a ${assessment.category} command does not apply.`
      : `No complete ${assessment.category} command evidence was recorded.`,
    evidence: [{
      kind: 'behavior',
      summary: `Status: ${notApplicable ? 'not-applicable' : 'missing'}; duration: unavailable.`,
    }],
    evidenceConfidence: notApplicable ? 'confirmed' : 'insufficient',
    applicability: assessment.reason,
    recommendation: notApplicable
      ? 'Reassess applicability if the project structure or delivery process changes.'
      : `Declare an applicable ${assessment.category} command or retain this evidence gap.`,
    verification: notApplicable
      ? 'Review the category assessment again after relevant project changes.'
      : `Create a new plan after declaring a ${assessment.category} command.`,
    humanReviewRequired: false,
    ...(!notApplicable ? { unverifiedBoundaries: [reason] } : {}),
  };
}

function incompleteCoverageGap(findings: Finding[], execution: VerificationExecution): CoverageGap[] {
  const incomplete = findings.filter(({ outcome }) => outcome === 'unverified');
  if (incomplete.length === 0 && execution.status !== 'partial' && execution.coverageGaps.length === 0) return [];
  const reasons = new Set([
    ...incomplete.flatMap(({ unverifiedBoundaries }) => unverifiedBoundaries ?? []),
    ...execution.coverageGaps.map(({ reason }) => reason),
  ]);
  return [{
    id: `check.${checkId}`,
    checkId,
    skillId,
    status: 'unverified',
    domains: checkDomains,
    reason: [...reasons].join(' ') || 'The verification execution is partial and does not provide complete evidence.',
  }];
}

export function mapVerificationEvidence(
  plan: VerificationPlan,
  execution: VerificationExecution,
): VerificationFindingSet {
  const linkageErrors = validateExecutionAgainstPlan(execution, plan);
  if (linkageErrors.length > 0) throw new Error(linkageErrors.join('; '));

  const assessments = new Map(plan.categoryAssessments.map((assessment) => [assessment.category, assessment]));
  const results = new Map(execution.results.map((result) => [result.commandId, result]));
  const findings: Finding[] = [];

  for (const command of plan.commands) {
    const result = results.get(command.id);
    const assessment = assessments.get(command.category);
    if (!result) throw new Error(`/results must contain selected command ${command.id}`);
    if (!assessment) throw new Error(`/categoryAssessments must contain ${command.category}`);
    findings.push(commandFinding(command, result, assessment));
  }

  for (const command of plan.excludedCommands) {
    const assessment = assessments.get(command.category);
    if (!assessment) throw new Error(`/categoryAssessments must contain ${command.category}`);
    findings.push(excludedFinding(command, assessment, plan));
  }

  const representedCategories = new Set(
    [...plan.commands, ...plan.excludedCommands].map(({ category }) => category),
  );
  for (const assessment of plan.categoryAssessments) {
    if (!representedCategories.has(assessment.category)) findings.push(categoryFinding(assessment, plan));
  }

  findings.sort((left, right) => left.id.localeCompare(right.id));
  const coverageGaps = incompleteCoverageGap(findings, execution);
  return {
    findings,
    checkExecution: {
      checkId,
      checkVersion,
      skillId,
      skillVersion,
      domains: checkDomains,
      status: coverageGaps.length === 0 ? 'completed' : 'unverified',
      findingIds: findings.map(({ id }) => id),
    },
    coverageGaps,
  };
}
