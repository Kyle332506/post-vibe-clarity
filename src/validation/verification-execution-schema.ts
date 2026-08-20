import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Ajv2020 as Ajv2020Constructor } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import type {
  VerificationExecution,
  VerificationPlan,
} from '../model/verification.js';
import { compareOrdinal } from '../ordinal.js';
import {
  commandResultEvidenceErrors,
  exactCommandResultsMatchPlan,
} from '../verification/command-result-contract.js';
import {
  CONTAINMENT_WARNING,
  ORCHESTRATION_COVERAGE_GAP,
  VERIFICATION_DISCLAIMER,
} from '../verification/contract-constants.js';
import { redactCommandOutput } from '../verification/redact-command-output.js';
import { COMMAND_APPROVAL_BOUNDARY } from '../verification/command-approval-boundary.js';
import type { ValidationResult } from './readiness-schema.js';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js') as typeof Ajv2020Constructor;
const addFormats = require('ajv-formats') as FormatsPlugin;
const outputLimitBytes = 262_144;

interface SchemaLocation {
  packageRoot: string;
  schemaPath: string;
}

function schemaLocationForModule(moduleUrl: URL): SchemaLocation {
  const modulePath = fileURLToPath(moduleUrl);
  const extension = extname(modulePath);
  const moduleDirectory = dirname(modulePath);
  let packageRoot: string;
  let expectedModulePath: string;

  if (extension === '.ts') {
    packageRoot = resolve(moduleDirectory, '..', '..');
    expectedModulePath = join(packageRoot, 'src', 'validation', 'verification-execution-schema.ts');
  } else if (extension === '.js') {
    packageRoot = resolve(moduleDirectory, '..', '..', '..');
    expectedModulePath = join(packageRoot, 'dist', 'src', 'validation', 'verification-execution-schema.js');
  } else {
    throw new Error('Cannot resolve the verification execution schema from an unrecognized module layout.');
  }

  if (resolve(modulePath) !== expectedModulePath) {
    throw new Error('Cannot resolve the verification execution schema from an unrecognized module layout.');
  }

  const schemaPath = join(packageRoot, 'schemas', 'verification-execution-0.1.schema.json');
  const packageRelativePath = relative(packageRoot, schemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Verification execution schema path must remain inside the package root.');
  }
  return { packageRoot, schemaPath };
}

export function resolveVerificationExecutionSchemaPath(moduleUrl: URL): string {
  return schemaLocationForModule(moduleUrl).schemaPath;
}

const schemaLocation = schemaLocationForModule(new URL(import.meta.url));

