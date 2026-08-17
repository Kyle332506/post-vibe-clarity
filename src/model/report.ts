import type { CapabilityManifest } from './capability.js';
import type { ActionLevel, Finding, Outcome } from './finding.js';

const actionLevels: ActionLevel[] = ['stop-before-launch', 'resolve-before-launch', 'plan-soon', 'improve-when-appropriate', 'human-review-needed'];
const outcomes: Outcome[] = ['passed', 'failed', 'likely-issue', 'unverified', 'not-applicable', 'risk-accepted', 'resolved-and-rechecked'];

export interface FindingSummary {
  byActionLevel: Record<ActionLevel, number>;
  byOutcome: Record<Outcome, number>;
}

export interface ReadinessReport {
  schemaVersion: '0.1';
  runId: string;
  generatedAt: string;
  toolkitVersion: string;
  partial: boolean;
  manifest: CapabilityManifest;
  findings: Finding[];
  summary: FindingSummary;
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
