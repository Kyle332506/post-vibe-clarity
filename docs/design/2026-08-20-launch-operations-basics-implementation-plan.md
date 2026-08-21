# Launch Operations Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one portable `launch-operations` skill with six deterministic repository-only checks and separately approved, one-question-at-a-time written remedies.

**Architecture:** Extend project discovery with conservative operational signals, then route six Level 0 checks through one sidecar. Each check uses a shared bounded document-evidence evaluator and its own applicability, domains, copy, and evidence profile. The CLI remains read-only; cross-agent `SKILL.md` instructions and Markdown templates provide Level 2 guided document creation after exact approval.

**Tech Stack:** TypeScript 5.9, Node.js 24, pnpm 9.12, Vitest 4, YAML, AJV 2020, Markdown skills and templates.

**Spec:** `docs/design/2026-08-20-launch-operations-basics-design.md`

**Plan location:** `docs/design/2026-08-20-launch-operations-basics-implementation-plan.md`

## Global Constraints

- Prepare toolkit release `0.3.0`; do not tag or publish during implementation.
- Package exactly one new skill named `launch-operations` with six check IDs: `release-process`, `rollback-process`, `monitoring-response`, `health-check`, `backup-restore`, and `maintenance-ownership` under the `launch-operations.` namespace.
- Automated audit checks are Level 0 and require only `filesystem-read`.
- Automated checks must not access a network, credential, test account, provider, external service, or production environment.
- Missing, vague, ambiguous, unreadable, or unsupported repository evidence is `unverified`, not `failed` or `likely-issue`.
- Use `likely-issue` only for affirmative repository text matching a narrow, tested risky statement.
- A repository `passed` result never claims that live deployment, monitoring, health, backup, restore, rollback, or recovery works.
- Guided remedies handle one finding and one plain-language question at a time, accept unknown answers, preview the exact file change, and require separate Level 2 approval before writing.
- Guided remedies write Markdown documents only. They never change source, configuration, workflows, infrastructure, external services, staging, commits, or releases.
- Never request, copy, render, or store credentials, private keys, recovery secrets, customer data, or secret endpoint values.
- Default new remedy paths live under `docs/operations/`; preserve an existing project convention and never overwrite silently.
- Preserve the exact disclaimer: `This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.`
- Emit no overall numeric readiness score, unconditional launch verdict, authorship attribution, or emoji.
- Normalize repository evidence locations with `/` on every operating system while retaining valid literal backslashes in POSIX filenames.
- Detection fixtures must be private, must never be installed, and must not declare intentionally vulnerable dependency versions that create false Dependabot alerts.
- Every task follows red-green-refactor, ends with focused passing tests, and commits only its listed files.

## File Structure

### Core interfaces and discovery

- Modify `src/orchestrator/check-registry.ts`: add immutable per-check domain ownership.
- Modify `src/orchestrator/build-review-plan.ts`: carry exact check domains into ready plan items.
- Modify `src/orchestrator/run-review.ts`: freeze and report the per-check domains instead of all skill domains.
- Modify `src/checks/launch-essentials.ts` and `src/checks/secret-exposure.ts`: declare existing exact domains.
- Create `src/discovery/operational-signals.ts`: classify backend, desktop, worker, network-service, and persistent-data evidence.
- Modify `src/discovery/discover-project.ts`: merge conservative operational signals into the manifest.

### Operations check boundary

- Create `src/checks/launch-operations/types.ts`: check IDs, applicability, evidence profile, and evaluation result types.
- Create `src/checks/launch-operations/document-evidence.ts`: bounded deterministic candidate reading and aggregate requirement matching.
- Create `src/checks/launch-operations/applicability.ts`: shape- and capability-aware applicability decisions.
- Create `src/checks/launch-operations/create-check.ts`: common finding construction and evidence-boundary mapping.
- Create six check modules named after their check suffixes.
- Create `src/checks/launch-operations/index.ts`: stable export list used by the registry.

### Portable skill and remedies

- Create `skills/launch-operations/readiness.yaml`.
- Create `skills/launch-operations/SKILL.md`.
- Create six Markdown templates under `skills/launch-operations/templates/`.

### Tests and fixtures

- Modify orchestration and acceptance tests for exact per-check domains.
- Create focused discovery and operations-check test files.
- Add representative private fixtures under `fixtures/operations-*` without installable dependency graphs.
- Extend the existing before-and-after launch candidate with operations documents only in `after`.

### Packaging and public evidence

- Register all six checks in `src/orchestrator/run-review.ts`.
- Update skill-package, catalog, installation, compatibility, homepage, coverage, example, sample-report, and release documentation.
- Update `package.json`, `pnpm-lock.yaml`, and `src/version.ts` coherently to `0.3.0`.

---

### Task 1: Preserve Exact Domains Per Automated Check

**Files:**
- Modify: `src/orchestrator/check-registry.ts`
- Modify: `src/orchestrator/build-review-plan.ts`
- Modify: `src/orchestrator/run-review.ts`
- Modify: `src/checks/launch-essentials.ts`
- Modify: `src/checks/secret-exposure.ts`
- Modify: `tests/orchestrator/build-review-plan.test.ts`
- Modify: `tests/orchestrator/run-review.test.ts`
- Modify: `tests/acceptance/foundation.acceptance.test.ts`

**Interfaces:**
- Produces: `CheckImplementation.domains: readonly Domain[]`.
- Produces: every `ReviewPlanItem` variant carries `domains: readonly Domain[]`.
- Consumers: Tasks 4-8 create new checks with exact domains; report summaries consume ready-item domains.

- [ ] **Step 1: Write failing per-check domain tests**

Add a ready check whose domains are narrower than its parent skill, and assert the review plan and report retain only the check domains:

```ts
const readyCheck: CheckImplementation = {
  id: 'operations-test.release',
  version: '0.1.0',
  domains: ['release-delivery'],
  actionLevel: 0,
  requiredAccess: ['filesystem-read'],
  async run() { return []; },
};

expect(buildReviewPlan([{
  ...auditSkill,
  domains: ['release-delivery', 'operations-observability'],
  checks: [readyCheck.id],
}], new Map([[readyCheck.id, readyCheck]]))).toContainEqual(
  expect.objectContaining({ domains: ['release-delivery'] }),
);
```

In `run-review.test.ts`, use a temporary sidecar with two skill domains and a registered check with one domain. Assert both `checkExecutions[0].domains` and `coverageGaps` use only the check domain. In the deep-freeze acceptance test, assert every registration's `domains` array is frozen and cannot be mutated.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
pnpm vitest run tests/orchestrator/build-review-plan.test.ts tests/orchestrator/run-review.test.ts tests/acceptance/foundation.acceptance.test.ts
```

Expected: TypeScript or assertion failures because `CheckImplementation` and `ReviewPlanItem` do not yet carry exact domains.

- [ ] **Step 3: Add immutable domains to the interfaces and plan**

Implement the interface and ready-plan mapping:

```ts
// src/orchestrator/check-registry.ts
import type { Domain, Finding } from '../model/finding.js';

