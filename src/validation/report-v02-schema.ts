import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Ajv2020 as Ajv2020Constructor } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import type { ReadinessReport } from '../model/report.js';
import type { VerifiedReadinessReport } from '../model/verified-report.js';
import type { VerificationExecution, VerificationPlan } from '../model/verification.js';
import { containsMarkdownLineOrControl } from '../report/markdown-safety.js';
import { redactCommandOutput } from '../verification/redact-command-output.js';
import { mapVerificationEvidence } from '../verification/map-verification-findings.js';
import type { ValidationResult } from './readiness-schema.js';
import { validateReadinessReport } from './report-schema.js';
import {
  validateExecutionAgainstPlan,
  validateVerificationExecution,
} from './verification-execution-schema.js';
import { validateVerificationPlan } from './verification-plan-schema.js';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js') as typeof Ajv2020Constructor;
const addFormats = require('ajv-formats') as FormatsPlugin;
const verificationCheckId = 'universal-verification.commands';

interface SchemaLocation {
  packageRoot: string;
  schemaPath: string;
  reportV01SchemaPath: string;
  executionSchemaPath: string;
}

function schemaLocationForModule(moduleUrl: URL): SchemaLocation {
  const modulePath = fileURLToPath(moduleUrl);
  const extension = extname(modulePath);
  const moduleDirectory = dirname(modulePath);
  let packageRoot: string;
  let expectedModulePath: string;

  if (extension === '.ts') {
    packageRoot = resolve(moduleDirectory, '..', '..');
    expectedModulePath = join(packageRoot, 'src', 'validation', 'report-v02-schema.ts');
  } else if (extension === '.js') {
    packageRoot = resolve(moduleDirectory, '..', '..', '..');
    expectedModulePath = join(packageRoot, 'dist', 'src', 'validation', 'report-v02-schema.js');
  } else {
    throw new Error('Cannot resolve the verified report schema from an unrecognized module layout.');
  }
  if (resolve(modulePath) !== expectedModulePath) {
    throw new Error('Cannot resolve the verified report schema from an unrecognized module layout.');
  }
  return {
    packageRoot,
    schemaPath: containedSchemaPath(packageRoot, 'report-0.2.schema.json'),
    reportV01SchemaPath: containedSchemaPath(packageRoot, 'report-0.1.schema.json'),
    executionSchemaPath: containedSchemaPath(packageRoot, 'verification-execution-0.1.schema.json'),
  };
}

function containedSchemaPath(packageRoot: string, filename: string): string {
  const schemaPath = join(packageRoot, 'schemas', filename);
  const packageRelativePath = relative(packageRoot, schemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Verified report schema paths must remain inside the package root.');
  }
  return schemaPath;
}

export function resolveVerifiedReportSchemaPath(moduleUrl: URL): string {
  return schemaLocationForModule(moduleUrl).schemaPath;
}

const schemaLocation = schemaLocationForModule(new URL(import.meta.url));

function asReadinessReport(report: VerifiedReadinessReport): ReadinessReport {
  const base = structuredClone(report) as unknown as Record<string, unknown>;
  Reflect.set(base, 'schemaVersion', '0.1');
  Reflect.deleteProperty(base, 'verification');
  return base as unknown as ReadinessReport;
}

function linkageErrors(
  report: VerifiedReadinessReport,
  plan: VerificationPlan,
  execution: VerificationExecution,
  executionRecordPath: string,
): string[] {
  const errors: string[] = [];
  if (report.verification.planId !== plan.planId) {
    errors.push('/verification/planId must match the verification plan');
  }
  if (report.verification.planFingerprint !== plan.fingerprint) {
    errors.push('/verification/planFingerprint must match the verification plan fingerprint');
  }
  if (report.verification.executionId !== execution.executionId) {
    errors.push('/verification/executionId must match the verification execution');
  }
  if (report.verification.executionRecordPath !== executionRecordPath) {
    errors.push('/verification/executionRecordPath must match the supplied execution-record path');
  }
  if (!isDeepStrictEqual(report.verification.observationBoundary, execution.observationBoundary)) {
    errors.push('/verification/observationBoundary must match the verification execution');
  }
  if (!isDeepStrictEqual(report.verification.approvalBoundary, execution.approvalBoundary)) {
    errors.push('/verification/approvalBoundary must match the verification execution');
  }
  if (report.verification.executionRecordPath.trim().length === 0) {
    errors.push('/verification/executionRecordPath must not be blank');
  }
  if (containsMarkdownLineOrControl(report.verification.executionRecordPath)) {
    errors.push('/verification/executionRecordPath must not contain control characters');
  }
  if (report.manifest.projectRoot !== plan.projectRoot || report.manifest.projectRoot !== execution.projectRoot) {
    errors.push('/manifest/projectRoot must match the verification plan and execution');
  }
  if (report.disclaimer !== plan.disclaimer || report.disclaimer !== execution.disclaimer) {
    errors.push('/disclaimer must match the verification plan and execution');
  }
  errors.push(...validateExecutionAgainstPlan(execution, plan).map((error) => `/execution${error}`));
  return errors;
}

