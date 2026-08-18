import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { expectNoEmoji, readRepositoryFile } from './repository-docs.js';

const issueForms = ['bug-report', 'agent-compatibility', 'new-check-proposal'] as const;

describe('GitHub repository metadata', () => {
  it.each(issueForms)('%s issue form is structured and emoji-free', async (name) => {
    const path = `.github/ISSUE_TEMPLATE/${name}.yml`;
    const source = await readRepositoryFile(path);
    const form = parse(source) as { name?: string; description?: string; body?: unknown[] };
    expect(form.name).toEqual(expect.any(String));
    expect(form.description).toEqual(expect.any(String));
    expect(form.body?.length).toBeGreaterThan(2);
    expectNoEmoji(source, path);
  });

  it('runs the full read-only foundation gate with least privilege', async () => {
    const source = await readRepositoryFile('.github/workflows/ci.yml');
    const workflow = parse(source) as Record<string, unknown>;
    expect(workflow).toBeTypeOf('object');
    expect(source).toContain('permissions:\n  contents: read');
    expect(source).toContain('actions/checkout@v6');
    expect(source).toContain('actions/setup-node@v6');
    expect(source).toContain('pnpm/action-setup@v4');
    expect(source).toContain('node-version: 24');
    expect(source).toContain('pnpm install --frozen-lockfile');
    expect(source).toContain('pnpm verify:foundation');
  });

  it('keeps protection and CI status-check names aligned', async () => {
    const protection = JSON.parse(await readRepositoryFile('.github/branch-protection.json')) as {
      required_status_checks: { contexts: string[] };
      allow_force_pushes: boolean;
      allow_deletions: boolean;
    };
    expect(protection.required_status_checks.contexts).toEqual(['verify']);
    expect(protection.allow_force_pushes).toBe(false);
    expect(protection.allow_deletions).toBe(false);
  });
});
