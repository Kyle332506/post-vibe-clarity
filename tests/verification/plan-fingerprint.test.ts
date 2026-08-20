import { describe, expect, it } from 'vitest';
import { sampleVerificationPlan } from '../fixtures/sample-verification-plan.js';
import { canonicalJson, fingerprintPlan } from '../../src/verification/plan-fingerprint.js';

describe('canonicalJson', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
    expect(canonicalJson({ values: ['first', 'second'] }))
      .not.toBe(canonicalJson({ values: ['second', 'first'] }));
  });

  it('orders accented and canonically composed names by code units without locale collation', () => {
    expect(canonicalJson({ 'é': 1, 'e\u0301': 2, z: 3 })).toBe('{"é":2,"z":3,"é":1}');
  });
});

describe('fingerprintPlan', () => {
  it('ignores every presentation timestamp and timestamp-derived identifier', () => {
    const first = structuredClone(sampleVerificationPlan);
    const second = structuredClone(sampleVerificationPlan);
    second.generatedAt = '2026-08-19T03:04:05.000Z';
    second.planId = 'pvp-bbbbbbbbbbbbbbbb';
    second.fingerprint = 'b'.repeat(64);
    second.planningReport.generatedAt = '2026-08-19T03:04:05.000Z';
    second.planningReport.runId = 'pvc-20260819030405000';
    second.planningReport.manifest.generatedAt = '2026-08-19T03:04:05.000Z';

    expect(fingerprintPlan(second)).toBe(fingerprintPlan(first));
  });

  it.each([
    ['command order', (plan: typeof sampleVerificationPlan) => plan.commands.reverse()],
    ['script text', (plan: typeof sampleVerificationPlan) => { plan.commands[0]!.source.declaration = 'different'; }],
    ['timeout', (plan: typeof sampleVerificationPlan) => { plan.commands[0]!.timeoutSeconds = 601; }],
    ['exclusion', (plan: typeof sampleVerificationPlan) => { plan.excludedCommands = []; }],
    ['category assessment', (plan: typeof sampleVerificationPlan) => { plan.categoryAssessments[0]!.reason = 'Changed evidence.'; }],
    ['input bytes', (plan: typeof sampleVerificationPlan) => { plan.inputDigests[0]!.sha256 = '8'.repeat(64); }],
    ['skill sidecar bytes', (plan: typeof sampleVerificationPlan) => { plan.skillDigests[0]!.sha256 = '9'.repeat(64); }],
    ['project root', (plan: typeof sampleVerificationPlan) => { plan.projectRoot = '/different/project'; }],
    ['execution policy', (plan: typeof sampleVerificationPlan) => {
      (plan.executionPolicy as { outputLimitBytes: number }).outputLimitBytes = 1;
    }],
  ])('changes when %s changes', (_label, mutate) => {
    const changed = structuredClone(sampleVerificationPlan);
    mutate(changed);

    expect(fingerprintPlan(changed)).not.toBe(fingerprintPlan(sampleVerificationPlan));
  });
});
