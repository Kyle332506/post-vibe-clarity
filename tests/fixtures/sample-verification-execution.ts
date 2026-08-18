import type { VerificationExecution } from '../../src/model/verification.js';
import { sampleVerificationPlan } from './sample-verification-plan.js';

export const sampleVerificationExecution: VerificationExecution = {
  schemaId: 'postvibe-verification-execution/0.1',
  schemaVersion: '0.1',
  executionId: 'pve-20260818',
  status: 'completed',
  planId: sampleVerificationPlan.planId,
  planFingerprint: sampleVerificationPlan.fingerprint,
  toolkitVersion: sampleVerificationPlan.toolkitVersion,
  projectRoot: sampleVerificationPlan.projectRoot,
  startedAt: '2026-08-18T12:01:00.000Z',
  completedAt: '2026-08-18T12:02:00.000Z',
  removedEnvironmentVariables: ['API_TOKEN', 'NODE_OPTIONS'],
  results: [
    {
      commandId: 'package-script:build',
      status: 'passed',
      startedAt: '2026-08-18T12:01:00.000Z',
      durationMs: 30000,
      exitCode: 0,
      signal: null,
      output: 'Build completed.\n',
      outputTruncated: false,
      fileChanges: [],
    },
    {
      commandId: 'package-script:test',
      status: 'passed',
      startedAt: '2026-08-18T12:01:30.000Z',
      durationMs: 30000,
      exitCode: 0,
      signal: null,
      output: 'Tests passed.\n',
      outputTruncated: false,
      fileChanges: [
        { path: 'coverage/index.html', kind: 'added' },
        { path: 'src/generated.ts', kind: 'modified' },
      ],
    },
  ],
  coverageGaps: structuredClone(sampleVerificationPlan.coverageGaps),
  containmentWarning: sampleVerificationPlan.containmentWarning,
  disclaimer: sampleVerificationPlan.disclaimer,
};
