import { createHash } from 'node:crypto';
import type { VerificationPlan } from '../../src/model/verification.js';
import { fingerprintPlan } from '../../src/verification/plan-fingerprint.js';
import { sampleReadinessReport } from './sample-readiness-report.js';

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const containmentWarning = 'Commands run as local processes with the current user privileges; this is not a security sandbox and does not block network or out-of-project filesystem access.';

const plan: VerificationPlan = {
  schemaId: 'postvibe-verification-plan/0.1',
  schemaVersion: '0.1',
  planId: 'pvp-0000000000000000',
  fingerprint: '0'.repeat(64),
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
    { location: 'universal-verification/SKILL.md', sha256: '4'.repeat(64) },
    { location: 'universal-verification/readiness.yaml', sha256: '5'.repeat(64) },
  ],
  commands: [
    {
      id: 'package-script:build',
      category: 'build',
      argv: ['/example/node', '/example/project/build.mjs'],
      cwd: '.',
      timeoutSeconds: 600,
      requiredAccess: ['local-command'],
      source: {
        kind: 'package-script',
        location: 'package.json#scripts.build',
        declaration: 'node build.mjs',
        sha256: sha256('node build.mjs'),
      },
      launcher: {
        policyVersion: 'package-script-launcher/0.1',
        kind: 'node-runtime',
        executable: '/example/node',
        sha256: '8'.repeat(64),
        entrypointArgvIndex: 1,
        entrypoint: { location: 'build.mjs', sha256: '9'.repeat(64) },
      },
    },
    {
      id: 'package-script:test',
      category: 'test',
      argv: ['/example/node', '/example/project/test.mjs'],
      cwd: '.',
      timeoutSeconds: 600,
      requiredAccess: ['local-command'],
      source: {
        kind: 'package-script',
        location: 'package.json#scripts.test',
        declaration: 'node test.mjs',
        sha256: sha256('node test.mjs'),
      },
      launcher: {
        policyVersion: 'package-script-launcher/0.1',
        kind: 'node-runtime',
        executable: '/example/node',
        sha256: '8'.repeat(64),
        entrypointArgvIndex: 1,
        entrypoint: { location: 'test.mjs', sha256: 'a'.repeat(64) },
      },
    },
  ],
  excludedCommands: [
    {
      id: 'package-script:lint',
      category: 'lint',
      argv: ['/example/node', '/example/project/lint.mjs'],
      cwd: '.',
      timeoutSeconds: 600,
      requiredAccess: ['local-command'],
      source: {
        kind: 'package-script',
        location: 'package.json#scripts.lint',
        declaration: 'node lint.mjs',
        sha256: sha256('node lint.mjs'),
      },
      launcher: {
        policyVersion: 'package-script-launcher/0.1',
        kind: 'node-runtime',
        executable: '/example/node',
        sha256: '8'.repeat(64),
        entrypointArgvIndex: 1,
        entrypoint: { location: 'lint.mjs', sha256: 'b'.repeat(64) },
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
  containmentWarning,
  disclaimer: 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.',
};

plan.fingerprint = fingerprintPlan(plan);
plan.planId = `pvp-${plan.fingerprint.slice(0, 16)}`;

export const sampleVerificationPlan = plan;
