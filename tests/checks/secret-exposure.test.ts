import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { detectSecretRule, secretExposureCheck } from '../../src/checks/secret-exposure.js';
import { discoverProject } from '../../src/discovery/discover-project.js';

const root = fileURLToPath(new URL('../../fixtures/web-missing-basics', import.meta.url));
const temporaryRoots: string[] = [];
const now = () => '2026-08-17T12:00:00.000Z';

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function scanTemporarySource(source: string) {
  const directory = await mkdtemp(join(tmpdir(), 'postvibe-secret-exposure-'));
  temporaryRoots.push(directory);
  await writeFile(join(directory, 'config.ts'), source);
  const manifest = await discoverProject(directory, now);
  return secretExposureCheck.run({ root: directory, manifest });
}

describe('secretExposureCheck', () => {
  it('reports a quoted credential assignment by location and rule without returning its value', async () => {
    const manifest = await discoverProject(root, now);
    const findings = await secretExposureCheck.run({ root, manifest });

    const serializedFindings = JSON.stringify(findings);
    const hasFixtureCredential = serializedFindings.includes('fixture-secret-value-never-use');

    expect(hasFixtureCredential).toBe(false);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence[0]).toMatchObject({
      location: 'src/config.ts:1',
      summary: 'quoted-credential-assignment pattern detected; value redacted',
    });
  });

  it('reports a typed TypeScript credential assignment', async () => {
    const findings = await scanTemporarySource("const serviceToken: string = 'opaque';");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence[0]?.location).toBe('config.ts:1');
  });

  it('reports a credential assignment after a nested TypeScript type annotation', () => {
    const rule = detectSecretRule("const serviceToken: Record<string, { scope: string }> = 'opaque';");

    expect(rule).toBe('quoted-credential-assignment');
  });

  it('reports a credential assignment after an object type with semicolon-separated properties', () => {
    const rule = detectSecretRule("const serviceToken: { scope: string; region: string } = 'opaque';");

    expect(rule).toBe('quoted-credential-assignment');
  });

  it('does not flag comparisons or arrow functions with credential-named identifiers', () => {
    const rules = [
      "serviceToken == 'opaque'",
      "serviceToken === 'opaque'",
      "serviceToken != 'opaque'",
      "serviceToken !== 'opaque'",
      "serviceToken >= 'opaque'",
      "serviceToken <= 'opaque'",
      "serviceToken => 'opaque'",
    ].map((line) => detectSecretRule(line));

    expect(rules).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it('does not carry a non-quoted object property into a later benign quoted property', () => {
    const rule = detectSecretRule("const options = { serviceToken: loadToken(), theme: 'light' };");

    expect(rule).toBeUndefined();
  });

  it('returns no rule for an unterminated escape-heavy quoted assignment', () => {
    const unterminatedCandidate = `const serviceToken = '${'\\'.repeat(48)}`;

    expect(detectSecretRule(unterminatedCandidate)).toBeUndefined();
  });

  it('reports a private-key marker by location and rule', async () => {
    const findings = await scanTemporarySource('const certificate = "-----BEGIN PRIVATE KEY-----";');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence[0]).toMatchObject({
      location: 'config.ts:1',
      summary: 'private-key-marker pattern detected; value redacted',
    });
  });

  it('does not flag a benign quoted assignment', async () => {
    const findings = await scanTemporarySource("export const theme = 'light';");

    expect(findings).toEqual([]);
  });
});