export async function validateVerificationExecution(input: unknown): Promise<ValidationResult> {
  const schema = JSON.parse(await readSchema()) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(input)) {
    return {
      ok: false,
      errors: (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`),
    };
  }

  const errors = validateSemantics(input as VerificationExecution);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateExecutionAgainstPlan(
  execution: VerificationExecution,
  plan: VerificationPlan,
): string[] {
  const errors: string[] = [];
  if (execution.planId !== plan.planId) errors.push('/planId must match the verification plan');
  if (execution.planFingerprint !== plan.fingerprint) {
    errors.push('/planFingerprint must match the verification plan fingerprint');
  }
  if (execution.toolkitVersion !== plan.toolkitVersion) {
    errors.push('/toolkitVersion must match the verification plan');
  }
  if (execution.projectRoot !== plan.projectRoot) {
    errors.push('/projectRoot must match the verification plan');
  }
  if (execution.containmentWarning !== plan.containmentWarning
    || execution.containmentWarning !== CONTAINMENT_WARNING) {
    errors.push('/containmentWarning must match the exact verification policy and plan');
  }
  if (execution.disclaimer !== plan.disclaimer || execution.disclaimer !== VERIFICATION_DISCLAIMER) {
    errors.push('/disclaimer must match the exact verification policy and plan');
  }
  if (!isDeepStrictEqual(execution.approvalBoundary, plan.approvalBoundary)) {
    errors.push('/approvalBoundary must match the verification plan');
  }
  if (execution.observationBoundary.rootIdentity.realPath !== plan.projectRoot) {
    errors.push('/observationBoundary/rootIdentity/realPath must match the verification plan project root');
  }

  if (!exactCommandResultsMatchPlan(execution.results, plan.commands)) {
    errors.push('/results must match selected plan commands in exact order');
    const selectedIds = new Set(plan.commands.map(({ id }) => id));
    const resultIds = new Set(execution.results.map(({ commandId }) => commandId));
    for (const { commandId } of execution.results) {
      if (!selectedIds.has(commandId)) {
        errors.push(`/results/${commandId} must reference a selected plan command`);
      }
    }
    for (const { id } of plan.commands) {
      if (!resultIds.has(id)) errors.push(`/results must contain selected command ${id}`);
    }
  }
  const exactPlanGaps = isDeepStrictEqual(execution.coverageGaps, plan.coverageGaps);
  const exactPartialGaps = isDeepStrictEqual(
    execution.coverageGaps,
    [...plan.coverageGaps, ORCHESTRATION_COVERAGE_GAP],
  );
  if (!exactPlanGaps && !exactPartialGaps) {
    errors.push('/coverageGaps must exactly match plan coverage gaps or the allowed orchestration gap');
  }
  return errors;
}

function validateSemantics(execution: VerificationExecution): string[] {
  const errors: string[] = [];
  if (!isDeepStrictEqual(execution.approvalBoundary, COMMAND_APPROVAL_BOUNDARY)) {
    errors.push('/approvalBoundary must match the exact command approval policy');
  }
  if (Date.parse(execution.completedAt) < Date.parse(execution.startedAt)) {
    errors.push('/completedAt must be at or after /startedAt');
  }
  const resultIds = new Set<string>();
  for (const result of execution.results) {
    if (resultIds.has(result.commandId)) errors.push(`/results duplicate commandId ${result.commandId}`);
    resultIds.add(result.commandId);
    if (Buffer.byteLength(result.output, 'utf8') > outputLimitBytes) {
      errors.push(`/results/${result.commandId}/output must not exceed 262144 UTF-8 bytes`);
    }
    if (!isSorted(result.fileChanges.map(({ path }) => path))) {
      errors.push(`/results/${result.commandId}/fileChanges must be sorted by path`);
    }
    for (const error of commandResultEvidenceErrors(result)) {
      errors.push(`/results/${result.commandId} ${error}`);
    }
    if (redactCommandOutput(result.output) !== result.output
      || (result.unverifiedReason !== undefined
        && redactCommandOutput(result.unverifiedReason) !== result.unverifiedReason)) {
      errors.push(`/results/${result.commandId} must not contain unredacted credential values`);
    }
    if (result.startedAt !== undefined) {
      const commandStart = Date.parse(result.startedAt);
      if (commandStart < Date.parse(execution.startedAt) || commandStart > Date.parse(execution.completedAt)) {
        errors.push(`/results/${result.commandId}/startedAt must fall within the execution interval`);
      }
    }
  }

  if (!isSorted(execution.removedEnvironmentVariables)) {
    errors.push('/removedEnvironmentVariables must be sorted');
  }
  if (execution.status === 'completed') {
    for (const status of ['interrupted', 'unverified'] as const) {
      if (execution.results.some((result) => result.status === status)) {
        errors.push(`/status completed execution cannot contain ${status} results`);
      }
    }
    if (isDeepStrictEqual(
      execution.coverageGaps.at(-1),
      ORCHESTRATION_COVERAGE_GAP,
    )) errors.push('/status completed execution cannot contain the orchestration coverage gap');
  }
  const exclusions = execution.observationBoundary.exactArtifactExclusions;
  if (!isSorted(exclusions) || new Set(exclusions).size !== exclusions.length) {
    errors.push('/observationBoundary/exactArtifactExclusions must be unique and sorted');
  }
  return errors;
}

function isSorted(values: string[]): boolean {
  return values.every((value, index) => index === 0 || compareOrdinal(values[index - 1]!, value) <= 0);
}

async function readSchema(): Promise<string> {
  const [realPackageRoot, realSchemaPath] = await Promise.all([
    realpath(schemaLocation.packageRoot),
    realpath(schemaLocation.schemaPath),
  ]);
  const packageRelativePath = relative(realPackageRoot, realSchemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Verification execution schema path must remain inside the package root.');
  }
  return readFile(realSchemaPath, 'utf8');
}
