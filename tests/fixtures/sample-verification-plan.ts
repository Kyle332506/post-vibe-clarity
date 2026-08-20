import type { VerificationPlan } from '../../src/model/verification.js';
import { sampleReadinessReport } from './sample-readiness-report.js';

const sourceHash = '1'.repeat(64);

export const sampleVerificationPlan: VerificationPlan = {
  schemaId: 'postvibe-verification-plan/0.1',
  schemaVersion: '0.1',
  planId: 'pvp-1bdac9c1237a2aad',
  fingerprint: '1bdac9c1237a2aad29818e6604eabcbc962c6113ed7d398d217ffa82d2804570',
  toolkitVersion: '0.2.0',
  generatedAt: '2026-08-18T12:00:00.000Z',
  projectRoot: '/example/project',
  skillsRoot: '/example/skills',
  planningReport: structuredClone(sampleReadinessReport),
  inputDigests: [
    { location: 'package.json', sha256: '2'.repeat(64) },
    { location: 'src/index.ts', sha256: '3'.repeat(64) },
  ],
  skillDigests: [
    { location: 'universal-verification/readiness.yaml', sha256: '5'.repeat(64) },
    { location: 'universal-verification/SKILL.md', sha256: '4'.repeat(64) },
  ],
  commands: [
    {
      id: 'package-script:build',
      category: 'build',
      argv: ['pnpm', 'run', 'build'],
      cwd: '.',
      timeoutSeconds: 600,
      requiredAccess: ['local-command'],
      source: {
        kind: 'package-script',
        location: 'package.json#scripts.build',
        declaration: 'tsc -p tsconfig.json',
        sha256: sourceHash,
      },
    },
    {
      id: 'package-script:test',
      category: 'test',
      argv: ['pnpm', 'run', 'test'],
      cwd: '.',
      timeoutSeconds: 600,
      requiredAccess: ['local-command'],
      source: {
        kind: 'package-script',
        location: 'package.json#scripts.test',
        declaration: 'vitest run',
        sha256: '6'.repeat(64),
      },
    },
  ],
  excludedCommands: [
    {
      id: 'package-script:lint',
      category: 'lint',
      argv: ['pnpm', 'run', 'lint'],
      cwd: '.',
      timeoutSeconds: 600,
      requiredAccess: ['local-command'],
      source: {
        kind: 'package-script',
        location: 'package.json#scripts.lint',
        declaration: 'eslint .',
        sha256: '7'.repeat(64),
      },
    },
  ],
  categoryAssessments: [
    { category: 'build', state: 'applicable', reason: 'A build script is declared.' },
    { category: 'test', state: 'applicable', reason: 'A test script is declared.' },
    { category: 'type-check', state: 'unverified', reason: 'No type-check command is declared.' },
    { category: 'lint', state: 'applicable', reason: 'A lint script is declared but excluded.' },
  ],
  coverageGaps: [
    {
      id: 'category.type-check',
      category: 'type-check',
      reason: 'No declared type-check command was discovered.',
    },
    {
      id: 'command.package-script:lint',
      category: 'lint',
      reason: 'The declared lint command was excluded from this plan.',
      workspace: '.',
    },
  ],
  executionPolicy: {
    environmentPolicyVersion: 'env-filter/0.1',
    outputLimitBytes: 262144,
    executor: 'local-process/0.1',
  },
  containmentWarning: 'Commands run as local processes with the current user privileges; this is not a security sandbox.',
  disclaimer: 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.',
};
