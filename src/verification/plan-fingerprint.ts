import { createHash } from 'node:crypto';
import type { VerificationPlan } from '../model/verification.js';
import { compareOrdinal } from '../ordinal.js';

export interface FingerprintPlanInput {
  schemaId: VerificationPlan['schemaId'];
  schemaVersion: VerificationPlan['schemaVersion'];
  toolkitVersion: VerificationPlan['toolkitVersion'];
  projectRoot: VerificationPlan['projectRoot'];
  skillsRoot: VerificationPlan['skillsRoot'];
  planningReport: VerificationPlan['planningReport'];
  inputDigests: VerificationPlan['inputDigests'];
  skillDigests: VerificationPlan['skillDigests'];
  commands: VerificationPlan['commands'];
  excludedCommands: VerificationPlan['excludedCommands'];
  categoryAssessments: VerificationPlan['categoryAssessments'];
  coverageGaps: VerificationPlan['coverageGaps'];
  executionPolicy: VerificationPlan['executionPolicy'];
  containmentWarning: VerificationPlan['containmentWarning'];
  disclaimer: VerificationPlan['disclaimer'];
}

function encodeCanonical(value: unknown, inArray = false): string | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => encodeCanonical(item, true) ?? 'null').join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const properties = Object.keys(record)
      .sort(compareOrdinal)
      .flatMap((key) => {
        const encoded = encodeCanonical(record[key]);
        return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`];
      });
    return `{${properties.join(',')}}`;
  }
  if (inArray) return 'null';
  return undefined;
}

export function canonicalJson(value: unknown): string {
  const encoded = encodeCanonical(value);
  if (encoded === undefined) throw new Error('Value cannot be represented as canonical JSON.');
  return encoded;
}

function normalizedFingerprintPayload(plan: FingerprintPlanInput): unknown {
  const report = plan.planningReport;
  const manifest = report.manifest;

  return {
    schemaId: plan.schemaId,
    schemaVersion: plan.schemaVersion,
    toolkitVersion: plan.toolkitVersion,
    projectRoot: plan.projectRoot,
    skillsRoot: plan.skillsRoot,
    planningReport: {
      schemaVersion: report.schemaVersion,
      toolkitVersion: report.toolkitVersion,
      partial: report.partial,
      manifest: {
        schemaVersion: manifest.schemaVersion,
        projectRoot: manifest.projectRoot,
        artifacts: manifest.artifacts,
        frameworks: manifest.frameworks,
        services: manifest.services,
        capabilities: manifest.capabilities,
      },
      checkExecutions: report.checkExecutions,
      coverageGaps: report.coverageGaps,
      findings: report.findings,
      summary: report.summary,
      disclaimer: report.disclaimer,
    },
    inputDigests: plan.inputDigests,
    skillDigests: plan.skillDigests,
    commands: plan.commands,
    excludedCommands: plan.excludedCommands,
    categoryAssessments: plan.categoryAssessments,
    coverageGaps: plan.coverageGaps,
    executionPolicy: plan.executionPolicy,
    containmentWarning: plan.containmentWarning,
    disclaimer: plan.disclaimer,
  };
}

export function fingerprintPlan(input: FingerprintPlanInput): string {
  return createHash('sha256')
    .update(canonicalJson(normalizedFingerprintPayload(input)), 'utf8')
    .digest('hex');
}