export interface CheckImplementation {
  readonly id: string;
  readonly version: string;
  readonly domains: readonly Domain[];
  readonly actionLevel: 0 | 1 | 2 | 3 | 4;
  readonly requiredAccess: readonly RequiredAccess[];
  readonly run: (context: CheckContext) => Promise<Finding[]>;
}
```

```ts
// src/orchestrator/build-review-plan.ts
export type ReviewPlanItem =
  | { checkId: string; checkVersion: string; skillId: string; skillVersion: string; domains: readonly Domain[]; status: 'ready'; actionLevel: 0 | 1; requiredAccess: readonly RequiredAccess[] }
  | { checkId: string; checkVersion: 'unknown'; skillId: string; skillVersion: string; domains: readonly Domain[]; status: 'unavailable'; reason: string };
```

Ready items use `implementation.domains`; unavailable items use `skill.domains` because no implementation exists.

- [ ] **Step 4: Freeze and consume exact domains**

Update registration freezing and report construction:

```ts
return Object.freeze({
  id: implementation.id,
  version: implementation.version,
  domains: Object.freeze([...implementation.domains]),
  actionLevel: implementation.actionLevel,
  requiredAccess: Object.freeze([...implementation.requiredAccess]),
  run,
});
```

Use `item.domains` in unavailable/failed findings, check executions, and check-specific coverage gaps. Add exact domains to existing checks:

```ts
// privacyNoticeCheck
domains: ['policy-business-essentials', 'security-privacy'],

// secretExposureCheck
domains: ['security-privacy'],
```

Add the same field to every typed test check literal found by:

```bash
rg -n "CheckImplementation|checkImplementations:" tests
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm vitest run tests/orchestrator/build-review-plan.test.ts tests/orchestrator/run-review.test.ts tests/acceptance/foundation.acceptance.test.ts
```

Expected: PASS, including deep immutability and exact-domain assertions.

Commit only the Task 1 files:

```bash
git add -- src/orchestrator/check-registry.ts src/orchestrator/build-review-plan.ts src/orchestrator/run-review.ts src/checks/launch-essentials.ts src/checks/secret-exposure.ts tests/orchestrator/build-review-plan.test.ts tests/orchestrator/run-review.test.ts tests/acceptance/foundation.acceptance.test.ts
git commit -m "refactor: preserve exact check domains"
```

### Task 2: Discover Conservative Operational Signals

**Files:**
- Create: `src/discovery/operational-signals.ts`
- Modify: `src/discovery/discover-project.ts`
- Create: `tests/discovery/operational-signals.test.ts`
- Modify: `tests/discovery/discover-project.test.ts`
- Create: `fixtures/operations-backend/package.json`
- Create: `fixtures/operations-backend/src/server.ts`
- Create: `fixtures/operations-backend/prisma/schema.prisma`
- Create: `fixtures/operations-desktop/package.json`
- Create: `fixtures/operations-worker/package.json`
- Create: `fixtures/operations-worker/src/worker.ts`
- Modify: `fixtures/expo-mobile/package.json`

**Interfaces:**
- Produces: `OperationalSignals`.
- Produces: `discoverOperationalSignals(files, dependencies): OperationalSignals`.
- Produces capabilities: `network-service` and `persistent-data`.
- Consumers: Task 3 applicability and all conditional operations checks.

- [ ] **Step 1: Write the signal matrix tests**

Use direct unit inputs so false-positive boundaries are explicit:

```ts
const cases = [
  {
    name: 'backend service',
    files: ['package.json', 'src/server.ts'],
    dependencies: new Set(['fastify']),
    artifacts: ['backend'],
    capabilities: ['network-service'],
  },
  {
    name: 'desktop app',
    files: ['package.json', 'src/main.ts'],
    dependencies: new Set(['electron']),
    artifacts: ['desktop'],
    capabilities: [],
  },
  {
    name: 'worker',
    files: ['package.json', 'src/worker.ts'],
    dependencies: new Set<string>(),
    artifacts: ['worker'],
    capabilities: [],
  },
  {
    name: 'persistent data',
    files: ['package.json', 'prisma/schema.prisma'],
    dependencies: new Set<string>(),
    artifacts: [],
    capabilities: ['persistent-data'],
  },
] as const;

for (const example of cases) {
  it(`detects ${example.name}`, () => {
    const result = discoverOperationalSignals(example.files, example.dependencies);
    expect(result.artifacts.map(({ value }) => value)).toEqual(example.artifacts);
    expect(result.capabilities.map(({ value }) => value)).toEqual(example.capabilities);
  });
}
```

Also assert that React alone, a generic `data.ts`, and a test-only `worker.test.ts` do not trigger operational capabilities.

- [ ] **Step 2: Run the focused discovery tests and confirm RED**

Run:

```bash
pnpm vitest run tests/discovery/operational-signals.test.ts tests/discovery/discover-project.test.ts
```

Expected: FAIL because `operational-signals.ts` and the new manifest signals do not exist.

- [ ] **Step 3: Implement the deterministic signal classifier**

Create the exact public boundary:

```ts
import type { ArtifactType, Detection } from '../model/capability.js';

export interface OperationalSignals {
  artifacts: Detection<ArtifactType>[];
  capabilities: Detection<string>[];
}

export function discoverOperationalSignals(
  files: readonly string[],
  dependencies: ReadonlySet<string>,
): OperationalSignals {
  // Return stable, evidence-backed detections from the versioned tables below.
}
```

Use these initial exact dependency tables:

```ts
const backendDependencies = new Set(['express', 'fastify', 'koa', 'hapi', '@hapi/hapi', '@nestjs/core']);
const desktopDependencies = new Set(['electron', '@tauri-apps/api']);
const workerDependencies = new Set(['bullmq', 'agenda', 'bee-queue']);
const persistentDataDependencies = new Set([
  '@prisma/client', 'prisma', 'pg', 'mysql2', 'mongoose', 'mongodb',
  'better-sqlite3', 'sqlite3', 'drizzle-orm', 'sequelize', 'typeorm',
]);
```

Use anchored repository path signals for `src/server.*`, `server.*`, `api/`, `prisma/schema.prisma`, `schema.sql`, `migrations/`, `src/worker.*`, `worker.*`, and `cron/`. Exclude test/spec/story/example paths before matching. Dependency-only signals use `package.json` evidence. Filename-only backend, worker, and `schema.sql` signals are `likely`; dependency-backed signals are `confirmed`.

- [ ] **Step 4: Merge signals without duplicate manifest values**

In `discover-project.ts`, call the helper after building the dependency set. Merge detections by value while keeping the first existing detection:

```ts
function appendUnique<T extends string>(target: Detection<T>[], additions: readonly Detection<T>[]): void {
  const values = new Set(target.map(({ value }) => value));
  for (const item of additions) {
    if (!values.has(item.value)) {
      target.push(item);
      values.add(item.value);
    }
  }
}
```

Return operational capabilities together with the existing `collects-personal-data` capability. Keep manifest ordering deterministic by discovery rule order.

- [ ] **Step 5: Add representative fixtures and integration assertions**

Fixture package manifests must contain `"private": true` and use non-vulnerable sentinel ranges such as `"999.0.0-fixture"`; tests never install them. Change the existing Expo detection fixture from `0.0.0-fixture` to `999.0.0-fixture` so a detection-only manifest cannot reopen the dismissed advisory. Assert the backend fixture produces `backend`, `network-service`, and `persistent-data`; desktop produces `desktop`; worker produces `worker` without a network-service capability.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm vitest run tests/discovery/operational-signals.test.ts tests/discovery/discover-project.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- src/discovery/operational-signals.ts src/discovery/discover-project.ts tests/discovery/operational-signals.test.ts tests/discovery/discover-project.test.ts fixtures/operations-backend fixtures/operations-desktop fixtures/operations-worker fixtures/expo-mobile/package.json
git commit -m "feat: discover operational project signals"
```

