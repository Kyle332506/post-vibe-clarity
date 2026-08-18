import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { detectSecretRule, secretExposureCheck } from '../../src/checks/secret-exposure.js';
import { discoverProject } from '../../src/discovery/discover-project.js';
import {
  derivePartial,
  readinessDomains,
  summarizeReport,
  type CheckExecution,
  type CoverageGap,
  type ReadinessReport,
} from '../../src/model/report.js';
import { renderJson } from '../../src/report/render-json.js';
import { renderMarkdown } from '../../src/report/render-markdown.js';

const root = fileURLToPath(new URL('../../fixtures/web-missing-basics', import.meta.url));
const temporaryRoots: string[] = [];
const now = () => '2026-08-17T12:00:00.000Z';

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function scanTemporaryFiles(files: Record<string, string | Uint8Array>) {
  const directory = await mkdtemp(join(tmpdir(), 'postvibe-secret-exposure-'));
  temporaryRoots.push(directory);
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(directory, name), content)));
  const manifest = await discoverProject(directory, now);
  const findings = await secretExposureCheck.run({ root: directory, manifest });
  return { directory, findings, manifest };
}

async function scanTemporarySource(source: string) {
  return (await scanTemporaryFiles({ 'config.ts': source })).findings;
}

function makeReport(
  manifest: Awaited<ReturnType<typeof discoverProject>>,
  findings: Awaited<ReturnType<typeof secretExposureCheck.run>>,
): ReadinessReport {
  const checkExecutions: CheckExecution[] = [{
    checkId: 'secret-exposure.scan',
    checkVersion: '0.1.0',
    skillId: 'secret-exposure',
    skillVersion: '0.1.0',
    domains: ['security-privacy'],
    status: 'completed',
    findingIds: findings.map(({ id }) => id),
  }];
  const coverageGaps: CoverageGap[] = readinessDomains
    .filter((domain) => domain !== 'security-privacy')
    .map((domain) => ({
      id: `domain.${domain}`,
      status: 'unverified',
      domains: [domain],
      reason: 'No routed check covers this domain in the current review.',
    }));
  return {
    schemaVersion: '0.1',
    runId: 'pvc-20260817120000000',
    generatedAt: now(),
    toolkitVersion: '0.1.0',
    partial: derivePartial(checkExecutions, coverageGaps),
    manifest,
    checkExecutions,
    coverageGaps,
    findings,
    summary: summarizeReport(findings, checkExecutions, coverageGaps),
    disclaimer: 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.',
  };
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

  it('reports runtime string assignments across JavaScript and TypeScript assignment forms', async () => {
    const controlledValues = [
      'controlled-variable-value-never-emit',
      'controlled-property-value-never-emit',
      'controlled-field-value-never-emit',
      'controlled-binding-value-never-emit',
      'controlled-assignment-value-never-emit',
    ];
    const findings = await scanTemporarySource([
      `const apiKey: string = '${controlledValues[0]}';`,
      `const options = { serviceToken: '${controlledValues[1]}' };`,
      `class RuntimeConfig { password = '${controlledValues[2]}'; }`,
      `const { apiKey: renamed = '${controlledValues[3]}' } = source;`,
      `settings['serviceToken'] = '${controlledValues[4]}';`,
      '',
    ].join('\n'));

    const findingPayload = JSON.stringify(findings);
    const payloadContainsControlledValue = controlledValues.some((value) => findingPayload.includes(value));
    expect(payloadContainsControlledValue).toBe(false);
    expect(findings.map((finding) => finding.evidence[0]?.location)).toEqual([
      'config.ts:1',
      'config.ts:2',
      'config.ts:3',
      'config.ts:4',
      'config.ts:5',
    ]);
  });

  it('ignores empty values and well-defined template placeholders', async () => {
    const findings = await scanTemporarySource([
      "const apiKey = '';",
      'const serviceToken = "CHANGE_ME";',
      "const password = '<your-password>';",
      "config.apiKey = '${API_KEY}';",
      "const clientSecret = 'replace-with-your-secret';",
      "const accessToken = 'example-token';",
      '',
    ].join('\n'));

    expect(findings).toEqual([]);
    expect(detectSecretRule("API_KEY=''")).toBeUndefined();
    expect(detectSecretRule("TOKEN='CHANGE_ME'")).toBeUndefined();
    expect(detectSecretRule("PASSWORD='<your-password>'")).toBeUndefined();
    expect(detectSecretRule("CLIENT_SECRET='${CLIENT_SECRET}'")).toBeUndefined();
  });

  it('reports literal compound assignments without returning their values', async () => {
    const controlledValues = [
      'controlled-or-assignment-never-emit',
      'controlled-nullish-assignment-never-emit',
      'controlled-and-assignment-never-emit',
      'controlled-plus-assignment-never-emit',
    ];
    const findings = await scanTemporarySource([
      `config.apiKey ||= '${controlledValues[0]}';`,
      `config.serviceToken ??= '${controlledValues[1]}';`,
      `config.password &&= '${controlledValues[2]}';`,
      `config.clientSecret += '${controlledValues[3]}';`,
      '',
    ].join('\n'));

    const payload = JSON.stringify(findings);
    expect(controlledValues.some((value) => payload.includes(value))).toBe(false);
    expect(findings.map((finding) => finding.evidence[0]?.location)).toEqual([
      'config.ts:1',
      'config.ts:2',
      'config.ts:3',
      'config.ts:4',
    ]);
  });

  it('ignores comments, type members, type aliases, and ambient declarations in TypeScript', async () => {
    const { findings } = await scanTemporaryFiles({
      'config.ts': [
        "interface Credentials { apiKey: 'interface-type-value'; }",
        "type CredentialShape = { serviceToken: 'alias-type-value' };",
        "declare const password: 'ambient-value';",
        "declare class AmbientConfig { apiKey: 'ambient-field-value'; }",
        "// const apiKey = 'line-comment-value';",
        "/* const serviceToken = 'block-comment-value'; */",
        '// -----BEGIN PRIVATE KEY-----',
        '',
      ].join('\n'),
      'types.d.ts': "export declare const apiKey: 'declaration-file-value';\n",
    });

    expect(findings).toEqual([]);
  });

  it('scans environment variants and common text key files while skipping binary key data', async () => {
    const binaryKey = new Uint8Array([
      0, 1, 2, 3,
      ...Buffer.from('-----BEGIN PRIVATE KEY-----', 'utf8'),
    ]);
    const { findings } = await scanTemporaryFiles({
      '.env': "API_KEY='env-value'\n",
      '.env.local': "SERVICE_TOKEN='local-value'\n",
      '.env.production': "password='production-value'\n",
      'binary.key': binaryKey,
      'certificate.pem': '-----BEGIN PRIVATE KEY-----\nredacted-fixture\n',
      'server.key': '-----BEGIN EC PRIVATE KEY-----\nredacted-fixture\n',
      'settings.json': '{"apiKey":"json-value"}\n',
    });

    expect(findings.map((finding) => finding.evidence[0]?.location)).toEqual([
      '.env:1',
      '.env.local:1',
      '.env.production:1',
      'certificate.pem:1',
      'server.key:1',
      'settings.json:1',
    ]);
  });

  it('keeps controlled values out of finding payloads and JSON and Markdown reports', async () => {
    const controlledValue = 'controlled-render-value-never-emit';
    const { findings, manifest } = await scanTemporaryFiles({
      '.env.local': `API_KEY='${controlledValue}'\n`,
    });
    const report = makeReport(manifest, findings);
    const leakState = {
      findingPayload: JSON.stringify(findings).includes(controlledValue),
      json: renderJson(report).includes(controlledValue),
      markdown: renderMarkdown(report).includes(controlledValue),
    };

    expect(leakState).toEqual({ findingPayload: false, json: false, markdown: false });
  });

  it('reports only the nested quoted credential assignment inside a non-quoted credential property', async () => {
    const findings = await scanTemporarySource(
      "const options = { serviceToken: loadConfig({ apiKey: 'nested-opaque-value' }) };",
    );

    const serializedFindings = JSON.stringify(findings);
    const hasCredentialValue = serializedFindings.includes('nested-opaque-value');

    expect(hasCredentialValue).toBe(false);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence[0]?.summary).toBe('quoted-credential-assignment pattern detected; value redacted');
  });

  it('reports a nested credential default assignment inside object destructuring', async () => {
    const findings = await scanTemporarySource(
      "const { config: { apiKey = 'destructured-opaque-value' } = {} } = source;",
    );

    const serializedFindings = JSON.stringify(findings);
    const hasCredentialValue = serializedFindings.includes('destructured-opaque-value');

    expect(hasCredentialValue).toBe(false);
    expect(findings).toHaveLength(1);
  });

  it('reports a private-key marker in a runtime string by location and rule', async () => {
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

  it('keeps the generic rule contract for non-JavaScript configuration text', () => {
    expect(detectSecretRule("API_KEY='opaque'")).toBe('quoted-credential-assignment');
    expect(detectSecretRule("API_KEY||='opaque'")).toBe('quoted-credential-assignment');
    expect(detectSecretRule("TOKEN??='opaque'")).toBe('quoted-credential-assignment');
    expect(detectSecretRule('-----BEGIN PRIVATE KEY-----')).toBe('private-key-marker');
    expect(detectSecretRule("theme='light'")).toBeUndefined();
  });
});
