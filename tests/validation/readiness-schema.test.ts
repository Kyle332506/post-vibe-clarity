import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateReadinessManifest } from '../../src/validation/readiness-schema.js';

async function loadFixture(name: string): Promise<unknown> {
  const url = new URL(`../fixtures/manifests/${name}`, import.meta.url);
  return parse(await readFile(url, 'utf8')) as unknown;
}

describe('validateReadinessManifest', () => {
  it('accepts a valid PostVibeClarity sidecar', async () => {
    const result = await validateReadinessManifest(await loadFixture('valid.yaml'));
    expect(result).toEqual({ ok: true });
  });

  it('returns useful paths for invalid sidecar fields', async () => {
    const result = await validateReadinessManifest(await loadFixture('invalid.yaml'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid manifest');
    expect(result.errors.join('\n')).toContain('/id');
    expect(result.errors.join('\n')).toContain('/domains/0');
    expect(result.errors.join('\n')).toContain('/maxActionLevel');
  });
});
