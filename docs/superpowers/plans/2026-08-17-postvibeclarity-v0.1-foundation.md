# PostVibeClarity v0.1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working PostVibeClarity foundation that discovers a project, routes applicable readiness checks, records evidence, and emits honest Markdown and JSON reports.

**Architecture:** A TypeScript core creates a capability manifest, loads standard Agent Skills plus PostVibeClarity sidecars, routes checks, executes read-only check implementations, and renders a structured report. The first vertical slice includes secret-exposure and privacy-launch-essential checks so the complete discovery-to-report flow is testable before the larger domain and adapter catalogs are added.

**Tech Stack:** Node.js 24 LTS, TypeScript, ESM, pnpm, Vitest, AJV JSON Schema validation, and YAML parsing.

**Spec:** `docs/superpowers/specs/2026-08-17-postvibeclarity-design.md`

## Global Constraints

- The product name is `PostVibeClarity`.
- The headline promise is: `Know what's ready, what's risky, and what's missing before you launch.`
- A check that cannot run is `unverified`, never `passed`.
- A remediation action is not resolved until an independent check produces new evidence.
- Do not produce an overall numeric readiness score.
- Do not use `certified`, `100% secure`, `safe to launch`, `no vulnerabilities`, `all issues resolved`, or `guaranteed compliant` as verdicts.
- Canonical skills must follow the Agent Skills open standard and remain usable without PostVibeClarity-specific tooling.
- `readiness.yaml` is the machine-readable routing sidecar; agents that ignore it must still be able to follow `SKILL.md`.
- Normal review execution is limited to safety Levels 0 and 1. Source edits and external changes are outside this foundation plan.
- Secret values must never appear in findings, logs, snapshots, or reports.
- Use injected clocks and stable fixture paths so tests are deterministic.
- Use Apache License 2.0 for repository licensing.

## Plan Boundary

This is the first of several independently testable plans. It implements the foundation vertical slice and two universal checks. Separate plans will cover the complete nine-domain catalog, deeper artifact packs, cross-agent packaging and installation automation, and advanced provider/framework adapters.

## File Structure

```text
package.json                              Workspace scripts and CLI entry
pnpm-lock.yaml                            Reproducible dependency graph
tsconfig.json                             TypeScript compiler contract
vitest.config.ts                          Test discovery and coverage settings
LICENSE                                   Apache License 2.0 text
schemas/readiness.schema.json             Sidecar schema
schemas/report-0.1.schema.json             Versioned report schema
src/model/capability.ts                   Capability-manifest types
src/model/finding.ts                      Evidence and finding types
src/model/report.ts                       Report types and summary aggregation
src/validation/readiness-schema.ts        Sidecar schema validator
src/validation/report-schema.ts           Runtime report schema and semantic validator
src/discovery/file-index.ts               Safe project file enumeration
src/discovery/discover-project.ts         Artifact and capability detection
src/catalog/load-catalog.ts               Skill-directory and sidecar loading
src/catalog/route-skills.ts               Applicability routing
src/orchestrator/check-registry.ts        Check interface and registration
src/orchestrator/build-review-plan.ts     Safety-aware executable plan
src/orchestrator/run-review.ts            End-to-end review coordinator
src/checks/secret-exposure.ts             Redacted secret-pattern inspection
src/checks/launch-essentials.ts            Privacy-notice applicability check
src/report/render-json.ts                 Machine-readable report rendering
src/report/render-markdown.ts             Plain-language report rendering
src/cli/report-output.ts                  Exclusive report-file creation
src/cli.ts                                `postvibe review` command
skills/post-vibe-clarity/SKILL.md         Main agent-facing orchestrator
skills/project-discovery/SKILL.md         Discovery workflow instructions
skills/secret-exposure/SKILL.md           Portable secret review instructions
skills/secret-exposure/readiness.yaml     Secret-check routing metadata
skills/launch-essentials/SKILL.md         Portable launch-essential instructions
skills/launch-essentials/readiness.yaml   Launch-essential routing metadata
fixtures/web-missing-basics/              Intentionally flawed web fixture
fixtures/cli-clean/                       Clean CLI fixture
tests/                                    Unit, contract, safety, and end-to-end tests
```

---

### Task 1: Initialize the workspace and validate skill sidecars

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `LICENSE`
- Create: `schemas/readiness.schema.json`
- Create: `src/validation/readiness-schema.ts`
- Create: `tests/validation/readiness-schema.test.ts`
- Create: `tests/fixtures/manifests/valid.yaml`
- Create: `tests/fixtures/manifests/invalid.yaml`

**Interfaces:**
- Consumes: None
- Produces: `validateReadinessManifest(input: unknown): Promise<ValidationResult>` and the canonical `readiness.yaml` schema used by every later task.

- [ ] **Step 1: Create the minimal package and TypeScript configuration**

Create `package.json`:

```json
{
  "name": "post-vibe-clarity",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "postvibe": "./dist/src/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "pnpm build && pnpm test",
    "review": "tsx src/cli.ts review",
    "test": "vitest run"
  },
  "engines": {
    "node": ">=24"
  },
  "license": "Apache-2.0"
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

Run:

```bash
pnpm add ajv ajv-formats yaml
pnpm add --save-dev @types/node tsx typescript vitest
```

Copy the unmodified Apache License 2.0 text from `https://www.apache.org/licenses/LICENSE-2.0.txt` into `LICENSE`.

- [ ] **Step 2: Write failing sidecar-validation tests**

Create `tests/fixtures/manifests/valid.yaml`:

```yaml
schemaVersion: "0.1"
id: secret-exposure
skillVersion: "0.1.0"
domains:
  - security-privacy
appliesTo:
  anyArtifacts:
    - web
    - backend
modes:
  - audit
  - verify
maxActionLevel: 0
checks:
  - secret-exposure.scan
```

Create `tests/fixtures/manifests/invalid.yaml`:

```yaml
schemaVersion: "0.1"
id: Secret Exposure
domains:
  - unknown-domain
modes:
  - certify
maxActionLevel: 9
checks: []
```

Create `tests/validation/readiness-schema.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
pnpm test tests/validation/readiness-schema.test.ts
```

Expected: FAIL because `src/validation/readiness-schema.ts` does not exist.

- [ ] **Step 4: Create the schema and minimal validator**