### Task 3: Build the Bounded Document-Evidence Evaluator

**Files:**
- Create: `src/checks/launch-operations/types.ts`
- Create: `src/checks/launch-operations/document-evidence.ts`
- Create: `tests/checks/launch-operations/document-evidence.test.ts`

**Interfaces:**
- Produces: `OperationsCheckId`, `EvidenceRequirement`, `DocumentEvidenceProfile`, and `DocumentEvidenceResult`.
- Produces: `evaluateDocumentEvidence(root, excludedArtifactPaths, profile): Promise<DocumentEvidenceResult>`.
- Consumers: Tasks 4-7 use this evaluator without reading files themselves.

- [ ] **Step 1: Write failing evaluator tests**

Create temporary repositories and cover these exact cases:

```ts
const profile: DocumentEvidenceProfile = {
  candidatePaths: [/(?:^|\/)deploy(?:ment)?\.md$/iu],
  requirements: [
    { id: 'target', patterns: [/\b(?:production|staging|registry)\b/iu] },
    { id: 'procedure', patterns: [/^\s*\d+[.)]\s+\S/mu] },
    { id: 'verification', patterns: [/\b(?:verify|smoke test|confirm)\b/iu] },
  ],
  riskPatterns: [],
};
```

Assert:

- two files may collectively satisfy all requirements;
- a filename with empty or irrelevant content is `insufficient`;
- no candidate is `missing`;
- a file over 131,072 bytes is not read and creates an unverified boundary;
- NUL-containing content is rejected as unsupported binary content;
- excluded paths, `node_modules`, `.git`, `.postvibe`, `coverage`, and `dist` never contribute;
- symlinks and non-regular files never contribute;
- Windows-style input locations render with `/`;
- literal backslashes in POSIX filenames are not rewritten; and
- only relative evidence locations and concise summaries are returned, never source content.

- [ ] **Step 2: Run the evaluator test and confirm RED**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/document-evidence.test.ts
```

Expected: FAIL because the evaluator modules do not exist.

- [ ] **Step 3: Define the exact types and limits**

```ts
import type { Evidence } from '../../model/finding.js';

export type OperationsCheckId =
  | 'launch-operations.release-process'
  | 'launch-operations.rollback-process'
  | 'launch-operations.monitoring-response'
  | 'launch-operations.health-check'
  | 'launch-operations.backup-restore'
  | 'launch-operations.maintenance-ownership';

export interface EvidenceRequirement {
  id: string;
  patterns: readonly RegExp[];
}

export interface DocumentEvidenceProfile {
  candidatePaths: readonly RegExp[];
  requirements: readonly EvidenceRequirement[];
  riskPatterns: readonly RegExp[];
}

export interface DocumentEvidenceResult {
  status: 'usable' | 'insufficient' | 'missing';
  evidence: Evidence[];
  riskEvidence: Evidence[];
  matchedRequirementIds: string[];
  missingRequirementIds: string[];
  unverifiedBoundaries: string[];
}
```

Export `MAX_OPERATIONS_EVIDENCE_BYTES = 131_072` and a supported extension set containing `.md`, `.mdx`, `.txt`, `.json`, `.yaml`, `.yml`, and `.toml`.

- [ ] **Step 4: Implement bounded deterministic evaluation**

Use `listProjectFiles`, then filter path candidates and supported extensions before calling `stat` and `readFile`. Reject non-files, oversized files, and NUL content. Aggregate requirements across all safely read candidates. Build evidence only for candidates that match at least one requirement or risk pattern:

```ts
const matched = new Set<string>();
const evidence: Evidence[] = [];
const riskEvidence: Evidence[] = [];

for (const location of candidates) {
  const content = await readBoundedCandidate(root, location);
  if (!content.ok) {
    boundaries.push(content.boundary);
    continue;
  }
  const requirementMatches = profile.requirements.filter(({ patterns }) =>
    patterns.some((pattern) => pattern.test(content.value)),
  );
  for (const requirement of requirementMatches) matched.add(requirement.id);
  if (requirementMatches.length > 0) {
    evidence.push({ kind: 'file', location, summary: 'Repository operations evidence matched the versioned content profile.' });
  }
  if (profile.riskPatterns.some((pattern) => pattern.test(content.value))) {
    riskEvidence.push({ kind: 'file', location, summary: 'Repository text explicitly describes the check-specific risky condition.' });
  }
}
```

Create fresh RegExp instances or reset `lastIndex` before every test so a global or sticky pattern cannot make results stateful. Sort evidence, requirement IDs, and boundaries with `compareOrdinal`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/document-evidence.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- src/checks/launch-operations/types.ts src/checks/launch-operations/document-evidence.ts tests/checks/launch-operations/document-evidence.test.ts
git commit -m "feat: evaluate bounded operations evidence"
```

### Task 4: Add Shape-Aware Applicability and Finding Construction

**Files:**
- Create: `src/checks/launch-operations/applicability.ts`
- Create: `src/checks/launch-operations/create-check.ts`
- Create: `tests/checks/launch-operations/applicability.test.ts`
- Create: `tests/checks/launch-operations/create-check.test.ts`

**Interfaces:**
- Produces: `OperationsApplicability` and `selectOperationsApplicability(checkId, manifest)`.
- Produces: `OperationsCheckDefinition` and `createOperationsCheck(definition)`.
- Consumers: Tasks 5-7 define all six checks as data, not duplicated orchestration code.

- [ ] **Step 1: Write the applicability matrix test**

Build manifests with artifact and capability values, then assert this table:

```ts
const expected = {
  webService: {
    release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
    health: 'applicable', backup: 'not-applicable', ownership: 'applicable',
  },
  backendWithData: {
    release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
    health: 'applicable', backup: 'applicable', ownership: 'applicable',
  },
  mobile: {
    release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
    health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
  },
  cli: {
    release: 'applicable', rollback: 'applicable', monitoring: 'not-applicable',
    health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
  },
  library: {
    release: 'applicable', rollback: 'applicable', monitoring: 'not-applicable',
    health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
  },
  ambiguous: {
    release: 'applicable', rollback: 'applicable', monitoring: 'unverified',
    health: 'unverified', backup: 'unverified', ownership: 'applicable',
  },
} as const;
```

