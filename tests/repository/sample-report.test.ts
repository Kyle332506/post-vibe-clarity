import { describe, expect, it } from 'vitest';
import { sampleControlledCredential, sampleReadinessReport } from '../fixtures/sample-readiness-report.js';
import { renderMarkdown } from '../../src/report/render-markdown.js';
import { validateReadinessReport } from '../../src/validation/report-schema.js';
import { expectNoEmoji, readRepositoryFile } from './repository-docs.js';

describe('sample report documentation', () => {
  it('is exactly the current renderer output for the typed sample report', async () => {
    const sample = await readRepositoryFile('docs/examples/sample-report.md');
    expect(await validateReadinessReport(sampleReadinessReport)).toEqual({ ok: true });
    expect(sample).toBe(renderMarkdown(sampleReadinessReport));
    expect(sample).not.toContain(sampleControlledCredential);
    expect(sample).toContain('Stop before launch');
    expect(sample).toContain('Unverified');
    expect(sample).toContain(sampleReadinessReport.disclaimer);
    expectNoEmoji(sample, 'docs/examples/sample-report.md');
  });
});