Create `schemas/readiness.schema.json` with these required fields and enums:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://postvibeclarity.dev/schemas/readiness-0.1.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "id", "skillVersion", "domains", "modes", "maxActionLevel", "checks"],
  "properties": {
    "schemaVersion": { "const": "0.1" },
    "id": { "type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    "skillVersion": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    "domains": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": {
        "enum": [
          "product-ux",
          "security-privacy",
          "data-correctness",
          "reliability-recovery",
          "operations-observability",
          "performance-cost",
          "maintainability-change-safety",
          "release-delivery",
          "policy-business-essentials"
        ]
      }
    },
    "appliesTo": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "anyArtifacts": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "enum": ["web", "mobile", "desktop", "cli", "backend", "worker", "library", "extension", "ai-agent", "infrastructure", "monorepo"]
          }
        },
        "allCapabilities": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string", "minLength": 1 }
        }
      }
    },
    "modes": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "enum": ["audit", "propose", "remediate", "verify"] }
    },
    "maxActionLevel": { "type": "integer", "minimum": 0, "maximum": 4 },
    "checks": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "type": "string", "pattern": "^[a-z0-9-]+\\.[a-z0-9-]+$" }
    }
  }
}
```

Create `src/validation/readiness-schema.ts`:

```ts
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const schemaUrl = new URL('../../schemas/readiness.schema.json', import.meta.url);

