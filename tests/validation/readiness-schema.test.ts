import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import * as readinessSchemaModule from '../../src/validation/readiness-schema.js';

const { validateReadinessManifest } = readinessSchemaModule;

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

  it('selects one package-local schema path for source and compiled module layouts', () => {
    const resolver: unknown = Reflect.get(readinessSchemaModule, 'resolveReadinessSchemaPath');
    expect(typeof resolver).toBe('function');
    if (typeof resolver !== 'function') return;

    const packageRoot = join('/opt', 'postvibe');
    const expected = join(packageRoot, 'schemas', 'readiness.schema.json');
    const resolveSchema = resolver as (moduleUrl: URL) => string;

    expect(resolveSchema(pathToFileURL(join(packageRoot, 'src', 'validation', 'readiness-schema.ts')))).toBe(expected);
    expect(resolveSchema(pathToFileURL(join(packageRoot, 'dist', 'src', 'validation', 'readiness-schema.js')))).toBe(expected);
  });

  it('fails closed for an unrecognized module layout instead of probing outside the package', () => {
    const resolver: unknown = Reflect.get(readinessSchemaModule, 'resolveReadinessSchemaPath');
    expect(typeof resolver).toBe('function');
    if (typeof resolver !== 'function') return;

    const resolveSchema = resolver as (moduleUrl: URL) => string;
    expect(() => resolveSchema(pathToFileURL('/opt/postvibe/build/readiness-schema.js'))).toThrow(
      'Cannot resolve the readiness schema from an unrecognized module layout.',
    );
  });
});
