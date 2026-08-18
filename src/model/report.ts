import type { CapabilityManifest } from './capability.js';
import type { ActionLevel, Domain, Finding, Outcome } from './finding.js';

const actionLevels: ActionLevel[] = ['stop-before-launch', 'resolve-before-launch', 'plan-soon', 'improve-when-appropriate', 'human-review-needed'];
const outcomes: Outcome[] = ['passed', 'failed', 'likely-issue', 'unverified', 'not-applicable', 'risk-accepted', 'resolved-and-rechecked'];
export const checkExecutionStatuses = ['completed', 'unavailable', 'failed', 'unverified'] as const;
export const readinessDomains: Domain[] = [
  'product-ux',
  'security-privacy',
  'data-correctness',
  'reliability-recovery',
  'operations-observability',
  'performance-cost',
  'maintainability-change-safety',
  'release-delivery',
  'policy-business-essentials',
];

export type CheckExecutionStatus = typeof checkExecutionStatuses[number];
export type IncompleteCheckStatus = Exclude<CheckExecutionStatus, 'completed'>;

export interface CheckExecution {
  checkId: string;
  checkVersion: string;
  skillId: string;
  skillVersion: string;
  domains: Domain[];
  status: CheckExecutionStatus;
  findingIds: string[];
}

export interface CoverageGap {
  id: string;
  status: IncompleteCheckStatus;
  domains: Domain[];
  reason: string;
  checkId?: string;
  skillId?: string;
}

export interface FindingSummary {
  byActionLevel: Record<ActionLevel, number>;
  byOutcome: Record<Outcome, number>;
}

export type CheckStatusSummary = Record<CheckExecutionStatus, number>;

export interface ReportSummary extends FindingSummary {
  byCheckStatus: CheckStatusSummary;
  byDomain: Record<Domain, CheckStatusSummary>;
}

export interface ReadinessReport {
  schemaVersion: '0.1';
  runId: string;
  generatedAt: string;
  toolkitVersion: string;
  partial: boolean;
  manifest: CapabilityManifest;
  checkExecutions: CheckExecution[];
  coverageGaps: CoverageGap[];
  findings: Finding[];
  summary: ReportSummary;
  disclaimer: string;
}

function zeroRecord<T extends string>(keys: T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function summarizeFindings(findings: Finding[]): FindingSummary {
  const byActionLevel = zeroRecord(actionLevels);
  const byOutcome = zeroRecord(outcomes);
  for (const finding of findings) {
    byActionLevel[finding.actionLevel] += 1;
    byOutcome[finding.outcome] += 1;
  }
  return { byActionLevel, byOutcome };
}

function zeroCheckStatusSummary(): CheckStatusSummary {
  return zeroRecord([...checkExecutionStatuses]);
}

export function summarizeReport(
  findings: Finding[],
  checkExecutions: CheckExecution[],
  coverageGaps: CoverageGap[],
): ReportSummary {
  const byCheckStatus = zeroCheckStatusSummary();
  const byDomain = Object.fromEntries(
    readinessDomains.map((domain) => [domain, zeroCheckStatusSummary()]),
  ) as Record<Domain, CheckStatusSummary>;

  for (const execution of checkExecutions) {
    byCheckStatus[execution.status] += 1;
    for (const domain of execution.domains) byDomain[domain][execution.status] += 1;
  }

  for (const gap of coverageGaps.filter(({ checkId }) => checkId === undefined)) {
    for (const domain of gap.domains) byDomain[domain][gap.status] += 1;
  }

  return { ...summarizeFindings(findings), byCheckStatus, byDomain };
}

export function derivePartial(
  checkExecutions: CheckExecution[],
  coverageGaps: CoverageGap[],
): boolean {
  return coverageGaps.length > 0
    || checkExecutions.some(({ status }) => status !== 'completed');
}
