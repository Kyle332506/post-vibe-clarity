import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 as Ajv2020Constructor } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import type {
  VerificationExecution,
  VerificationPlan,
} from '../model/verification.js';
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
  return errors;
}

function validateSemantics(execution: VerificationExecution): string[] {
  const errors: string[] = [];
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
  }
  return errors;
}

function isSorted(values: string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]!.localeCompare(value) <= 0);
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
