import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as reportSchemaModule from '../../src/validation/report-v02-schema.js';
import {
  sampleExecutionRecordPath,
  sampleVerifiedReadinessReport,
} from '../fixtures/sample-verified-report.js';
import { sampleVerificationExecution } from '../fixtures/sample-verification-execution.js';
import { sampleVerificationPlan } from '../fixtures/sample-verification-plan.js';

const { validateVerifiedReadinessReport } = reportSchemaModule;

async function invalidErrors(input: unknown): Promise<string[]> {
  const result = await validateVerifiedReadinessReport(
    input,
    sampleVerificationPlan,
    sampleVerificationExecution,
    sampleExecutionRecordPath,
  );
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected invalid verified report');
  return result.errors;
}

describe('validateVerifiedReadinessReport', () => {
  it('accepts the canonical complete report 0.2 fixture', async () => {
    const report = await sampleVerifiedReadinessReport();

    expect(await validateVerifiedReadinessReport(
      report,
      sampleVerificationPlan,
      sampleVerificationExecution,
      sampleExecutionRecordPath,
    )).toEqual({ ok: true });
  });

  it('retains strict report 0.1 fields while requiring a complete verification link', async () => {
    const report = await sampleVerifiedReadinessReport() as unknown as Record<string, unknown>;
    Reflect.set(report, 'verdict', 'launch');
    Reflect.deleteProperty(report, 'manifest');
    const verification = Reflect.get(report, 'verification') as Record<string, unknown>;
    Reflect.deleteProperty(verification, 'executionRecordPath');

    const errors = await invalidErrors(report);

    expect(errors.join('\n')).toContain('additional properties');
    expect(errors.join('\n')).toContain("must have required property 'manifest'");
    expect(errors.join('\n')).toContain("must have required property 'executionRecordPath'");
  });

  it('rejects report, plan, execution, and record-path linkage mismatches', async () => {
    const report = await sampleVerifiedReadinessReport();
    report.verification.planFingerprint = 'b'.repeat(64);
    report.verification.executionId = 'pve-other';
    report.verification.executionRecordPath = '.postvibe/other.json';

    const errors = await invalidErrors(report);

    expect(errors).toEqual(expect.arrayContaining([
      '/verification/planFingerprint must match the verification plan fingerprint',
      '/verification/executionId must match the verification execution',
      '/verification/executionRecordPath must match the supplied execution-record path',
    ]));
  });

  it('rejects a blank execution-record path', async () => {
    const report = await sampleVerifiedReadinessReport();
    report.verification.executionRecordPath = '   ';

    expect(await invalidErrors(report)).toContain('/verification/executionRecordPath must not be blank');
  });

  it('rejects a wrong summary, partial state, and duplicate findings', async () => {
    const report = await sampleVerifiedReadinessReport();
    report.summary.byOutcome.passed = 99;
    report.partial = false;
    report.findings.push(structuredClone(report.findings[0]!));

    const errors = await invalidErrors(report);

    expect(errors).toEqual(expect.arrayContaining([
      '/summary must match findings, check executions, and coverage gaps',
      '/partial must match check execution and coverage state',
    ]));
    expect(errors.some((error) => error.includes('/findings duplicate id'))).toBe(true);
  });

  it('rejects numeric readiness scores and unredacted controlled credential values', async () => {
    const report = await sampleVerifiedReadinessReport() as unknown as Record<string, unknown>;
    const summary = Reflect.get(report, 'summary') as Record<string, unknown>;
    Reflect.set(summary, 'readinessScore', 90);
    const findings = Reflect.get(report, 'findings') as Array<Record<string, unknown>>;
    Reflect.set(findings[0]!, 'recommendation', 'Set APP_TOKEN=pvc-controlled-report-secret');

    const errors = await invalidErrors(report);

    expect(errors.join('\n')).toContain('additional properties');
    expect(errors).toContain('/ must not contain unredacted credential values');
  });

  it('rejects command evidence that no longer matches the linked plan and execution', async () => {
    const report = await sampleVerifiedReadinessReport();
    report.findings = report.findings.filter(
      ({ id }) => id !== 'universal-verification.commands.package-script:build',
    );
    const verificationCheck = report.checkExecutions.find(
      ({ checkId }) => checkId === 'universal-verification.commands',
    );
    if (!verificationCheck) throw new Error('expected verification check');
    verificationCheck.findingIds = verificationCheck.findingIds.filter(
      (id) => id !== 'universal-verification.commands.package-script:build',
    );

    expect((await invalidErrors(report)).join('\n')).toContain(
      '/findings verification evidence must match the supplied plan and execution',
    );
  });

  it('selects one package-local versioned schema path for source and compiled layouts', () => {
    const packageRoot = join('/opt', 'postvibe');
    const expected = join(packageRoot, 'schemas', 'report-0.2.schema.json');

    expect(reportSchemaModule.resolveVerifiedReportSchemaPath(
      pathToFileURL(join(packageRoot, 'src', 'validation', 'report-v02-schema.ts')),
    )).toBe(expected);
    expect(reportSchemaModule.resolveVerifiedReportSchemaPath(
      pathToFileURL(join(packageRoot, 'dist', 'src', 'validation', 'report-v02-schema.js')),
    )).toBe(expected);
  });
});