function expectedPathErrors(executionRecordPath: unknown): string[] {
  if (typeof executionRecordPath !== 'string') return ['/expectedExecutionRecordPath is required'];
  if (executionRecordPath.trim().length === 0) return ['/expectedExecutionRecordPath must not be blank'];
  if (containsMarkdownLineOrControl(executionRecordPath)) {
    return ['/expectedExecutionRecordPath must not contain control characters'];
  }
  return [];
}

function inputPathErrors(input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return [];
  const verification: unknown = Reflect.get(input, 'verification');
  if (typeof verification !== 'object' || verification === null) return [];
  const path: unknown = Reflect.get(verification, 'executionRecordPath');
  if (typeof path === 'string' && containsMarkdownLineOrControl(path)) {
    return ['/verification/executionRecordPath must not contain control characters'];
  }
  return [];
}

function evidenceErrors(
  report: VerifiedReadinessReport,
  plan: VerificationPlan,
  execution: VerificationExecution,
): string[] {
  let expected;
  try {
    expected = mapVerificationEvidence(plan, execution);
  } catch (error) {
    return [`/verification could not map supplied evidence: ${(error as Error).message}`];
  }
  const actualFindings = report.findings.filter(({ checkId }) => checkId === verificationCheckId);
  const actualChecks = report.checkExecutions.filter(({ checkId }) => checkId === verificationCheckId);
  const actualGaps = report.coverageGaps.filter(({ checkId }) => checkId === verificationCheckId);
  const errors: string[] = [];
  if (!isDeepStrictEqual(actualFindings, expected.findings)) {
    errors.push('/findings verification evidence must match the supplied plan and execution');
  }
  if (!isDeepStrictEqual(actualChecks, [expected.checkExecution])) {
    errors.push('/checkExecutions verification evidence must match the supplied plan and execution');
  }
  if (!isDeepStrictEqual(actualGaps, expected.coverageGaps)) {
    errors.push('/coverageGaps verification evidence must match the supplied plan and execution');
  }
  return errors;
}

export async function validateVerifiedReadinessReport(
  input: unknown,
  plan: VerificationPlan,
  execution: VerificationExecution,
  executionRecordPath: string,
): Promise<ValidationResult> {
  const pathErrors = [
    ...expectedPathErrors(executionRecordPath),
    ...inputPathErrors(input),
  ];
  const [schemaText, reportV01SchemaText, executionSchemaText] = await Promise.all([
    readContainedSchema(schemaLocation.schemaPath),
    readContainedSchema(schemaLocation.reportV01SchemaPath),
    readContainedSchema(schemaLocation.executionSchemaPath),
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(reportV01SchemaText) as object);
  ajv.addSchema(JSON.parse(executionSchemaText) as object);
  const validate = ajv.compile(JSON.parse(schemaText) as object);
  if (!validate(input)) {
    const schemaErrors = (validate.errors ?? []).map(
      (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
    );
    schemaErrors.push(...pathErrors);
    const serialized = JSON.stringify(input);
    if (redactCommandOutput(serialized) !== serialized) {
      schemaErrors.push('/ must not contain unredacted credential values');
    }
    return { ok: false, errors: schemaErrors };
  }

  const report = input as VerifiedReadinessReport;
  const [baseValidation, planValidation, executionValidation] = await Promise.all([
    validateReadinessReport(asReadinessReport(report)),
    validateVerificationPlan(plan),
    validateVerificationExecution(execution),
  ]);
  const errors = [
    ...pathErrors,
    ...(baseValidation.ok ? [] : baseValidation.errors),
    ...(planValidation.ok ? [] : planValidation.errors.map((error) => `/plan${error}`)),
    ...(executionValidation.ok ? [] : executionValidation.errors.map((error) => `/execution${error}`)),
    ...linkageErrors(report, plan, execution, executionRecordPath),
    ...evidenceErrors(report, plan, execution),
  ];
  const serialized = JSON.stringify(report);
  if (redactCommandOutput(serialized) !== serialized) {
    errors.push('/ must not contain unredacted credential values');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

async function readContainedSchema(schemaPath: string): Promise<string> {
  const [realPackageRoot, realSchemaPath] = await Promise.all([
    realpath(schemaLocation.packageRoot),
    realpath(schemaPath),
  ]);
  const packageRelativePath = relative(realPackageRoot, realSchemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Verified report schema paths must remain inside the package root.');
  }
  return readFile(realSchemaPath, 'utf8');
}