export async function validateReadinessManifest(input: unknown): Promise<ValidationResult> {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (validate(input)) return { ok: true };
  return {
    ok: false,
    errors: (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`),
  };
}
```

- [ ] **Step 5: Run validation and build checks**

Run:

```bash
pnpm test tests/validation/readiness-schema.test.ts
pnpm build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts LICENSE schemas src/validation tests/validation tests/fixtures/manifests
git commit -m "chore: initialize PostVibeClarity contracts"
```

---

### Task 2: Define capability, evidence, finding, and report contracts

**Files:**
- Create: `src/model/capability.ts`
- Create: `src/model/finding.ts`
- Create: `src/model/report.ts`
- Create: `schemas/report-0.1.schema.json`
- Create: `src/validation/report-schema.ts`
- Create: `tests/model/report.test.ts`
- Create: `tests/validation/report-schema.test.ts`

**Interfaces:**
- Consumes: The domain and artifact values established by `schemas/readiness.schema.json`.
- Produces: `CapabilityManifest`, `Evidence`, `Finding`, `ReadinessReport`, `summarizeFindings(findings)`, `summarizeReport(...)`, `derivePartial(...)`, and `validateReadinessReport(input)` for all later tasks.

- [ ] **Step 1: Write the failing report-model tests**

Create `tests/model/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { summarizeFindings } from '../../src/model/report.js';
import type { Finding } from '../../src/model/finding.js';

const findings: Finding[] = [
  {
    id: 'secret-exposure.fixture-secret',
    checkId: 'secret-exposure.scan',
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['security-privacy'],
    actionLevel: 'stop-before-launch',
    outcome: 'failed',
    title: 'Potential credential in source',
    impact: 'A credential committed to source may be copied or abused.',
    evidence: [{ kind: 'file', summary: 'Private key marker detected', location: 'src/config.ts:2' }],
    evidenceConfidence: 'confirmed',
    applicability: 'The project contains source files.',
    recommendation: 'Remove and rotate the credential outside this review.',
    verification: 'Scan the repository again after removal.',
    humanReviewRequired: false,
  },
  {
    id: 'launch-essentials.privacy-unverified',
    checkId: 'launch-essentials.privacy-notice',
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['policy-business-essentials'],
    actionLevel: 'human-review-needed',
    outcome: 'unverified',
    title: 'Privacy notice could not be verified',
    impact: 'Users may not understand how their information is handled.',
    evidence: [],
    evidenceConfidence: 'insufficient',
    applicability: 'Personal-data collection was detected.',
    recommendation: 'Review the data inventory and applicable requirements.',
    verification: 'Provide reviewed policy text and confirm it is linked.',
    humanReviewRequired: true,
  },
];

describe('summarizeFindings', () => {
  it('keeps failed and unverified outcomes separate', () => {
    expect(summarizeFindings(findings)).toEqual({
      byActionLevel: {
        'stop-before-launch': 1,
        'resolve-before-launch': 0,
        'plan-soon': 0,
        'improve-when-appropriate': 0,
        'human-review-needed': 1,
      },
      byOutcome: {
        passed: 0,
        failed: 1,
        'likely-issue': 0,
        unverified: 1,
        'not-applicable': 0,
        'risk-accepted': 0,
        'resolved-and-rechecked': 0,
      },
    });
  });

  it('does not expose a readiness score', () => {
    expect(summarizeFindings(findings)).not.toHaveProperty('score');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/model/report.test.ts
```

Expected: FAIL because the model modules do not exist.

- [ ] **Step 3: Implement the shared contracts**

Create `src/model/capability.ts`:

```ts
import type { Evidence } from './finding.js';

export type ArtifactType = 'web' | 'mobile' | 'desktop' | 'cli' | 'backend' | 'worker' | 'library' | 'extension' | 'ai-agent' | 'infrastructure' | 'monorepo';
export type DetectionConfidence = 'confirmed' | 'likely';

export interface Detection<T extends string> {
  value: T;
  confidence: DetectionConfidence;
  evidence: Evidence[];
}

export interface CapabilityManifest {
  schemaVersion: '0.1';
  projectRoot: string;
  generatedAt: string;
  artifacts: Detection<ArtifactType>[];
  frameworks: Detection<string>[];
  services: Detection<string>[];
  capabilities: Detection<string>[];
}
```

Create `src/model/finding.ts`:

```ts
export type Domain = 'product-ux' | 'security-privacy' | 'data-correctness' | 'reliability-recovery' | 'operations-observability' | 'performance-cost' | 'maintainability-change-safety' | 'release-delivery' | 'policy-business-essentials';
export type ActionLevel = 'stop-before-launch' | 'resolve-before-launch' | 'plan-soon' | 'improve-when-appropriate' | 'human-review-needed';
export type Outcome = 'passed' | 'failed' | 'likely-issue' | 'unverified' | 'not-applicable' | 'risk-accepted' | 'resolved-and-rechecked';
export type EvidenceKind = 'file' | 'command' | 'behavior' | 'human';
export type EvidenceConfidence = 'confirmed' | 'strong-indication' | 'possible' | 'insufficient';

export interface Evidence {
  kind: EvidenceKind;
  summary: string;
  location?: string;
}

export interface Finding {
  id: string;
  checkId: string;
  checkVersion: string;
  skillVersion: string;
  domains: Domain[];
  actionLevel: ActionLevel;
  outcome: Outcome;
  title: string;
  impact: string;
  evidence: Evidence[];
  evidenceConfidence: EvidenceConfidence;
  applicability: string;
  recommendation: string;
  verification: string;
  humanReviewRequired: boolean;
  unverifiedBoundaries?: string[];
}
```

Create `src/model/report.ts`:

```ts
import type { CapabilityManifest } from './capability.js';
import type { ActionLevel, Domain, Finding, Outcome } from './finding.js';

const actionLevels: ActionLevel[] = ['stop-before-launch', 'resolve-before-launch', 'plan-soon', 'improve-when-appropriate', 'human-review-needed'];
const outcomes: Outcome[] = ['passed', 'failed', 'likely-issue', 'unverified', 'not-applicable', 'risk-accepted', 'resolved-and-rechecked'];
export const checkExecutionStatuses = ['completed', 'unavailable', 'failed', 'unverified'] as const;
export const readinessDomains: Domain[] = ['product-ux', 'security-privacy', 'data-correctness', 'reliability-recovery', 'operations-observability', 'performance-cost', 'maintainability-change-safety', 'release-delivery', 'policy-business-essentials'];

export type CheckExecutionStatus = typeof checkExecutionStatuses[number];
export type IncompleteCheckStatus = Exclude<CheckExecutionStatus, 'completed'>;

export interface CheckExecution {
  checkId: string;
  checkVersion: string;
  skillId: string;
  skillVersion: string;
  domains: Domain[];
  status: CheckExecutionStatus;
  findingIds: string[];
}

export interface CoverageGap {
  id: string;
  status: IncompleteCheckStatus;
  domains: Domain[];
  reason: string;
  checkId?: string;
  skillId?: string;
}

export interface FindingSummary {
  byActionLevel: Record<ActionLevel, number>;
  byOutcome: Record<Outcome, number>;
}

export interface ReportSummary extends FindingSummary {
  byCheckStatus: Record<CheckExecutionStatus, number>;
  byDomain: Record<Domain, Record<CheckExecutionStatus, number>>;
}

export interface ReadinessReport {
  schemaVersion: '0.1';
  runId: string;
  generatedAt: string;
  toolkitVersion: string;
  partial: boolean;
  manifest: CapabilityManifest;
  checkExecutions: CheckExecution[];
  coverageGaps: CoverageGap[];
  findings: Finding[];
  summary: ReportSummary;
  disclaimer: string;
}

function zeroRecord<T extends string>(keys: T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function summarizeFindings(findings: Finding[]): FindingSummary {
  const byActionLevel = zeroRecord(actionLevels);
  const byOutcome = zeroRecord(outcomes);
  for (const finding of findings) {
    byActionLevel[finding.actionLevel] += 1;
    byOutcome[finding.outcome] += 1;
  }
  return { byActionLevel, byOutcome };
}

export function summarizeReport(
  findings: Finding[],
  checkExecutions: CheckExecution[],
  coverageGaps: CoverageGap[],
): ReportSummary {
  const byCheckStatus = zeroRecord([...checkExecutionStatuses]);
  const byDomain = Object.fromEntries(readinessDomains.map((domain) => [domain, zeroRecord([...checkExecutionStatuses])])) as ReportSummary['byDomain'];
  for (const execution of checkExecutions) {
    byCheckStatus[execution.status] += 1;
    for (const domain of execution.domains) byDomain[domain][execution.status] += 1;
  }
  for (const gap of coverageGaps.filter(({ checkId }) => checkId === undefined)) {
    for (const domain of gap.domains) byDomain[domain][gap.status] += 1;
  }
  return { ...summarizeFindings(findings), byCheckStatus, byDomain };
}

export function derivePartial(checkExecutions: CheckExecution[], coverageGaps: CoverageGap[]): boolean {
  return coverageGaps.length > 0 || checkExecutions.some(({ status }) => status !== 'completed');
}
```

Create `schemas/report-0.1.schema.json` and `src/validation/report-schema.ts`. The schema requires every finding's check and skill version, every routed check execution, coverage gaps, and all action/outcome/check/domain summary fields. Runtime semantic validation must recompute the summary and `partial`, reject duplicate or inconsistent finding/execution linkage, require a matching gap for every non-completed check, require an `unverified` gap for every uncovered domain, and ensure finding check/skill provenance agrees with its execution. Resolve the same package-local schema from source and compiled layouts.

- [ ] **Step 4: Run model tests and type checking**

Run:

```bash
pnpm test tests/model/report.test.ts
pnpm test tests/validation/report-schema.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas/report-0.1.schema.json src/model src/validation/report-schema.ts tests/model tests/validation/report-schema.test.ts
git commit -m "feat: define readiness evidence contracts"
```

---

### Task 3: Discover project artifacts and sensitive capabilities

**Files:**
- Create: `src/discovery/file-index.ts`
- Create: `src/discovery/discover-project.ts`
- Create: `tests/discovery/discover-project.test.ts`
- Create: `fixtures/web-missing-basics/package.json`
- Create: `fixtures/web-missing-basics/src/register.ts`
- Create: `fixtures/cli-clean/package.json`
- Create: `fixtures/cli-clean/src/cli.ts`

**Interfaces:**
- Consumes: `CapabilityManifest`, `ArtifactType`, `Detection`, and `Evidence` from Task 2.
- Produces: `listProjectFiles(root: string): Promise<string[]>` and `discoverProject(root: string, now: () => string): Promise<CapabilityManifest>`.

- [ ] **Step 1: Create representative fixture projects**

Create `fixtures/web-missing-basics/package.json`:

```json
{
  "name": "fixture-web-missing-basics",
  "private": true,
  "scripts": { "build": "next build" },
  "dependencies": { "next": "0.0.0-fixture", "react": "0.0.0-fixture" }
}
```

Create `fixtures/web-missing-basics/src/register.ts`:

```ts
export interface Registration {
  name: string;
  email: string;
}

export function register(input: Registration): Registration {
  return input;
}
```

Create `fixtures/cli-clean/package.json`:

```json
{
  "name": "fixture-cli-clean",
  "private": true,
  "bin": { "fixture-cli": "./src/cli.ts" }
}
```

Create `fixtures/cli-clean/src/cli.ts`:

```ts
process.stdout.write('fixture\n');
```

- [ ] **Step 2: Write failing discovery tests**

Create `tests/discovery/discover-project.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverProject } from '../../src/discovery/discover-project.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const now = () => '2026-08-17T12:00:00.000Z';

describe('discoverProject', () => {
  it('detects a web project and likely personal-data collection', async () => {
    const manifest = await discoverProject(fixture('web-missing-basics'), now);
    expect(manifest.artifacts.map((item) => item.value)).toContain('web');
    expect(manifest.frameworks.map((item) => item.value)).toContain('next');
    expect(manifest.capabilities.map((item) => item.value)).toContain('collects-personal-data');
    expect(manifest.generatedAt).toBe('2026-08-17T12:00:00.000Z');
  });

  it('detects a CLI without inventing personal-data collection', async () => {
    const manifest = await discoverProject(fixture('cli-clean'), now);
    expect(manifest.artifacts.map((item) => item.value)).toEqual(['cli']);
    expect(manifest.capabilities.map((item) => item.value)).not.toContain('collects-personal-data');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm test tests/discovery/discover-project.test.ts
```

Expected: FAIL because discovery modules do not exist.

- [ ] **Step 4: Implement safe file enumeration**

Create `src/discovery/file-index.ts`:

```ts
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ignoredDirectories = new Set(['.git', '.postvibe', 'coverage', 'dist', 'node_modules']);

export async function listProjectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      if (entry.isFile()) files.push(relative(root, absolute));
    }
  }
  await walk(root);
  return files.sort();
}
```

- [ ] **Step 5: Implement minimal artifact and capability detection**

Create `src/discovery/discover-project.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArtifactType, CapabilityManifest, Detection } from '../model/capability.js';
import { listProjectFiles } from './file-index.js';

interface PackageJson {
  bin?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function detection<T extends string>(value: T, location: string, summary: string, confidence: 'confirmed' | 'likely' = 'confirmed'): Detection<T> {
  return { value, confidence, evidence: [{ kind: 'file', location, summary }] };
}

export async function discoverProject(root: string, now: () => string): Promise<CapabilityManifest> {
  const files = await listProjectFiles(root);
  const artifacts: Detection<ArtifactType>[] = [];
  const frameworks: Detection<string>[] = [];
  const capabilities: Detection<string>[] = [];
  const packagePath = files.includes('package.json') ? join(root, 'package.json') : undefined;
  let packageJson: PackageJson = {};

  if (packagePath) packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as PackageJson;
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if ('next' in dependencies || 'react' in dependencies || files.includes('index.html')) {
    artifacts.push(detection('web', 'package.json', 'Browser application dependency detected'));
  }
  if ('next' in dependencies) frameworks.push(detection('next', 'package.json', 'Next.js dependency detected'));
  if (packageJson.bin !== undefined) artifacts.push(detection('cli', 'package.json', 'Package exposes a command-line binary'));

  const sourceFiles = files.filter((file) => /\.(?:js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift)$/.test(file));
  for (const file of sourceFiles) {
    const content = await readFile(join(root, file), 'utf8');
    if (/\bemail\b/i.test(content) && /\b(?:register|signup|user|account)\b/i.test(content)) {
      capabilities.push(detection('collects-personal-data', file, 'Account-related source references an email field', 'likely'));
      break;
    }
  }

  return {
    schemaVersion: '0.1',
    projectRoot: root,
    generatedAt: now(),
    artifacts,
    frameworks,
    services: [],
    capabilities,
  };
}
```

- [ ] **Step 6: Run discovery tests and build**

Run:

```bash
pnpm test tests/discovery/discover-project.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/discovery tests/discovery fixtures/web-missing-basics fixtures/cli-clean
git commit -m "feat: discover project capabilities"
```

---

### Task 4: Load and route the portable skill catalog

**Files:**
- Create: `src/catalog/load-catalog.ts`
- Create: `src/catalog/route-skills.ts`
- Create: `tests/catalog/catalog.test.ts`
- Create: `tests/fixtures/skills/secret-exposure/SKILL.md`
- Create: `tests/fixtures/skills/secret-exposure/readiness.yaml`
- Create: `tests/fixtures/skills/launch-essentials/SKILL.md`
- Create: `tests/fixtures/skills/launch-essentials/readiness.yaml`

**Interfaces:**
- Consumes: `validateReadinessManifest`, `CapabilityManifest`, `ArtifactType`, and `Domain`.
- Produces: `SkillDescriptor`, `loadSkillCatalog(root)`, and `routeSkills(manifest, catalog)`.

- [ ] **Step 1: Write the catalog fixtures and failing tests**

Create `tests/fixtures/skills/secret-exposure/SKILL.md`:

```markdown
---
name: secret-exposure
description: Inspect a project for likely embedded credentials while keeping matched values out of evidence and reports.
license: Apache-2.0
---

# Secret exposure

Inspect source and configuration files for likely credentials. Report only the rule name and location; never copy a matched value into output.
```

Create `tests/fixtures/skills/secret-exposure/readiness.yaml`:

```yaml
schemaVersion: "0.1"
id: secret-exposure
skillVersion: "0.1.0"
domains:
  - security-privacy
modes:
  - audit
  - verify
maxActionLevel: 0
checks:
  - secret-exposure.scan
```

Create `tests/fixtures/skills/launch-essentials/SKILL.md`:

```markdown
---
name: launch-essentials
description: Review policy and business essentials when a project handles personal information or other regulated capabilities.
license: Apache-2.0
---

# Launch essentials

Check whether the project has evidence of the launch documents its detected capabilities require. Treat legal accuracy as human-review work.
```

Create `tests/fixtures/skills/launch-essentials/readiness.yaml`:

```yaml
schemaVersion: "0.1"
id: launch-essentials
skillVersion: "0.1.0"
domains:
  - policy-business-essentials
  - security-privacy
appliesTo:
  allCapabilities:
    - collects-personal-data
modes:
  - audit
  - propose
  - verify
maxActionLevel: 0
checks:
  - launch-essentials.privacy-notice
```

Create `tests/catalog/catalog.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSkillCatalog } from '../../src/catalog/load-catalog.js';
import { routeSkills } from '../../src/catalog/route-skills.js';
import type { CapabilityManifest } from '../../src/model/capability.js';

const root = fileURLToPath(new URL('../fixtures/skills', import.meta.url));
const base: CapabilityManifest = {
  schemaVersion: '0.1',
  projectRoot: '/fixture',
  generatedAt: '2026-08-17T12:00:00.000Z',
  artifacts: [],
  frameworks: [],
  services: [],
  capabilities: [],
};

describe('skill catalog', () => {
  it('loads valid sidecars next to Agent Skills', async () => {
    const catalog = await loadSkillCatalog(root);
    expect(catalog.map((skill) => skill.id)).toEqual(['launch-essentials', 'secret-exposure']);
  });

  it('routes universal skills and matching capability skills', async () => {
    const catalog = await loadSkillCatalog(root);
    expect(routeSkills(base, catalog).map((skill) => skill.id)).toEqual(['secret-exposure']);
    const personalDataManifest: CapabilityManifest = {
      ...base,
      capabilities: [{ value: 'collects-personal-data', confidence: 'likely', evidence: [] }],
    };
    expect(routeSkills(personalDataManifest, catalog).map((skill) => skill.id)).toEqual([
      'launch-essentials',
      'secret-exposure',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/catalog/catalog.test.ts
```

Expected: FAIL because catalog modules do not exist.

- [ ] **Step 3: Implement catalog loading**

In `src/catalog/load-catalog.ts`, define:

```ts
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { ArtifactType } from '../model/capability.js';
import type { Domain } from '../model/finding.js';
import { validateReadinessManifest } from '../validation/readiness-schema.js';

export interface SkillDescriptor {
  schemaVersion: '0.1';
  id: string;
  skillVersion: string;
  domains: Domain[];
  appliesTo?: { anyArtifacts?: ArtifactType[]; allCapabilities?: string[] };
  modes: Array<'audit' | 'propose' | 'remediate' | 'verify'>;
  maxActionLevel: 0 | 1 | 2 | 3 | 4;
  checks: string[];
  directory: string;
}

export async function loadSkillCatalog(root: string): Promise<SkillDescriptor[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const skills: SkillDescriptor[] = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = join(root, entry.name);
    await readFile(join(directory, 'SKILL.md'), 'utf8');
    const input = parse(await readFile(join(directory, 'readiness.yaml'), 'utf8')) as unknown;
    const validation = await validateReadinessManifest(input);
    if (!validation.ok) throw new Error(`${entry.name}/readiness.yaml: ${validation.errors.join('; ')}`);
    skills.push({ ...(input as Omit<SkillDescriptor, 'directory'>), directory });
  }
  return skills;
}
```

- [ ] **Step 4: Implement capability routing**

Create `src/catalog/route-skills.ts`:

```ts
import type { CapabilityManifest } from '../model/capability.js';
import type { SkillDescriptor } from './load-catalog.js';

export function routeSkills(manifest: CapabilityManifest, catalog: SkillDescriptor[]): SkillDescriptor[] {
  const artifacts = new Set(manifest.artifacts.map((item) => item.value));
  const capabilities = new Set(manifest.capabilities.map((item) => item.value));
  return catalog.filter((skill) => {
    const anyArtifacts = skill.appliesTo?.anyArtifacts;
    const allCapabilities = skill.appliesTo?.allCapabilities;
    const artifactMatch = !anyArtifacts?.length || anyArtifacts.some((artifact) => artifacts.has(artifact));
    const capabilityMatch = !allCapabilities?.length || allCapabilities.every((capability) => capabilities.has(capability));
    return artifactMatch && capabilityMatch;
  });
}
```

- [ ] **Step 5: Run catalog tests and build**

Run:

```bash
pnpm test tests/catalog/catalog.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/catalog tests/catalog tests/fixtures/skills
git commit -m "feat: route portable readiness skills"
```

---

### Task 5: Build a safety-aware review plan and check registry

**Files:**
- Create: `src/orchestrator/check-registry.ts`
- Create: `src/orchestrator/build-review-plan.ts`
- Create: `tests/orchestrator/build-review-plan.test.ts`

**Interfaces:**
- Consumes: `SkillDescriptor`, `CapabilityManifest`, and `Finding`.
- Produces: `CheckContext`, `CheckImplementation`, `CheckRegistry`, `ReviewPlanItem`, and `buildReviewPlan(skills, registry)`.

- [ ] **Step 1: Write failing safety-plan tests**

Create `tests/orchestrator/build-review-plan.test.ts` with one registered Level 0 check and one missing check. Assert that the registered check is `ready`, the missing check is `unavailable`, and a registered Level 2 check throws because this foundation runner permits only Levels 0 and 1.

Use this exact expected ready item:

```ts
{
  checkId: 'secret-exposure.scan',
  checkVersion: '0.1.0',
  skillId: 'secret-exposure',
  skillVersion: '0.1.0',
  status: 'ready',
  actionLevel: 0,
  requiredAccess: ['filesystem-read'],
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/orchestrator/build-review-plan.test.ts
```

Expected: FAIL because the orchestrator modules do not exist.

- [ ] **Step 3: Define the check contract and registry**

Create `src/orchestrator/check-registry.ts`:

```ts
import type { CapabilityManifest } from '../model/capability.js';
import type { Finding } from '../model/finding.js';

export type RequiredAccess = 'filesystem-read' | 'local-command' | 'network' | 'test-account' | 'credential';

export interface CheckContext {
  root: string;
  manifest: CapabilityManifest;
}

export interface CheckImplementation {
  readonly id: string;
  readonly version: string;
  readonly actionLevel: 0 | 1 | 2 | 3 | 4;
  readonly requiredAccess: readonly RequiredAccess[];
  readonly run: (context: CheckContext) => Promise<Finding[]>;
}

export type CheckRegistry = ReadonlyMap<string, CheckImplementation>;
```

- [ ] **Step 4: Implement review-plan construction**

Create `src/orchestrator/build-review-plan.ts`:

```ts
import type { SkillDescriptor } from '../catalog/load-catalog.js';
import type { CheckRegistry, RequiredAccess } from './check-registry.js';

export type ReviewPlanItem =
  | { checkId: string; checkVersion: string; skillId: string; skillVersion: string; status: 'ready'; actionLevel: 0 | 1; requiredAccess: readonly RequiredAccess[] }
  | { checkId: string; checkVersion: 'unknown'; skillId: string; skillVersion: string; status: 'unavailable'; reason: string };

export function buildReviewPlan(skills: SkillDescriptor[], registry: CheckRegistry): ReviewPlanItem[] {
  return skills.flatMap((skill) => skill.checks.map((checkId): ReviewPlanItem => {
    const implementation = registry.get(checkId);
    if (!implementation) return { checkId, checkVersion: 'unknown', skillId: skill.id, skillVersion: skill.skillVersion, status: 'unavailable', reason: 'No check implementation is registered.' };
    if (implementation.actionLevel > 1) throw new Error(`Foundation runner cannot execute Level ${implementation.actionLevel} check ${checkId}`);
    return {
      checkId,
      checkVersion: implementation.version,
      skillId: skill.id,
      skillVersion: skill.skillVersion,
      status: 'ready',
      actionLevel: implementation.actionLevel,
      requiredAccess: implementation.requiredAccess,
    };
  }));
}
```

- [ ] **Step 5: Run safety-plan tests and build**

Run:

```bash
pnpm test tests/orchestrator/build-review-plan.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator tests/orchestrator
git commit -m "feat: add safety-aware review planning"
```

---

### Task 6: Detect potential secret exposure without leaking values

**Files:**
- Create: `src/checks/secret-exposure.ts`
- Create: `tests/checks/secret-exposure.test.ts`
- Create: `fixtures/web-missing-basics/src/config.ts`

**Interfaces:**
- Consumes: `CheckImplementation`, `Finding`, and `listProjectFiles`.
- Produces: `secretExposureCheck: CheckImplementation` registered as `secret-exposure.scan`.

- [ ] **Step 1: Seed a clearly fake fixture credential**

Create `fixtures/web-missing-basics/src/config.ts`:

```ts
export const apiKey = 'fixture-secret-value-never-use';
```

- [ ] **Step 2: Write the failing detection and redaction test**

Create `tests/checks/secret-exposure.test.ts` with positive private-key and quoted-literal cases, negative empty/environment/template-placeholder cases, and JavaScript/TypeScript plus generic-text compound assignment cases (`||=`, `??=`, logical, arithmetic, shift, and bitwise assignment). All assertions must prove that matched values never appear in returned findings:

```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { secretExposureCheck } from '../../src/checks/secret-exposure.js';
import { discoverProject } from '../../src/discovery/discover-project.js';

const root = fileURLToPath(new URL('../../fixtures/web-missing-basics', import.meta.url));

describe('secretExposureCheck', () => {
  it('reports location and rule without returning the matched value', async () => {
    const manifest = await discoverProject(root, () => '2026-08-17T12:00:00.000Z');
    const findings = await secretExposureCheck.run({ root, manifest });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence[0]?.location).toBe('src/config.ts:1');
    expect(JSON.stringify(findings)).not.toContain('fixture-secret-value-never-use');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm test tests/checks/secret-exposure.test.ts
```

Expected: FAIL because the secret check does not exist.

- [ ] **Step 4: Implement redacted matching**

Create `src/checks/secret-exposure.ts` with rules for private-key markers and quoted assignments to names containing `apiKey`, `api_key`, `secret`, `token`, or `password`. Support simple and relevant compound assignment operators, including `||=`, `??=`, logical, arithmetic, shift, and bitwise assignment. Omit empty or whitespace-only strings and a bounded documented set of explicit environment/template placeholders; continue to report unknown non-empty literal values conservatively. For every match, store only the rule label and one-based line number.

The exported implementation must use these stable finding fields:

```ts
export const secretExposureCheck: CheckImplementation = {
  id: 'secret-exposure.scan',
  version: '0.1.0',
  actionLevel: 0,
  requiredAccess: ['filesystem-read'],
  async run({ root }) {
    const findings: Finding[] = [];
    const files = await listProjectFiles(root);
    for (const file of files.filter((name) => /\.(?:env|js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|json|ya?ml|toml)$/.test(name))) {
      const content = await readFile(join(root, file), 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        const rule = detectSecretRule(line);
        if (!rule) return;
        findings.push({
          id: `secret-exposure.${file}:${index + 1}.${rule}`,
          checkId: 'secret-exposure.scan',
          checkVersion: '0.1.0',
          skillVersion: '0.1.0',
          domains: ['security-privacy'],
          actionLevel: 'stop-before-launch',
          outcome: 'failed',
          title: 'Potential credential stored in the project',
          impact: 'A credential in project files may be copied, committed, logged, or exposed to users.',
          evidence: [{ kind: 'file', summary: `${rule} pattern detected; value redacted`, location: `${file}:${index + 1}` }],
          evidenceConfidence: 'strong-indication',
          applicability: 'The project contains text configuration or source files.',
          recommendation: 'Move the credential to an appropriate secret store and rotate any credential that may have been exposed.',
          verification: 'Scan the project again and verify the original credential was rotated outside this review.',
          humanReviewRequired: false,
        });
      });
    }
    return findings;
  },
};
```

Implement `detectSecretRule(line: string): string | undefined` in the same file. It must never return the matching substring.

- [ ] **Step 5: Run detection, redaction, and build checks**

Run:

```bash
pnpm test tests/checks/secret-exposure.test.ts
pnpm build
```

Expected: PASS. Inspect the failure output if the fake credential appears anywhere; treat any appearance as a test failure.

- [ ] **Step 6: Commit**

```bash
git add src/checks/secret-exposure.ts tests/checks/secret-exposure.test.ts fixtures/web-missing-basics/src/config.ts
git commit -m "feat: add redacted secret exposure check"
```

---

### Task 7: Identify a missing privacy notice as a launch essential

**Files:**
- Create: `src/checks/launch-essentials.ts`
- Create: `tests/checks/launch-essentials.test.ts`

**Interfaces:**
- Consumes: `CheckImplementation`, `Finding`, `CapabilityManifest`, and `listProjectFiles`.
- Produces: `privacyNoticeCheck: CheckImplementation` registered as `launch-essentials.privacy-notice`.

- [ ] **Step 1: Write failing applicability tests**

Create `tests/checks/launch-essentials.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { privacyNoticeCheck } from '../../src/checks/launch-essentials.js';
import { discoverProject } from '../../src/discovery/discover-project.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const now = () => '2026-08-17T12:00:00.000Z';

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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/checks/launch-essentials.test.ts
```

Expected: FAIL because the launch-essential check does not exist.

- [ ] **Step 3: Implement applicability-driven privacy review**

Create `src/checks/launch-essentials.ts`. Detect policy candidates by case-insensitive file paths containing `privacy`, excluding dependency and build directories already omitted by `listProjectFiles`.

The missing-policy finding must use this language:

```ts
{
  id: 'launch-essentials.privacy-notice-missing',
  checkId: 'launch-essentials.privacy-notice',
  checkVersion: '0.1.0',
  skillVersion: '0.1.0',
  domains: ['policy-business-essentials', 'security-privacy'],
  actionLevel: 'human-review-needed',
  outcome: 'likely-issue',
  title: 'Privacy notice not found',
  impact: 'People may not be told what information is collected or how it is used.',
  evidence: capability.evidence,
  evidenceConfidence: 'strong-indication',
  applicability: 'Account-related personal-data collection was detected, and no privacy policy file or route was found.',
  recommendation: 'Create a factual data inventory and obtain appropriate review before publishing a privacy notice.',
  verification: 'Confirm reviewed policy text is published and linked wherever personal data is collected.',
  humanReviewRequired: true,
}
```

For projects without the capability, return a single `not-applicable` finding titled `Privacy-notice review not triggered`. For projects with a policy candidate, return a `passed` finding that says only that a candidate was found; it must explicitly state that legal accuracy was not verified.

- [ ] **Step 4: Run launch-essential tests and build**

Run:

```bash
pnpm test tests/checks/launch-essentials.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/checks/launch-essentials.ts tests/checks/launch-essentials.test.ts
git commit -m "feat: add privacy launch-essential check"
```

---

### Task 8: Render honest Markdown and JSON reports

**Files:**
- Create: `src/report/render-json.ts`
- Create: `src/report/render-markdown.ts`
- Create: `tests/report/render-report.test.ts`

**Interfaces:**
- Consumes: `ReadinessReport` and `ReportSummary`.
- Produces: `renderJson(report): string` and `renderMarkdown(report): string`.

- [ ] **Step 1: Write failing report-rendering tests**

Create `tests/report/render-report.test.ts` using a minimal `ReadinessReport` with one failed finding and one unverified finding. Assert that Markdown contains `Stop before launch: 1`, `Unverified: 1`, and the disclaimer. Assert that neither renderer includes `readiness score`, `certified production ready`, or a fake credential value.

Also assert:

```ts
expect(JSON.parse(renderJson(report))).toMatchObject({ schemaVersion: '0.1', partial: true });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/report/render-report.test.ts
```

Expected: FAIL because renderers do not exist.

- [ ] **Step 3: Implement stable JSON output**

Create `src/report/render-json.ts`:

```ts
import type { ReadinessReport } from '../model/report.js';

export function renderJson(report: ReadinessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
```

- [ ] **Step 4: Implement plain-language Markdown output**

Create `src/report/render-markdown.ts` with these fixed sections:

```markdown
# PostVibeClarity launch review

## Summary

## Findings

## Checks performed

## Coverage gaps

## Unverified areas

## Scope

## Important limitation
```

Render action-level, outcome, and check-status counts from `report.summary`; group findings by action level; show check and skill provenance, every check execution, and every check/domain coverage gap; include evidence locations without source snippets; and finish with `report.disclaimer`. Do not infer a verdict from zero blocker findings or from zero findings overall.

- [ ] **Step 5: Run report and build tests**

Run:

```bash
pnpm test tests/report/render-report.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/report tests/report
git commit -m "feat: render evidence-backed review reports"
```

---

### Task 9: Integrate discovery, routing, checks, reporting, and the CLI

**Files:**
- Create: `src/orchestrator/run-review.ts`
- Create: `src/cli.ts`
- Create: `tests/orchestrator/run-review.test.ts`
- Create: `tests/cli/cli.test.ts`

**Interfaces:**
- Consumes: every public interface from Tasks 2 through 8.
- Produces: `runReview(options): Promise<ReadinessReport>` and the `postvibe review` executable.

- [ ] **Step 1: Write the failing end-to-end orchestrator test**

Create `tests/orchestrator/run-review.test.ts`. Use the `web-missing-basics` fixture and a test skill catalog containing both foundation check sidecars. Inject the fixed clock and assert:

```ts
expect(report.manifest.artifacts.map((item) => item.value)).toContain('web');
expect(report.findings.map((item) => item.checkId)).toEqual([
  'launch-essentials.privacy-notice',
  'secret-exposure.scan',
]);
expect(report.summary.byOutcome.failed).toBe(1);
expect(report.summary.byOutcome['likely-issue']).toBe(1);
expect(report.disclaimer).toContain('does not certify');
```

Also inject controlled check implementations to prove that a zero-finding success is recorded as `completed`, a thrown check is recorded as `failed` without discarding prior findings, an unverified result gets a matching gap, uncovered domains get `unverified` gaps, and `partial` is derived from those execution/gap records. Assert every finding carries the routed check and skill versions and the completed report passes `validateReadinessReport`.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/orchestrator/run-review.test.ts
```

Expected: FAIL because `runReview` does not exist.

- [ ] **Step 3: Implement the coordinator**

Create `src/orchestrator/run-review.ts` with this signature:

```ts
export interface RunReviewOptions {
  root: string;
  skillsRoot: string;
  now?: () => string;
  checkImplementations?: readonly CheckImplementation[];
}

export async function runReview(options: RunReviewOptions): Promise<ReadinessReport>
```

The function must:

1. Resolve `root` and `skillsRoot` to absolute paths.
2. Call `discoverProject` with the injected clock.
3. Load and route the catalog.
4. Build a registry containing `secretExposureCheck` and `privacyNoticeCheck`.
5. Build the review plan.
6. Convert unavailable plan items into `unverified` findings and `unavailable` execution/gap records while preserving sidecar provenance.
7. Run ready checks in deterministic `checkId` order and record even a zero-finding success as `completed`.
8. Isolate each thrown check as `failed` with a redacted synthetic finding and gap while retaining all earlier evidence.
9. Record checks producing unverified findings as `unverified` and create matching check gaps.
10. Add an `unverified` coverage gap for every domain with no routed check; do not create synthetic domain findings.
11. Sort findings and gaps deterministically.
12. Compute the summary and derive `partial` from execution and coverage state.
13. Build `runId` as `pvc-` plus the timestamp with non-digits removed.
14. Use toolkit version `0.1.0` and the exact report disclaimer from the design specification.
15. Validate the completed object against `report-0.1.schema.json` and the semantic invariants before returning it.

- [ ] **Step 4: Run the orchestrator test**

Run:

```bash
pnpm test tests/orchestrator/run-review.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing CLI test**

Create `tests/cli/cli.test.ts` to spawn:

```bash
pnpm exec tsx src/cli.ts review fixtures/web-missing-basics --skills tests/fixtures/skills --format json
```

Assert exit code `0`, parse stdout as JSON, and assert that stderr does not contain `fixture-secret-value-never-use`.

- [ ] **Step 6: Implement the CLI**

Use `parseArgs` from `node:util`. Support exactly:

```text
postvibe review [project-path] --skills <skills-path> --format <markdown|json> [--output <directory>]
```

Defaults:

- `project-path`: current working directory
- `--skills`: `<project-path>/skills`
- `--format`: `markdown`
- no `--output`: write the selected format to stdout

When `--output` is present, create the directory and exclusively create `<runId>.md` or `<runId>.json`. If that exact path exists, fail clearly without overwriting it. Print only a newly written output path to stdout. Validation and execution failures go to stderr and set `process.exitCode = 1` without printing stack traces unless `POSTVIBE_DEBUG=1`.

Add `src/cli/report-output.ts` and `tests/cli/report-output.test.ts` to cover real exclusive creation and the no-overwrite collision path.

- [ ] **Step 7: Run CLI, orchestrator, and build tests**

Run:

```bash
pnpm test tests/orchestrator/run-review.test.ts tests/validation/report-schema.test.ts tests/cli/cli.test.ts tests/cli/report-output.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/orchestrator/run-review.ts src/cli.ts src/cli/report-output.ts tests/orchestrator/run-review.test.ts tests/cli
git commit -m "feat: add end-to-end launch review command"
```

---

### Task 10: Package the foundation as portable Agent Skills

**Files:**
- Create: `skills/post-vibe-clarity/SKILL.md`
- Create: `skills/project-discovery/SKILL.md`
- Create: `skills/secret-exposure/SKILL.md`
- Create: `skills/secret-exposure/readiness.yaml`
- Create: `skills/launch-essentials/SKILL.md`
- Create: `skills/launch-essentials/readiness.yaml`
- Create: `tests/skills/foundation-skills.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: the CLI contract and `readiness.yaml` schema from prior tasks.
- Produces: installable standard skills and a repository-level entry guide.

- [ ] **Step 1: Write failing skill-package tests**

Create `tests/skills/foundation-skills.test.ts` to:

1. Load every directory in `skills/`.
2. Parse `SKILL.md` frontmatter.
3. Assert `name` matches the directory and `description` explains what and when.
4. Validate every existing `readiness.yaml`.
5. Assert `SKILL.md` does not contain unconditional prohibited verdict phrases.
6. Assert `post-vibe-clarity` references the discovery, preview, audit, approval, recheck, and report lifecycle.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/skills/foundation-skills.test.ts
```

Expected: FAIL because canonical skills do not exist.

- [ ] **Step 3: Write the main orchestrator and discovery skills**

`skills/post-vibe-clarity/SKILL.md` must:

- Use standard `name`, `description`, `license`, and namespaced metadata.
- Start in read-only discovery mode.
- Preview selected checks and required access.
- Run `postvibe review` when the local tooling is available.
- Provide an instruction-only fallback when the tooling is unavailable.
- Ask separately before any Level 2 or Level 3 action.
- Prohibit Level 4 actions during a normal run.
- Recheck approved changes before reporting resolution.
- Include the report disclaimer.

`skills/project-discovery/SKILL.md` must explain how to inspect artifact types, runtimes, frameworks, services, sensitive capabilities, and verification environments without modifying the project.

- [ ] **Step 4: Write the two specialist skills and sidecars**

Use these sidecars:

`skills/secret-exposure/readiness.yaml`

```yaml
schemaVersion: "0.1"
id: secret-exposure
skillVersion: "0.1.0"
domains:
  - security-privacy
modes:
  - audit
  - verify
maxActionLevel: 0
checks:
  - secret-exposure.scan
```

`skills/launch-essentials/readiness.yaml`

```yaml
schemaVersion: "0.1"
id: launch-essentials
skillVersion: "0.1.0"
domains:
  - policy-business-essentials
  - security-privacy
appliesTo:
  allCapabilities:
    - collects-personal-data
modes:
  - audit
  - propose
  - verify
maxActionLevel: 0
checks:
  - launch-essentials.privacy-notice
```

The specialist `SKILL.md` files must remain independently useful and describe manual verification when deterministic tooling cannot run.

- [ ] **Step 5: Write the repository entry documentation**

Create `README.md` with:

- Name and approved headline promise
- Evidence-not-certification disclaimer
- Current foundation scope
- Supported project-shape architecture
- Requirements: Node.js 24 and pnpm for deterministic tooling
- Local development commands
- Manual project-scoped installation using `.agents/skills`
- Explicit statement that host-specific installation automation belongs to its own implementation plan
- Apache-2.0 license link

- [ ] **Step 6: Run skill validation and the full suite**

Run:

```bash
pnpm test tests/skills/foundation-skills.test.ts
pnpm check
```

Expected: PASS.

- [ ] **Step 7: Run manual fixture smoke tests**

Run:

```bash
pnpm review fixtures/web-missing-basics --skills skills --format markdown
pnpm review fixtures/cli-clean --skills skills --format json
```

Expected:

- The flawed web fixture reports one redacted secret finding and one missing privacy-notice finding.
- The report does not contain `fixture-secret-value-never-use`.
- The clean CLI does not receive the personal-data privacy check through catalog routing.
- Neither output contains a numeric score or unconditional readiness verdict.

- [ ] **Step 8: Commit**

```bash
git add skills tests/skills README.md
git commit -m "feat: package PostVibeClarity foundation skills"
```

---

### Task 11: Add final contract coverage and release verification

**Files:**
- Create: `tests/acceptance/foundation.acceptance.test.ts`
- Create: `docs/foundation-coverage.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the complete foundation vertical slice.
- Produces: an acceptance gate and an explicit coverage map for subsequent implementation plans.

- [ ] **Step 1: Write the acceptance test**

Create `tests/acceptance/foundation.acceptance.test.ts` to run both fixtures through `runReview` and assert all of these invariants:

- Artifact routing is deterministic.
- Unknown or missing check implementations become unverified.
- Secret values are absent from JSON and Markdown.
- The privacy check is capability-driven.
- Reports contain timestamps, toolkit version, skill/check identifiers, and the disclaimer.
- Reports have no numeric readiness score.
- Only Level 0 check implementations are registered in this foundation slice.

- [ ] **Step 2: Run the acceptance test**

Run:

```bash
pnpm test tests/acceptance/foundation.acceptance.test.ts
```

Expected: PASS. If it fails, fix the smallest responsible module and rerun its focused unit test before rerunning acceptance.

- [ ] **Step 3: Document exact foundation coverage**

Create `docs/foundation-coverage.md` with three tables:

1. Implemented and automated: discovery, routing, redacted secret inspection, privacy-notice candidate inspection, Markdown/JSON reporting.
2. Recognized but guided: all remaining project shapes and readiness domains.
3. Not implemented by this plan: remediation engine, full domain catalog, deep artifact packs, provider adapters, agent-specific installers, cross-agent runtime acceptance.

State that missing coverage is reported as unverified and link to the design specification.

- [ ] **Step 4: Add a release verification script**

Add this package script:

```json
"verify:foundation": "pnpm check && pnpm review fixtures/web-missing-basics --skills skills --format json"
```

- [ ] **Step 5: Run final verification**

Run:

```bash
pnpm verify:foundation
git diff --check
git status --short
```

Expected:

- All tests and TypeScript compilation pass.
- The fixture review completes successfully.
- `git diff --check` produces no output.
- `git status --short` shows only the intended Task 11 files.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/acceptance docs/foundation-coverage.md
git commit -m "test: verify PostVibeClarity foundation"
```

## Follow-On Plans

After this foundation is complete and verified, create these separate implementation plans in order:

1. **Universal domain catalog:** Implement the remaining universal checks across all nine readiness domains.
2. **Artifact packs:** Add deep-reference packs for web, backend/API, mobile, and CLI, followed by the remaining artifact types.
3. **Agent distribution:** Build host overlays, install/update/uninstall workflows, and acceptance matrices for Codex, Claude Code, Cursor, GitHub Copilot, Gemini CLI, and generic Agent Skills hosts.
4. **Framework and provider adapters:** Add technology-specific inspection and verification without weakening universal policies.

Each follow-on plan must preserve the contracts and safety invariants established here or explicitly version the relevant schema.
