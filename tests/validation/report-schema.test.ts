import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as reportSchemaModule from '../../src/validation/report-schema.js';
import { derivePartial, summarizeReport } from '../../src/model/report.js';
import { sampleReadinessReport } from '../fixtures/sample-readiness-report.js';

const { validateReadinessReport } = reportSchemaModule;

describe('validateReadinessReport', () => {
  it('accepts the computed canonical report fixture', async () => {
    expect(await validateReadinessReport(sampleReadinessReport)).toEqual({ ok: true });
  });

  it('rejects a report whose partial flag disagrees with its execution and coverage state', async () => {
    const input = structuredClone(sampleReadinessReport);
    input.partial = false;

    const result = await validateReadinessReport(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid report');
    expect(result.errors).toContain('/partial must match check execution and coverage state');
  });

  it('rejects a report whose computed summary or finding provenance is incomplete', async () => {
    const input = structuredClone(sampleReadinessReport) as unknown as Record<string, unknown>;
    const findings = Reflect.get(input, 'findings') as Array<Record<string, unknown>>;
    Reflect.deleteProperty(findings[0] ?? {}, 'checkVersion');
    const summary = Reflect.get(input, 'summary') as Record<string, unknown>;
    Reflect.set(summary, 'byCheckStatus', { completed: 99, unavailable: 0, failed: 0, unverified: 0 });

    const result = await validateReadinessReport(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid report');
    expect(result.errors.join('\n')).toContain('/findings/0');
    expect(result.errors.join('\n')).toContain("must have required property 'checkVersion'");
  });

  it('rejects finding provenance that disagrees with its recorded check execution', async () => {
    const input = structuredClone(sampleReadinessReport);
    const finding = input.findings[0];
    if (!finding) throw new Error('expected sample finding');
    finding.checkVersion = '9.9.9';
    finding.skillVersion = '8.8.8';

    const result = await validateReadinessReport(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid report');
    expect(result.errors).toContain('/findings/secret-exposure.fixture-secret/checkVersion must match its check execution');
    expect(result.errors).toContain('/findings/secret-exposure.fixture-secret/skillVersion must match its check execution');
  });

  it('rejects a finding that has no matching check-execution record', async () => {
    const input = structuredClone(sampleReadinessReport);
    input.checkExecutions = input.checkExecutions.filter(({ checkId }) => checkId !== 'secret-exposure.scan');
    input.coverageGaps.push({
      id: 'domain.security-privacy',
      status: 'unverified',
      domains: ['security-privacy'],
      reason: 'No routed check covers this domain in the current review.',
    });
    input.summary = summarizeReport(input.findings, input.checkExecutions, input.coverageGaps);
    input.partial = derivePartial(input.checkExecutions, input.coverageGaps);

    const result = await validateReadinessReport(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid report');
    expect(result.errors).toContain('/findings/secret-exposure.fixture-secret must reference a check execution');
  });

  it('selects one package-local versioned schema path for source and compiled layouts', () => {
    const resolver: unknown = Reflect.get(reportSchemaModule, 'resolveReportSchemaPath');
    expect(typeof resolver).toBe('function');
    if (typeof resolver !== 'function') return;

    const packageRoot = join('/opt', 'postvibe');
    const expected = join(packageRoot, 'schemas', 'report-0.1.schema.json');
    const resolveSchema = resolver as (moduleUrl: URL) => string;

    expect(resolveSchema(pathToFileURL(join(packageRoot, 'src', 'validation', 'report-schema.ts')))).toBe(expected);
    expect(resolveSchema(pathToFileURL(join(packageRoot, 'dist', 'src', 'validation', 'report-schema.js')))).toBe(expected);
  });
});
