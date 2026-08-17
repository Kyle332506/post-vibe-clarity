import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { privacyNoticeCheck } from '../../src/checks/launch-essentials.js';
import { discoverProject } from '../../src/discovery/discover-project.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const now = () => '2026-08-17T12:00:00.000Z';
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('privacyNoticeCheck', () => {
  it('flags a missing notice when personal-data collection is likely', async () => {
    const root = fixture('web-missing-basics');
    const manifest = await discoverProject(root, now);
    const findings = await privacyNoticeCheck.run({ root, manifest });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.outcome).toBe('likely-issue');
    expect(findings[0]?.actionLevel).toBe('human-review-needed');
  });

  it('returns a not-applicable result for a local CLI without detected collection', async () => {
    const root = fixture('cli-clean');
    const manifest = await discoverProject(root, now);
    const findings = await privacyNoticeCheck.run({ root, manifest });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.outcome).toBe('not-applicable');
  });

  it('reports a policy candidate without claiming its legal accuracy was verified', async () => {
    const root = await mkdtemp(join(tmpdir(), 'postvibe-privacy-notice-'));
    temporaryRoots.push(root);
    await writeFile(join(root, 'register.ts'), 'export function register(email: string) { return email; }');
    await writeFile(join(root, 'privacy-notice.md'), '# Privacy notice');

    const manifest = await discoverProject(root, now);
    const findings = await privacyNoticeCheck.run({ root, manifest });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      outcome: 'passed',
      evidence: [{ kind: 'file', location: 'privacy-notice.md' }],
    });
    expect(findings[0]?.applicability).toContain('legal accuracy was not verified');
  });
});