`webService` includes `network-service`; `backendWithData` includes both `network-service` and `persistent-data`.

- [ ] **Step 2: Write factory behavior tests**

Use a minimal definition and assert:

- not applicable produces one `not-applicable` finding without scanning files;
- ambiguous applicability produces one `unverified` finding;
- missing and insufficient evidence produce `unverified` with `resolve-before-launch`;
- usable evidence produces `passed` with the live boundary;
- explicit risk evidence produces `likely-issue` only when `definition.risk` exists;
- finding `domains`, versions, IDs, access, and summaries are stable; and
- no returned string contains candidate file contents.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/applicability.test.ts tests/checks/launch-operations/create-check.test.ts
```

Expected: FAIL because the applicability and factory modules do not exist.

- [ ] **Step 4: Implement applicability**

```ts
export interface OperationsApplicability {
  status: 'applicable' | 'not-applicable' | 'unverified';
  profile: 'service' | 'worker' | 'mobile-desktop' | 'cli' | 'library' | 'ambiguous';
  reason: string;
}
```

Release, rollback, and ownership are universally applicable. Monitoring applies to web, backend, worker, mobile, and desktop. Health applies only with `network-service`. Backup applies only with `persistent-data`. If the manifest has no recognized artifact, shape-dependent checks are unverified rather than not applicable.

- [ ] **Step 5: Implement the check factory**

Define the data boundary:

```ts
export interface OperationsCheckDefinition {
  id: OperationsCheckId;
  label: string;
  domains: readonly Domain[];
  actionLevel: ActionLevel;
  profile: (manifest: CapabilityManifest) => DocumentEvidenceProfile;
  recommendation: string;
  verification: string;
  liveBoundary: string;
  risk?: { title: string; impact: string; actionLevel: ActionLevel };
}

export function createOperationsCheck(definition: OperationsCheckDefinition): CheckImplementation {
  return {
    id: definition.id,
    version: '0.1.0',
    domains: definition.domains,
    actionLevel: 0,
    requiredAccess: ['filesystem-read'],
    async run(context) {
      // Select applicability, evaluate evidence only when applicable,
      // and map the exact result state to one sanitized Finding.
    },
  };
}
```

Use skill version `0.1.0`. Finding IDs end in `.passed`, `.unverified`, `.not-applicable`, or `.likely-issue`. `humanReviewRequired` is true for unverified and likely-issue results and false for repository-evidence passes and not-applicable results. The current report schema allows `unverifiedBoundaries` on every outcome, so every pass includes `liveBoundary` there. Add a report-schema regression test that validates a passed finding with that live boundary.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/applicability.test.ts tests/checks/launch-operations/create-check.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- src/checks/launch-operations/applicability.ts src/checks/launch-operations/create-check.ts tests/checks/launch-operations/applicability.test.ts tests/checks/launch-operations/create-check.test.ts
git commit -m "feat: classify operations check applicability"
```

### Task 5: Implement Release and Maintenance Ownership Checks

**Files:**
- Create: `src/checks/launch-operations/release-process.ts`
- Create: `src/checks/launch-operations/maintenance-ownership.ts`
- Create: `tests/checks/launch-operations/universal-checks.test.ts`

**Interfaces:**
- Produces: `releaseProcessCheck`.
- Produces: `maintenanceOwnershipCheck`.
- Consumers: Task 8 registry and catalog acceptance.

- [ ] **Step 1: Write failing universal-check tests**

For both checks, create temporary repositories covering missing, filename-only, usable distributed evidence, and excluded evidence. Use these complete content expectations:

```md
# Release and deployment

Target: production environment.
Prerequisites: obtain the approved release revision and required access through the documented credential process.
1. Build the release artifact.
2. Publish it to the production target.
Verification: run the documented smoke test and confirm the expected version.
Owner: Release Maintainer.
```

```md
# Maintenance ownership

Owner: Project Maintainers.
Support route: repository issues.
Review cadence: dependency and platform updates are reviewed monthly.
Handoff: update this document and CODEOWNERS before ownership changes.
```

