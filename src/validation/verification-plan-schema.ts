import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 as Ajv2020Constructor } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import type {
  CommandCategory,
  InputDigest,
  VerificationPlan,
} from '../model/verification.js';
import { compareOrdinal } from '../ordinal.js';
import type { ValidationResult } from './readiness-schema.js';
import { fingerprintPlan } from '../verification/plan-fingerprint.js';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js') as typeof Ajv2020Constructor;
const addFormats = require('ajv-formats') as FormatsPlugin;
const commandCategories: CommandCategory[] = ['build', 'test', 'type-check', 'lint'];

interface SchemaLocation {
  packageRoot: string;
  schemaPath: string;
  reportSchemaPath: string;
}

function schemaLocationForModule(moduleUrl: URL): SchemaLocation {
  const modulePath = fileURLToPath(moduleUrl);
  const extension = extname(modulePath);
  const moduleDirectory = dirname(modulePath);
  let packageRoot: string;
  let expectedModulePath: string;

  if (extension === '.ts') {
    packageRoot = resolve(moduleDirectory, '..', '..');
    expectedModulePath = join(packageRoot, 'src', 'validation', 'verification-plan-schema.ts');
  } else if (extension === '.js') {
    packageRoot = resolve(moduleDirectory, '..', '..', '..');
    expectedModulePath = join(packageRoot, 'dist', 'src', 'validation', 'verification-plan-schema.js');
  } else {
    throw new Error('Cannot resolve the verification plan schema from an unrecognized module layout.');
  }

  if (resolve(modulePath) !== expectedModulePath) {
    throw new Error('Cannot resolve the verification plan schema from an unrecognized module layout.');
  }

  return {
    packageRoot,
    schemaPath: containedSchemaPath(packageRoot, 'verification-plan-0.1.schema.json'),
    reportSchemaPath: containedSchemaPath(packageRoot, 'report-0.1.schema.json'),
  };
}

function containedSchemaPath(packageRoot: string, filename: string): string {
  const schemaPath = join(packageRoot, 'schemas', filename);
  const packageRelativePath = relative(packageRoot, schemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Verification plan schema paths must remain inside the package root.');
  }
  return schemaPath;
}

export function resolveVerificationPlanSchemaPath(moduleUrl: URL): string {
  return schemaLocationForModule(moduleUrl).schemaPath;
}

const schemaLocation = schemaLocationForModule(new URL(import.meta.url));

export async function validateVerificationPlan(input: unknown): Promise<ValidationResult> {
  const [schemaText, reportSchemaText] = await Promise.all([
    readContainedSchema(schemaLocation.schemaPath),
    readContainedSchema(schemaLocation.reportSchemaPath),
  ]);
  const schema = JSON.parse(schemaText) as object;
  const reportSchema = JSON.parse(reportSchemaText) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(reportSchema);
  const validate = ajv.compile(schema);
  if (!validate(input)) {
    return {
      ok: false,
      errors: (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`),
    };
  }

  const errors = validateSemantics(input as VerificationPlan);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateSemantics(plan: VerificationPlan): string[] {
  const errors: string[] = [];
  if (plan.fingerprint !== fingerprintPlan(plan)) {
    errors.push('/fingerprint must match the canonical plan payload');
  }
  if (plan.planId !== `pvp-${plan.fingerprint.slice(0, 16)}`) {
    errors.push('/planId must equal pvp-${fingerprint.slice(0, 16)}');
  }

  const commandIds = new Set<string>();
  for (const command of [...plan.commands, ...plan.excludedCommands]) {
    if (commandIds.has(command.id)) errors.push(`/commands duplicate id ${command.id}`);
    commandIds.add(command.id);
    const sourceDigest = createHash('sha256').update(command.source.declaration, 'utf8').digest('hex');
    if (command.source.sha256 !== sourceDigest) {
      errors.push(`/commands/${command.id}/source/sha256 must hash the exact declaration`);
    }
    if (command.source.kind === 'package-script') {
      const launcher = command.launcher;
      if (launcher !== undefined && command.argv[0] !== launcher.executable) {
        errors.push(`/commands/${command.id}/argv executable must match the approved launcher`);
      }
      if (launcher?.kind === 'node-package-bin') {
        if (launcher.entrypoint === undefined || launcher.packageManifest === undefined) {
          errors.push(`/commands/${command.id}/launcher node-package-bin requires entrypoint and package manifest evidence`);
        }
      } else if (launcher?.entrypoint !== undefined || launcher?.packageManifest !== undefined) {
        errors.push(`/commands/${command.id}/launcher evidence is only valid for a node-package-bin`);
      }
    }
  }

  validateDigestArray('/inputDigests', plan.inputDigests, errors);
  validateDigestArray('/skillDigests', plan.skillDigests, errors);

  for (const command of plan.excludedCommands) {
    if (!plan.coverageGaps.some(({ id }) => id === `command.${command.id}`)) {
      errors.push(`/excludedCommands/${command.id} must have a matching coverage gap`);
    }
  }

  const assessments = plan.categoryAssessments.map(({ category }) => category);
  if (
    assessments.length !== commandCategories.length
    || commandCategories.some((category) => assessments.filter((value) => value === category).length !== 1)
  ) {
    errors.push('/categoryAssessments must contain each command category exactly once');
  }

  return errors;
}

function validateDigestArray(path: string, digests: InputDigest[], errors: string[]): void {
  const locations = new Set<string>();
  for (const digest of digests) {
    if (locations.has(digest.location)) errors.push(`${path} duplicate location ${digest.location}`);
    locations.add(digest.location);
  }
  if (!isSorted(digests.map(({ location }) => location))) {
    errors.push(`${path} must be sorted by location`);
  }
}

function isSorted(values: string[]): boolean {
  return values.every((value, index) => index === 0 || compareOrdinal(values[index - 1]!, value) <= 0);
}

async function readContainedSchema(schemaPath: string): Promise<string> {
  const [realPackageRoot, realSchemaPath] = await Promise.all([
    realpath(schemaLocation.packageRoot),
    realpath(schemaPath),
  ]);
  const packageRelativePath = relative(realPackageRoot, realSchemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Verification plan schema paths must remain inside the package root.');
  }
  return readFile(realSchemaPath, 'utf8');
}
