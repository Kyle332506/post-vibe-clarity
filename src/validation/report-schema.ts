import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Ajv2020 as Ajv2020Constructor } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import {
  derivePartial,
  readinessDomains,
  summarizeReport,
  type ReadinessReport,
} from '../model/report.js';
import { compareOrdinal } from '../ordinal.js';
import type { ValidationResult } from './readiness-schema.js';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js') as typeof Ajv2020Constructor;
const addFormats = require('ajv-formats') as FormatsPlugin;

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
    expectedModulePath = join(packageRoot, 'src', 'validation', 'report-schema.ts');
  } else if (extension === '.js') {
    packageRoot = resolve(moduleDirectory, '..', '..', '..');
    expectedModulePath = join(packageRoot, 'dist', 'src', 'validation', 'report-schema.js');
  } else {
    throw new Error('Cannot resolve the report schema from an unrecognized module layout.');
  }

  if (resolve(modulePath) !== expectedModulePath) {
    throw new Error('Cannot resolve the report schema from an unrecognized module layout.');
  }

  const schemaPath = join(packageRoot, 'schemas', 'report-0.1.schema.json');
  const packageRelativePath = relative(packageRoot, schemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Report schema path must remain inside the package root.');
  }
  return { packageRoot, schemaPath };
}

export function resolveReportSchemaPath(moduleUrl: URL): string {
  return schemaLocationForModule(moduleUrl).schemaPath;
}

const schemaLocation = schemaLocationForModule(new URL(import.meta.url));

export async function validateReadinessReport(input: unknown): Promise<ValidationResult> {
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

  const report = input as ReadinessReport;
  const errors = validateSemantics(report);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateSemantics(report: ReadinessReport): string[] {
  const errors: string[] = [];
  const expectedSummary = summarizeReport(report.findings, report.checkExecutions, report.coverageGaps);
  if (!isDeepStrictEqual(report.summary, expectedSummary)) {
    errors.push('/summary must match findings, check executions, and coverage gaps');
  }
  if (report.partial !== derivePartial(report.checkExecutions, report.coverageGaps)) {
    errors.push('/partial must match check execution and coverage state');
  }

  const findingIds = new Set<string>();
  for (const finding of report.findings) {
    if (findingIds.has(finding.id)) errors.push(`/findings duplicate id ${finding.id}`);
    findingIds.add(finding.id);
  }

  const executionIds = new Set<string>();
  for (const execution of report.checkExecutions) {
    if (executionIds.has(execution.checkId)) errors.push(`/checkExecutions duplicate checkId ${execution.checkId}`);
    executionIds.add(execution.checkId);
    const executionFindings = report.findings
      .filter(({ checkId }) => checkId === execution.checkId);
    const expectedFindingIds = executionFindings
      .map(({ id }) => id)
      .sort(compareOrdinal);
    if (!isDeepStrictEqual(execution.findingIds, expectedFindingIds)) {
      errors.push(`/checkExecutions/${execution.checkId}/findingIds must match report findings`);
    }
    for (const finding of executionFindings) {
      if (finding.checkVersion !== execution.checkVersion) {
        errors.push(`/findings/${finding.id}/checkVersion must match its check execution`);
      }
      if (finding.skillVersion !== execution.skillVersion) {
        errors.push(`/findings/${finding.id}/skillVersion must match its check execution`);
      }
    }
    const checkGap = report.coverageGaps.find(({ checkId }) => checkId === execution.checkId);
    if (execution.status === 'completed' && checkGap) {
      errors.push(`/coverageGaps must not report completed check ${execution.checkId}`);
    }
    if (execution.status !== 'completed' && checkGap?.status !== execution.status) {
      errors.push(`/coverageGaps must record ${execution.status} check ${execution.checkId}`);
    }
  }

  for (const finding of report.findings) {
    if (!executionIds.has(finding.checkId)) {
      errors.push(`/findings/${finding.id} must reference a check execution`);
    }
  }

  const routedDomains = new Set(report.checkExecutions.flatMap(({ domains }) => domains));
  for (const domain of readinessDomains) {
    const domainGap = report.coverageGaps.find((gap) => gap.checkId === undefined && gap.domains.includes(domain));
    if (!routedDomains.has(domain) && domainGap?.status !== 'unverified') {
      errors.push(`/coverageGaps must record uncovered domain ${domain}`);
    }
    if (routedDomains.has(domain) && domainGap) {
      errors.push(`/coverageGaps must not duplicate routed domain ${domain}`);
    }
  }

  return errors;
}

async function readSchema(): Promise<string> {
  const [realPackageRoot, realSchemaPath] = await Promise.all([
    realpath(schemaLocation.packageRoot),
    realpath(schemaLocation.schemaPath),
  ]);
  const packageRelativePath = relative(realPackageRoot, realSchemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Report schema path must remain inside the package root.');
  }
  return readFile(realSchemaPath, 'utf8');
}