Assert that a CLI or library receives publishing language in applicability, while a service receives deployment language. Missing release evidence is `unverified`/`resolve-before-launch`; missing ownership is `unverified`/`plan-soon`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/universal-checks.test.ts
```

Expected: FAIL because both check modules are missing.

- [ ] **Step 3: Implement the release evidence profile**

Use candidate paths for deployment, release, publish, distribution, operations, and runbook documents plus `.github/workflows/*.yml`. Require all six IDs:

```ts
const releaseRequirements: readonly EvidenceRequirement[] = [
  { id: 'artifact', patterns: [/\b(?:artifact|application|service|package|binary|mobile app|desktop app)\b/iu] },
  { id: 'target', patterns: [/\b(?:production|staging|registry|app store|play store|distribution channel|deployment target)\b/iu] },
  { id: 'prerequisites', patterns: [/\b(?:prerequisite|required access|before (?:release|deploy|publish)|approved revision)\b/iu] },
  { id: 'procedure', patterns: [/^\s*(?:\d+[.)]|[-*]\s+\[[ xX]\])\s+\S/mu] },
  { id: 'verification', patterns: [/\b(?:verification|verify|smoke test|confirm the expected version|post-release)\b/iu] },
  { id: 'owner', patterns: [/\b(?:owner|responsible|maintainer|release team)\s*:/iu] },
];
```

The release check has domains `['release-delivery']`, a live boundary stating that no deployment, registry, or store was queried, and no affirmative-risk pattern in this wave.

- [ ] **Step 4: Implement the ownership profile**

Require owner, support route, review expectation, and handoff. Candidate paths include `CODEOWNERS`, `MAINTAINERS*`, `SUPPORT*`, and operations/ownership documents. The check has domains `['maintainability-change-safety']`, action level `plan-soon`, and no risk pattern.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/universal-checks.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- src/checks/launch-operations/release-process.ts src/checks/launch-operations/maintenance-ownership.ts tests/checks/launch-operations/universal-checks.test.ts
git commit -m "feat: check release and maintenance evidence"
```

### Task 6: Implement Rollback and Monitoring Response Checks

**Files:**
- Create: `src/checks/launch-operations/rollback-process.ts`
- Create: `src/checks/launch-operations/monitoring-response.ts`
- Create: `tests/checks/launch-operations/runtime-checks.test.ts`

**Interfaces:**
- Produces: `rollbackProcessCheck`.
- Produces: `monitoringResponseCheck`.
- Consumers: Task 8 registry and acceptance.

- [ ] **Step 1: Write failing runtime-check tests**

Test service, mobile, CLI, library, and ambiguous manifests. Include these usable documents:

```md
# Rollback and recovery

Trigger: roll back when the release health verification fails.
Decision owner: Incident Lead.
1. Stop the rollout.
2. Restore the previously approved version.
Verification: repeat the health verification and confirm the expected version.
```

```md
# Monitoring and incident response

Signals: application errors and failed requests.
Review location: the configured monitoring dashboard.
Notification expectation: the maintainer reviews a new high-severity alert promptly.
1. Triage the affected release and capture the failure time.
2. Follow the rollback guide when impact continues.
Owner: On-call Maintainer.
```

Assert mobile evidence accepts `stop the rollout` or `ship a corrective release` and does not require instant app-store rollback. CLI and library monitoring is not applicable. The exact risky phrases `there is no rollback path`, `rollback is impossible`, and `we do not have a recovery path` produce `likely-issue`; mere absence remains unverified.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/runtime-checks.test.ts
```

Expected: FAIL because the check modules are missing.

- [ ] **Step 3: Implement rollback profiles**

Require trigger, mechanism, decision owner, ordered procedure, and verification. Use shape-specific mechanism patterns:

```ts
const serviceRecovery = /\b(?:restore|redeploy|previous(?:ly approved)? version|roll back|rollback)\b/iu;
const mobileDesktopRecovery = /\b(?:stop (?:the )?rollout|phased release|corrective release|supported version|disable (?:the )?feature)\b/iu;
const packageRecovery = /\b(?:deprecate|unpublish|previous version|corrective release|version withdrawal)\b/iu;
```

Domains are `['reliability-recovery', 'release-delivery']`. The live boundary states that no release was changed and no recovery procedure was run.

- [ ] **Step 4: Implement monitoring profiles**

Require signals, review location, notification expectation, first response steps, and owner. Accept crash-reporting language for mobile and desktop. Domains are `['operations-observability']`. The live boundary states that no provider was queried and no alert delivery or response was tested.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/runtime-checks.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- src/checks/launch-operations/rollback-process.ts src/checks/launch-operations/monitoring-response.ts tests/checks/launch-operations/runtime-checks.test.ts
git commit -m "feat: check rollback and monitoring evidence"
```

### Task 7: Implement Health and Backup-Restore Checks

**Files:**
- Create: `src/checks/launch-operations/health-check.ts`
- Create: `src/checks/launch-operations/backup-restore.ts`
- Modify: `src/checks/launch-operations/document-evidence.ts`
- Modify: `tests/checks/launch-operations/document-evidence.test.ts`
- Create: `tests/checks/launch-operations/data-service-checks.test.ts`

**Interfaces:**
- Produces: `healthCheck`.
- Produces: `backupRestoreCheck`.
- Consumers: Task 8 registry and acceptance.

- [ ] **Step 1: Write failing conditional-check tests**

Build manifests with and without `network-service` and `persistent-data`. Test these usable documents:

```md
# Health check

Probe: GET /health.
Healthy result: HTTP 200 with status ok.
Coverage: the probe checks process availability but does not verify every dependency.
Failure handling: the monitoring system notifies the on-call maintainer.
Owner: On-call Maintainer.
```

```md
# Backup and restore

Data: the primary application database.
Backup mechanism: provider-managed encrypted snapshots.
Frequency: every 24 hours; acceptable data loss is 24 hours.
Retention: 30 days.
1. Select an approved snapshot in the recovery environment.
2. Restore it using the provider procedure referenced in the private operations system.
Recovery time expectation: four hours.
Owner: Data Recovery Maintainer.
Failure notification: backup-job failures notify the owner.
Restore testing: test quarterly in a non-production recovery environment.
Boundaries: live backup configuration and credentials are not stored here.
```

Assert no endpoint is called and no command is run. Exact phrases `backups are disabled`, `we do not back up this data`, and `there is no restore path` produce `likely-issue`; missing documents remain unverified.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/data-service-checks.test.ts
```

Expected: FAIL because the check modules are missing.

- [ ] **Step 3: Implement health evidence**

Require probe, expected result, coverage boundary, failure surfacing, and owner. Candidate paths include health/readiness/liveness documents, operations/runbooks, deployment configuration, and narrowly relevant source paths containing a complete `health`, `readiness`, or `liveness` path segment or basename. Add `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.kt`, and `.swift` to the evaluator's supported set in this task. Add a regression proving a generic source file such as `src/live-chat.ts` is not a candidate merely because its basename contains `live` as a substring. Do not scan every source file.

Domains are `['reliability-recovery', 'operations-observability']`. The live boundary states that the endpoint or probe was not executed.

- [ ] **Step 4: Implement backup and restore evidence**

Require data identification, mechanism, frequency or recovery-point expectation, retention, restore steps/reference, recovery-time expectation, owner, failure notification, restoration-test schedule, and boundaries. Domains are `['data-correctness', 'reliability-recovery']`. The live boundary states that no backup or restoration was observed or tested.

Risk regexes must match only the three exact affirmative forms tested in Step 1 plus insignificant whitespace and punctuation variations. Do not match general discussion such as `what happens if there is no restore path?` unless the sentence affirmatively describes the current project.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm vitest run tests/checks/launch-operations/data-service-checks.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- src/checks/launch-operations/health-check.ts src/checks/launch-operations/backup-restore.ts src/checks/launch-operations/document-evidence.ts tests/checks/launch-operations/document-evidence.test.ts tests/checks/launch-operations/data-service-checks.test.ts
git commit -m "feat: check health and recovery evidence"
```

### Task 8: Package, Register, Route, and Report the Six Checks

**Files:**
- Create: `src/checks/launch-operations/index.ts`
- Create: `skills/launch-operations/readiness.yaml`
- Modify: `src/orchestrator/run-review.ts`
- Modify: `tests/catalog/catalog.test.ts`
- Modify: `tests/catalog/route-skills.test.ts`
- Modify: `tests/acceptance/foundation.acceptance.test.ts`
- Create: `tests/acceptance/launch-operations.acceptance.test.ts`

**Interfaces:**
- Produces: `launchOperationsChecks: readonly CheckImplementation[]`.
- Produces one sidecar with six check IDs and four operation-related domains.
- Consumers: CLI review, verified report construction, example generation, and public coverage docs.

- [ ] **Step 1: Write failing catalog and acceptance tests**

Assert the sidecar loads with:

```yaml
schemaVersion: "0.1"
id: launch-operations
skillVersion: "0.1.0"
domains:
  - data-correctness
  - reliability-recovery
  - operations-observability
  - maintainability-change-safety
  - release-delivery
modes:
  - audit
  - propose
  - remediate
  - verify
maxActionLevel: 2
checks:
  - launch-operations.release-process
  - launch-operations.rollback-process
  - launch-operations.monitoring-response
  - launch-operations.health-check
  - launch-operations.backup-restore
  - launch-operations.maintenance-ownership
```

The skill has no `appliesTo` restriction so universal checks route even for ambiguous manifests. Acceptance assertions must prove:

- six registered checks are Level 0 and filesystem-read-only;
- each check execution uses its exact implementation domains from Task 1;
- a web data service routes all six with conditional states;
- a CLI routes release, rollback, and ownership while monitoring, health, and backup return not applicable;
- one unverified check does not prevent other checks from completing;
- the report stays partial while any applicable check is unverified; and
- Markdown and JSON contain repository-only boundaries and the exact disclaimer.

- [ ] **Step 2: Run focused integration tests and confirm RED**

Run:

```bash
pnpm vitest run tests/catalog/catalog.test.ts tests/catalog/route-skills.test.ts tests/acceptance/foundation.acceptance.test.ts tests/acceptance/launch-operations.acceptance.test.ts
```

Expected: FAIL because the skill sidecar, export list, and registrations are absent.

- [ ] **Step 3: Add the stable export list and sidecar**

```ts
import type { CheckImplementation } from '../../orchestrator/check-registry.js';
import { backupRestoreCheck } from './backup-restore.js';
import { healthCheck } from './health-check.js';
import { maintenanceOwnershipCheck } from './maintenance-ownership.js';
import { monitoringResponseCheck } from './monitoring-response.js';
import { releaseProcessCheck } from './release-process.js';
import { rollbackProcessCheck } from './rollback-process.js';

export const launchOperationsChecks: readonly CheckImplementation[] = Object.freeze([
  backupRestoreCheck,
  healthCheck,
  maintenanceOwnershipCheck,
  monitoringResponseCheck,
  releaseProcessCheck,
  rollbackProcessCheck,
]);
```

Keep this array ordinal by check ID so report order is deterministic.

- [ ] **Step 4: Register the checks through the existing freeze boundary**

Import `launchOperationsChecks` in `run-review.ts` and spread them into `foundationCheckImplementations` before freezing the outer array. Do not bypass `freezeRegistration`.

Update foundation acceptance expectations from two to eight Level 0 implementations. Replace index-based mutation setup with lookup by check ID so future additions do not make the immutability test fragile.

- [ ] **Step 5: Run focused integration tests and commit**

Run:

```bash
pnpm vitest run tests/catalog/catalog.test.ts tests/catalog/route-skills.test.ts tests/acceptance/foundation.acceptance.test.ts tests/acceptance/launch-operations.acceptance.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- src/checks/launch-operations/index.ts skills/launch-operations/readiness.yaml src/orchestrator/run-review.ts tests/catalog/catalog.test.ts tests/catalog/route-skills.test.ts tests/acceptance/foundation.acceptance.test.ts tests/acceptance/launch-operations.acceptance.test.ts
git commit -m "feat: route launch operations checks"
```

### Task 9: Add the Cross-Agent Guided Remedy Skill and Templates

**Files:**
- Create: `skills/launch-operations/SKILL.md`
- Create: `skills/launch-operations/templates/release-and-deployment.md`
- Create: `skills/launch-operations/templates/rollback-and-recovery.md`
- Create: `skills/launch-operations/templates/monitoring-and-incident-response.md`
- Create: `skills/launch-operations/templates/health-check.md`
- Create: `skills/launch-operations/templates/backup-and-restore.md`
- Create: `skills/launch-operations/templates/maintenance-ownership.md`
- Modify: `tests/skills/foundation-skills.test.ts`
- Create: `tests/skills/launch-operations-remedies.test.ts`

**Interfaces:**
- Produces: one portable skill with audit, propose, remediate, and verify instructions.
- Produces: six reusable Markdown remedy templates with confirmed facts, procedures, ownership, test cadence, unresolved decisions, and evidence boundaries.
- Consumers: Codex, Claude Code, Cursor, Windsurf, and generic Agent Skills hosts after installation.

- [ ] **Step 1: Write failing package and remedy-contract tests**

Add `launch-operations` to `expectedSkills` and `skillsWithSidecars`. Assert `SKILL.md` contains these exact behavioral contracts:

```ts
for (const phrase of [
  'one finding at a time',
  'one question at a time',
  "I don't know",
  'exact target path',
  'explicit approval',
  'Level 2',
  'fresh repository check',
  'does not prove',
]) expect(body).toContain(phrase);
```

Assert it prohibits credentials, private keys, recovery secrets, customer data, source/config/workflow changes, external services, staging, committing, and publishing. Assert all six templates exist, contain no emoji or attribution, and include `## Confirmed facts`, `## Procedure`, `## Ownership`, `## Verification cadence`, `## Unresolved decisions`, and `## Evidence boundary` where applicable.

Assert the backup question order exactly covers data, location, acceptable loss, recovery time, mechanism, retention, owner, restore steps, test frequency, and failure notification.

- [ ] **Step 2: Run skill tests and confirm RED**

Run:

```bash
pnpm vitest run tests/skills/foundation-skills.test.ts tests/skills/launch-operations-remedies.test.ts
```

Expected: FAIL because the skill instructions and templates do not exist.

- [ ] **Step 3: Write the portable guided workflow**

`SKILL.md` frontmatter must be:

```yaml
---
name: launch-operations
description: Use when reviewing repository evidence for releases, rollback, monitoring, health checks, backups, restoration, or maintenance ownership and when drafting one approved operational runbook at a time.
license: Apache-2.0
metadata:
  postvibeclarity.dev/role: specialist
  postvibeclarity.dev/version: "0.1.0"
---
```

The body must define these phases in order:

1. read the latest audit and select one finding;
2. explain applicability and the repository-only boundary;
3. load only that finding's template and question set;
4. ask one question at a time and preserve unknowns;
5. refuse secrets and redirect to secret-manager references or role names;
6. preview exact target, outline, facts, unknowns, effect, remaining live gaps, and recheck;
7. obtain exact Level 2 approval;
8. write only the approved Markdown file or bounded update;
9. show the diff without staging or committing; and
10. run the fresh relevant check and report passed or unverified honestly.

- [ ] **Step 4: Write concrete templates**

Each template starts with a title and `Status: Draft until reviewed by the named owner.` Templates use descriptive prompts in HTML comments only when loaded for guided authoring; the final guided write removes answered comments and converts unanswered required items into explicit `Unresolved decision:` lines. No template contains a provider-specific claim.

The backup template must include repository-safe fields for recovery-point expectation and recovery-time expectation, with plain-language explanations in the skill rather than unexplained acronyms.

- [ ] **Step 5: Run skill tests and commit**

Run:

```bash
pnpm vitest run tests/skills/foundation-skills.test.ts tests/skills/launch-operations-remedies.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- skills/launch-operations/SKILL.md skills/launch-operations/templates tests/skills/foundation-skills.test.ts tests/skills/launch-operations-remedies.test.ts
git commit -m "feat: guide written operations remedies"
```

### Task 10: Demonstrate Before-and-After Operations Evidence

**Files:**
- Create: `examples/launch-candidate/before/data/schema.sql`
- Create: `examples/launch-candidate/after/data/schema.sql`
- Create: `examples/launch-candidate/after/docs/operations/release-and-deployment.md`
- Create: `examples/launch-candidate/after/docs/operations/rollback-and-recovery.md`
- Create: `examples/launch-candidate/after/docs/operations/monitoring-and-incident-response.md`
- Create: `examples/launch-candidate/after/docs/operations/health-check.md`
- Create: `examples/launch-candidate/after/docs/operations/backup-and-restore.md`
- Create: `examples/launch-candidate/after/docs/operations/maintenance-ownership.md`
- Modify: `examples/launch-candidate/README.md`
- Modify: `tests/acceptance/example-projects.acceptance.test.ts`
- Modify: `tests/repository/foundation-coverage.test.ts`

**Interfaces:**
- Produces: a real before project with operations gaps and an after project with usable written evidence.
- Consumers: Task 12 sample-report regeneration and homepage documentation.

- [ ] **Step 1: Write failing example acceptance assertions**

Run read-only reviews on both examples and assert:

```ts
const operationsOutcomes = (report: ReadinessReport) => Object.fromEntries(
  report.findings
    .filter(({ checkId }) => checkId.startsWith('launch-operations.'))
    .map(({ checkId, outcome }) => [checkId, outcome]),
);

expect(operationsOutcomes(beforeReport)).toMatchObject({
  'launch-operations.release-process': 'unverified',
  'launch-operations.rollback-process': 'unverified',
  'launch-operations.monitoring-response': 'unverified',
  'launch-operations.health-check': 'unverified',
  'launch-operations.backup-restore': 'unverified',
  'launch-operations.maintenance-ownership': 'unverified',
});
expect(operationsOutcomes(afterReport)).toMatchObject({
  'launch-operations.release-process': 'passed',
  'launch-operations.rollback-process': 'passed',
  'launch-operations.monitoring-response': 'passed',
  'launch-operations.health-check': 'passed',
  'launch-operations.backup-restore': 'passed',
  'launch-operations.maintenance-ownership': 'passed',
});
```

Copy both examples to temporary directories before review and assert recursive snapshots are unchanged afterward.

- [ ] **Step 2: Run the example tests and confirm RED**

Run:

```bash
pnpm vitest run tests/acceptance/example-projects.acceptance.test.ts tests/repository/foundation-coverage.test.ts
```

Expected: FAIL because the examples do not contain operational evidence.

- [ ] **Step 3: Add an exact demonstration-only persistent-data signal**

Keep the example dependency-free and leave runtime behavior unchanged. Add the same `data/schema.sql` file to both versions:

```sql
CREATE TABLE signup_metrics (
  id INTEGER PRIMARY KEY,
  recorded_at TEXT NOT NULL
);
```

The Task 2 `schema.sql` rule records this as a `likely` persistent-data capability. The example guide must state that the schema represents intended demonstration data and is not connected to the in-memory runtime. Do not add a database package, database process, customer fields, or stored submissions.

- [ ] **Step 4: Add complete after-only operations documents**

Use the exact usable content from Tasks 5-7 and the approved design profiles. Every document must state that it is example repository guidance and does not prove live behavior. Use role names, example paths, and local references; include no provider credential, customer data, secret, production endpoint, or claim that a procedure was executed.

- [ ] **Step 5: Update the walkthrough language**

The guide must say that six repository evidence checks improve, while live deployment, alerting, health, backups, restoration, rollback, production behavior, and remaining uncovered domains stay unverified. Retain the statement that neither example is a production template or a production-readiness verdict.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm vitest run tests/acceptance/example-projects.acceptance.test.ts tests/repository/foundation-coverage.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- examples/launch-candidate tests/acceptance/example-projects.acceptance.test.ts tests/repository/foundation-coverage.test.ts
git commit -m "docs: demonstrate operations evidence changes"
```

### Task 11: Update Six-Skill Installation, Compatibility, and Versioning

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/version.ts`
- Modify: `README.md`
- Modify: `docs/installation/compatibility.yaml`
- Modify: `docs/installation/codex.md`
- Modify: `docs/installation/claude-code.md`
- Modify: `docs/installation/cursor.md`
- Modify: `docs/installation/windsurf.md`
- Modify: `docs/installation/agent-skills.md`
- Modify: `tests/repository/installation-docs.test.ts`
- Modify: `tests/repository/homepage.test.ts`
- Modify: `tests/repository/foundation-coverage.test.ts`

**Interfaces:**
- Produces: coherent `0.3.0` package metadata and `v0.3.0` pinned installation text.
- Produces: six-skill staged install, backup, update, verification, and uninstall instructions.
- Consumers: release documentation and users installing on each host.

- [ ] **Step 1: Write failing six-skill and version tests**

Change expected versions to `0.3.0`/`v0.3.0`. Add `launch-operations` to `skillNames` and every fake-git staged list. Assert all guides say six, include the exact ordered loop:

```sh
for PVC_SKILL in post-vibe-clarity project-discovery secret-exposure launch-essentials launch-operations universal-verification; do
```

Assert the compatibility manifest lists the same six canonical skills exactly once. Assert the homepage prompt asks the host to verify all six skills.

- [ ] **Step 2: Run installation and homepage tests and confirm RED**

Run:

```bash
pnpm vitest run tests/repository/installation-docs.test.ts tests/repository/homepage.test.ts tests/skills/foundation-skills.test.ts
```

Expected: FAIL because metadata and guides still describe `0.2.0` and five skills.

- [ ] **Step 3: Bump package metadata coherently**

Set:

```json
"version": "0.3.0"
```

and:

```ts
export const TOOLKIT_VERSION = '0.3.0';
```

Use the package manager to update only the lockfile version metadata:

```bash
pnpm install --lockfile-only --offline
```

Inspect `git diff -- pnpm-lock.yaml` and reject any dependency graph change.

Expand `test:executor` so the existing Ubuntu, macOS, and Windows matrix runs the portable operations paths as well as executor coverage:

```json
"test:executor": "pnpm build && vitest run tests/verification tests/checks/launch-operations tests/discovery/operational-signals.test.ts tests/acceptance/universal-launch-baseline.acceptance.test.ts tests/acceptance/launch-operations.acceptance.test.ts"
```

Update the exact package-interface assertion in `tests/repository/foundation-coverage.test.ts` to the same value. Keep the existing CI matrix job names stable.

- [ ] **Step 4: Update pinned installation procedures**

Replace every five-skill phrase, exact loop, discovery check, update statement, and bounded uninstall list with the six-skill equivalent. Preserve version pinning, unique staging, path-only comparison, bounded backups, revision provenance, no broad deletion, and host-specific invocation syntax.

Update compatibility labels only for packaging facts. Do not claim cross-agent runtime acceptance.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm vitest run tests/repository/installation-docs.test.ts tests/repository/homepage.test.ts tests/skills/foundation-skills.test.ts
```

Expected: PASS.

Commit:

```bash
git add -- package.json pnpm-lock.yaml src/version.ts README.md docs/installation tests/repository/installation-docs.test.ts tests/repository/homepage.test.ts tests/repository/foundation-coverage.test.ts
git commit -m "chore: prepare six-skill v0.3 package"
```

### Task 12: Publish Coverage, Release Evidence, Sample Report, and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/foundation-coverage.md`
- Modify: `ROADMAP.md`
- Modify: `skills/post-vibe-clarity/SKILL.md`
- Modify: `docs/examples/sample-report.md`
- Create: `docs/releases/v0.3.0.md`
- Modify: `tests/repository/foundation-coverage.test.ts`
- Modify: `tests/repository/sample-report.test.ts`
- Create: `tests/repository/sample-report-generator.ts`
- Modify: `tests/repository/homepage.test.ts`

**Interfaces:**
- Produces: public source of truth for repository-only operations coverage and remaining live/provider gaps.
- Produces: renderer-backed sample report from the updated real before fixture.
- Produces: final verified `0.3.0` implementation candidate without tagging or publishing.

- [ ] **Step 1: Write failing public-boundary tests**

Assert public guidance states all of the following:

- six operations checks are repository-only and deterministic;
- usable documentation is content-checked, not filename-only;
- missing or vague evidence is unverified;
- live providers, deployment state, alerts, health endpoints, backups, restores, and rollback execution are not checked;
- guided remedies create separately approved Markdown runbooks only;
- generated drafts preserve unknown decisions;
- no audit authorizes source, config, workflow, infrastructure, external-service, staging, commit, or release changes;
- the full live/provider operations verification roadmap item remains open; and
- the exact disclaimer remains present.

Update the old test that requires `deployment` and `operations` to remain wholly unimplemented. It must now distinguish implemented repository-only evidence from unimplemented live/provider verification.

- [ ] **Step 2: Run documentation tests and confirm RED**

Run:

```bash
pnpm vitest run tests/repository/foundation-coverage.test.ts tests/repository/homepage.test.ts tests/repository/sample-report.test.ts
```

Expected: FAIL because public coverage and the sample report are stale.

- [ ] **Step 3: Update public scope and orchestration guidance**

Update the README coverage table and foundation summary from two to eight Level 0 checks and from five to six skills. Add repository operations basics as implemented. Keep provider and production verification explicitly unimplemented.

Update `skills/post-vibe-clarity/SKILL.md` to route operations findings to `launch-operations` and describe the one-finding-at-a-time Level 2 remedy preview. Preserve the rule that a broad readiness request is not write approval.

Update `ROADMAP.md` by moving repository-only operations evidence out of the omitted list while retaining active environment verification, recovery exercises, performance, provider adapters, code/config remedies, and strong containment as future work.

- [ ] **Step 4: Add a permanent renderer-backed sample generator and regenerate**

Move `generateSampleReport`, `renderPresentationSample`, and their supporting constants from `sample-report.test.ts` into `tests/repository/sample-report-generator.ts`. Export:

```ts
export async function generatePresentationSample(): Promise<{
  markdown: string;
  plan: VerificationPlan;
  execution: VerificationExecution;
  report: VerifiedReadinessReport;
  executionRecordPath: string;
}>;
```

When the module is launched with `--write`, write only `docs/examples/sample-report.md` through `writeFile(repositoryPath('docs/examples/sample-report.md'), markdown, 'utf8')`. When imported by Vitest, perform no write. Update `sample-report.test.ts` to import the helper and retain the exact validation and equality assertions.

Regenerate with:

```bash
pnpm tsx tests/repository/sample-report-generator.ts --write
```

Do not hand-edit findings or evidence. The committed test must compare exact regenerated Markdown.

The sample must show operations findings and repository-only boundaries without any controlled credential or machine-specific value.

- [ ] **Step 5: Add release notes**

`docs/releases/v0.3.0.md` must contain:

- the six new checks;
- adaptive applicability;
- guided written remedies;
- six-skill installation;
- the before-and-after example;
- exact repository-only and live-service limitations;
- the unchanged non-certification disclaimer; and
- upgrade instructions pointing to the pinned host guides.

Do not call the release certified, production ready, fully secure, compliant, or defect-free.

- [ ] **Step 6: Run focused aggregate tests**

Run:

```bash
pnpm vitest run tests/discovery tests/checks tests/catalog tests/orchestrator tests/skills tests/acceptance/foundation.acceptance.test.ts tests/acceptance/example-projects.acceptance.test.ts tests/acceptance/launch-operations.acceptance.test.ts tests/repository
```

Expected: PASS with only documented platform skips.

- [ ] **Step 7: Run all repository gates**

Run in this order:

```bash
pnpm check
pnpm verify:foundation
pnpm test:executor
git diff --check
```

Expected:

- build and complete test suite pass;
- foundation fixture review completes with expected findings/gaps;
- source and compiled executor suites pass;
- no whitespace errors.

If a loopback or process-termination test fails only because the restricted sandbox denies local networking or process control, record that exact failure and rerun only the affected existing suite under the established permission pattern. Do not reclassify an assertion failure as environmental.

- [ ] **Step 8: Run prohibited-content and fixture scans**

Run:

```bash
rg -n "certified production ready|safe to launch|readiness score[[:space:]]*[:=]?[[:space:]]*[0-9]" README.md ROADMAP.md docs skills examples
rg -n "authored|created by|generated by|written by|artificial intelligence|language model|LLM" README.md ROADMAP.md docs skills examples
rg -n "[\x{1F000}-\x{1FAFF}]" README.md ROADMAP.md docs skills examples
rg -n '"(?:expo|express|fastify|electron|prisma|pg|mysql2|mongoose)"[[:space:]]*:[[:space:]]*"0\.0\.0' fixtures
```

Expected: no prohibited affirmative claim, attribution, emoji, or known false-alert fixture version. Matches inside explicit prohibition/disclaimer sentences are reviewed manually and retained only when they clearly negate the claim.

- [ ] **Step 9: Commit final documentation and generated evidence**

```bash
git add -- README.md docs/foundation-coverage.md ROADMAP.md skills/post-vibe-clarity/SKILL.md docs/examples/sample-report.md docs/releases/v0.3.0.md tests/repository/foundation-coverage.test.ts tests/repository/sample-report.test.ts tests/repository/sample-report-generator.ts tests/repository/homepage.test.ts
git commit -m "docs: publish launch operations coverage"
```

- [ ] **Step 10: Perform final branch review**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: clean worktree, only planned commits, no whitespace errors. Review every changed path against the design acceptance criteria before publishing a draft pull request.

## Execution Order and Review Gates

Implement Tasks 1-12 in order. Tasks 5, 6, and 7 may be reviewed independently after Task 4, but do not run them concurrently in a shared worktree. Each task requires:

1. a witnessed failing test;
2. the smallest implementation satisfying that test;
3. focused green tests;
4. a diff review for scope and evidence language; and
5. its own commit.

Before merging the final implementation, require a fresh whole-branch review focused on false positive/negative behavior, path and content boundaries, report-domain accuracy, cross-platform behavior, remedy authorization, live-service claims, and generated documentation provenance.
