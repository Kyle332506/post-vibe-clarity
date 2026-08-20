# Universal Launch Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an approval-gated workflow that plans and runs project-declared build, test, type-check, and lint commands, then reports evidence without issuing a production-ready verdict.

**Architecture:** Keep the existing `postvibe review` path read-only. Add separate command discovery, plan/fingerprint, local execution, execution-record, and report-integration components connected by `postvibe plan` and `postvibe execute`. Every artifact is schema-validated, every execution is tied to an exact plan fingerprint, and the executor remains replaceable.

**Tech Stack:** Node.js 24, TypeScript 5.9, pnpm 9.12, Vitest 4, AJV 8, YAML 2, Node built-ins only for hashing, paths, processes, signals, and file snapshots.

**Spec:** `docs/design/2026-08-18-universal-launch-baseline-design.md`

## Global Constraints

- `postvibe review` remains read-only and continues emitting report schema `0.1`.
- `postvibe execute` emits report schema `0.2` linked to plan schema `postvibe-verification-plan/0.1` and execution schema `postvibe-verification-execution/0.1`.
- Run only project-declared commands; never guess a conventional command from a language or framework.
- Require an exact matching SHA-256 plan fingerprint before any project command starts.
- Spawn commands without an executor-level shell.
- The local executor is containment, not a security sandbox; it does not promise to block network or out-of-root filesystem access by project code.
- Never clean, delete, revert, stage, or overwrite project changes created by commands.
- Never emit an overall numeric readiness score or an unconditional launch, security, compliance, or defect-free verdict.
- Preserve the exact disclaimer: `This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.`
- Use no new runtime dependencies.
- Keep Node.js `>=24` and test executor behavior on Ubuntu, macOS, and Windows.
- Use TDD: add a focused failing test, verify the expected failure, add the smallest implementation, verify the focused test, then run the relevant regression group.
- Use `apply_patch` for source and documentation edits. Preserve unrelated user changes.

## Quick phase map

| Phase | Plain-language outcome |
| --- | --- |
| 1 | Add the portable verification skill without changing normal read-only reviews. |
| 2 | Define the exact formats for plans and execution records. |
| 3 | Find only commands the project actually declares. |
| 4 | Create approval fingerprints and reject changed plans. |
| 5 | Add secret filtering, output limits, path checks, and file-change tracking. |
| 6 | Run approved commands with timeouts and interruption handling. |
| 7 | Turn command results into evidence-based readiness findings. |
| 8 | Connect execution, records, and reports safely. |
| 9 | Add the user-facing `plan` and `execute` commands and realistic fixtures. |
| 10 | Update examples, installation guidance, coverage docs, and operating-system tests. |

---

## Planned file map

### Public contracts

- `src/model/verification.ts`: plan, command, execution, file-change, and linkage types.
- `schemas/verification-plan-0.1.schema.json`: portable plan contract.
- `schemas/verification-execution-0.1.schema.json`: portable execution-record contract.
- `schemas/report-0.2.schema.json`: readiness report with structured verification linkage.
- `src/validation/verification-plan-schema.ts`: plan schema and semantic validation.
- `src/validation/verification-execution-schema.ts`: execution-record schema and semantic validation.
- `src/validation/report-v02-schema.ts`: report `0.2` schema and linkage validation.

### Discovery and planning

- `src/verification/load-verification-config.ts`: strict YAML configuration loader.
- `src/verification/discover-commands.ts`: package-script and portable-command discovery.
- `src/verification/discover-workspaces.ts`: bounded monorepo boundary discovery.
- `src/verification/project-path.ts`: resolved-root and in-root path checks.
- `src/verification/input-digests.ts`: stable SHA-256 input inventory.
- `src/verification/plan-fingerprint.ts`: canonical JSON and plan fingerprinting.
- `src/verification/build-verification-plan.ts`: full plan assembly.
- `src/verification/validate-plan-state.ts`: fingerprint, root, version, and stale-input checks.

### Execution

- `src/verification/environment-policy.ts`: `env-filter/0.1` rules.
- `src/verification/redact-command-output.ts`: bounded persistent-output redaction.
- `src/verification/working-tree.ts`: bounded before/after file snapshots.
- `src/verification/process-tree.ts`: platform-specific child termination.
- `src/verification/local-command-executor.ts`: direct local execution implementation.
- `src/verification/run-approved-verification.ts`: sequential orchestration and partial-result handling.

### Findings, reports, and CLI

- `src/verification/map-verification-findings.ts`: command results to findings and gaps.
- `src/report/build-verified-report.ts`: fresh Level 0 review plus Level 1 evidence.
- `src/report/render-verified-markdown.ts`: readable verification section.
- `src/cli/artifact-output.ts`: exclusive plan, execution, and report writes.
- `src/cli/commands/review.ts`: existing review command extracted without behavior changes.
- `src/cli/commands/plan.ts`: plan CLI adapter.
- `src/cli/commands/execute.ts`: execute CLI adapter and interrupt wiring.
- `src/cli.ts`: thin command dispatcher and sanitized top-level errors.

### Portable skill and fixtures

- `skills/universal-verification/SKILL.md`: manual and deterministic Level 1 workflow.
- `skills/universal-verification/readiness.yaml`: verify-only routing metadata.
- `fixtures/verification-node/`: passing package-script fixture.
- `fixtures/verification-portable/`: passing portable-YAML fixture.
- `fixtures/verification-monorepo/`: monorepo with a deliberate uncovered package.
- `tests/verification/`: focused unit and integration tests for the new subsystem.
- `tests/acceptance/universal-launch-baseline.acceptance.test.ts`: full user-flow acceptance.

---

### Task 1: Add verify-only skill routing without changing read-only reviews

**Files:**
- Create: `skills/universal-verification/SKILL.md`
- Create: `skills/universal-verification/readiness.yaml`
- Modify: `src/catalog/route-skills.ts`
- Modify: `src/orchestrator/run-review.ts`
- Modify: `tests/catalog/catalog.test.ts`
- Create: `tests/catalog/route-skills.test.ts`
- Modify: `tests/acceptance/foundation.acceptance.test.ts`

**Interfaces:**
- Produces: `type SkillMode = 'audit' | 'propose' | 'remediate' | 'verify'`.
- Produces: `routeSkills(manifest, catalog, mode?: SkillMode): SkillDescriptor[]` with default mode `audit`.
- Preserves: `runReview()` routes only `audit` skills and keeps current v0.1 output behavior.

- [ ] **Step 1: Write the failing routing tests**

Add a catalog fixture in the test with `modes: ['verify']`, then assert:

```ts
expect(routeSkills(manifest, [auditSkill, verifySkill])).toEqual([auditSkill]);
expect(routeSkills(manifest, [auditSkill, verifySkill], 'verify')).toEqual([verifySkill]);
```

Also add a foundation assertion that the verify-only skill does not appear in a normal `runReview()` report.

- [ ] **Step 2: Run the focused tests and confirm the old router fails the new expectation**

Run:

```bash
pnpm vitest run tests/catalog/route-skills.test.ts tests/acceptance/foundation.acceptance.test.ts
```

Expected: FAIL because `routeSkills` does not accept or filter by mode.

- [ ] **Step 3: Add mode-aware routing**

Implement this public shape in `src/catalog/route-skills.ts`:

```ts
export type SkillMode = SkillDescriptor['modes'][number];

export function routeSkills(
  manifest: CapabilityManifest,
  catalog: SkillDescriptor[],
  mode: SkillMode = 'audit',
): SkillDescriptor[] {
  return catalog.filter((skill) => skill.modes.includes(mode) && matchesManifest(skill, manifest));
}
```

Keep the existing artifact and capability matching inside a private `matchesManifest` helper. Pass `'audit'` explicitly from `runReview` so its boundary is obvious.

- [ ] **Step 4: Add the portable verify-only skill**

Use this sidecar contract:

```yaml
schemaVersion: "0.1"
id: universal-verification
skillVersion: "0.1.0"
domains:
  - data-correctness
  - maintainability-change-safety
  - release-delivery
modes:
  - verify
maxActionLevel: 1
checks:
  - universal-verification.commands
```

The skill instructions must explain plan first, exact approval, declared commands only, containment limits, visible exclusions, no cleanup, and the required disclaimer. Do not describe the result as a readiness verdict.

- [ ] **Step 5: Run catalog and foundation regressions**

Run:

```bash
pnpm vitest run tests/catalog tests/skills tests/acceptance/foundation.acceptance.test.ts
```

Expected: PASS. Existing audit reports retain the same routed checks and findings.

- [ ] **Step 6: Commit Task 1**

```bash
git add skills/universal-verification src/catalog/route-skills.ts src/orchestrator/run-review.ts tests/catalog tests/acceptance/foundation.acceptance.test.ts
git commit -m "feat: route verify-only readiness skills"
```

---

### Task 2: Define and validate the plan and execution contracts

**Files:**
- Create: `src/model/verification.ts`
- Create: `schemas/verification-plan-0.1.schema.json`
- Create: `schemas/verification-execution-0.1.schema.json`
- Create: `src/validation/verification-plan-schema.ts`
- Create: `src/validation/verification-execution-schema.ts`
- Create: `tests/fixtures/sample-verification-plan.ts`
- Create: `tests/fixtures/sample-verification-execution.ts`
- Create: `tests/validation/verification-plan-schema.test.ts`
- Create: `tests/validation/verification-execution-schema.test.ts`

**Interfaces:**
- Produces: all verification types shown below.
- Produces: `validateVerificationPlan(input: unknown): Promise<ValidationResult>`.
- Produces: `validateVerificationExecution(input: unknown): Promise<ValidationResult>`.
- Produces: source/compiled schema path resolvers following the current report-schema pattern.

- [ ] **Step 1: Write the TypeScript contract tests first**

Create canonical fixtures and assert that both validators accept them. Clone each fixture and test rejection for unknown fields, duplicate command IDs, invalid categories, out-of-range timeouts, missing selected results, mismatched fingerprints, and raw output larger than 262,144 UTF-8 bytes.

Use these core types exactly:

```ts
export type CommandCategory = 'build' | 'test' | 'type-check' | 'lint';
export type CommandSourceKind = 'package-script' | 'portable-config';
export type CommandResultStatus =
  | 'passed'
  | 'failed'
  | 'timed-out'
  | 'could-not-start'
  | 'interrupted'
  | 'unverified';

export interface VerificationCommandSource {
  kind: CommandSourceKind;
  location: string;
  declaration: string;
  sha256: string;
}

export interface PackageScriptLauncher {
  policyVersion: 'package-script-launcher/0.1';
  kind: 'node-runtime' | 'node-package-bin' | 'direct-executable';
  executable: string;
  sha256: string;
  entrypointArgvIndex?: number;
  entrypoint?: InputDigest;
  packageManifest?: InputDigest;
}

export interface VerificationCommand {
  id: string;
  category: CommandCategory;
  argv: string[];
  cwd: string;
  timeoutSeconds: number;
  requiredAccess: ['local-command'];
  source: VerificationCommandSource;
  launcher?: PackageScriptLauncher;
}

export interface InputDigest {
  location: string;
  sha256: string;
}

export interface VerificationCoverageGap {
  id: string;
  category?: CommandCategory;
  reason: string;
  workspace?: string;
}

export interface VerificationCategoryAssessment {
  category: CommandCategory;
  state: 'applicable' | 'not-applicable' | 'unverified';
  reason: string;
}

export interface ExecutionPolicy {
  environmentPolicyVersion: 'env-filter/0.1';
  outputLimitBytes: 262144;
  executor: 'local-process/0.1';
}

export interface VerificationPlan {
  schemaId: 'postvibe-verification-plan/0.1';
  schemaVersion: '0.1';
  planId: string;
  fingerprint: string;
  toolkitVersion: string;
  generatedAt: string;
  projectRoot: string;
  skillsRoot: string;
  planningReport: ReadinessReport;
  inputDigests: InputDigest[];
  skillDigests: InputDigest[];
  commands: VerificationCommand[];
  excludedCommands: VerificationCommand[];
  categoryAssessments: VerificationCategoryAssessment[];
  coverageGaps: VerificationCoverageGap[];
  executionPolicy: ExecutionPolicy;
  containmentWarning: string;
  disclaimer: string;
}

export interface FileChange {
  path: string;
  kind: 'added' | 'modified' | 'removed';
}

export interface ProjectRootIdentity {
  realPath: string;
  device: string;
  inode: string;
}

export interface ObservationBoundary {
  policyVersion: 'project-observation/0.1';
  rootIdentity: ProjectRootIdentity;
  versionControlDirectories: ['.git'];
  artifactDirectories: ['.postvibe'];
  coverageDirectories: ['coverage'];
  distributionDirectories: ['dist'];
  dependencyDirectories: ['node_modules'];
  exactArtifactExclusions: string[];
  symlinks: 'not-followed';
  nonRegularFiles: 'not-observed';
  inaccessiblePaths: 'observation-fails';
  metadata: 'content-sha256-only';
}

export interface VerificationCommandResult {
  commandId: string;
  status: CommandResultStatus;
  startedAt?: string;
  durationMs?: number;
  exitCode: number | null;
  signal: string | null;
  output: string;
  outputTruncated: boolean;
  fileChanges: FileChange[];
  unverifiedReason?: string;
}

export interface VerificationExecution {
  schemaId: 'postvibe-verification-execution/0.1';
  schemaVersion: '0.1';
  executionId: string;
  status: 'completed' | 'partial';
  planId: string;
  planFingerprint: string;
  toolkitVersion: string;
  projectRoot: string;
  startedAt: string;
  completedAt: string;
  removedEnvironmentVariables: string[];
  results: VerificationCommandResult[];
  coverageGaps: VerificationCoverageGap[];
  observationBoundary: ObservationBoundary;
  containmentWarning: string;
  disclaimer: string;
}
```

- [ ] **Step 2: Run the new validator tests and confirm they fail**

```bash
pnpm vitest run tests/validation/verification-plan-schema.test.ts tests/validation/verification-execution-schema.test.ts
```

Expected: FAIL because the models and validators do not exist.

- [ ] **Step 3: Add the model and strict JSON schemas**

Translate the interfaces one-for-one into JSON Schema draft 2020-12:

- every object uses `additionalProperties: false`;
- every non-optional TypeScript field is listed in `required`;
- IDs use `^[a-z0-9][a-z0-9:._-]*$`;
- SHA-256 strings use `^[a-f0-9]{64}$`;
- timestamps use `format: date-time`;
- `argv` has `minItems: 1` and non-empty string items;
- `timeoutSeconds` has minimum `1` and maximum `3600`;
- `output` has `maxLength: 262144` as a schema backstop, while runtime validation enforces UTF-8 byte length;
- command, input, result, coverage-gap, and removed-environment arrays use deterministic ordering but schemas do not silently reorder them.

- [ ] **Step 4: Add semantic validation**

The plan validator must reject duplicate IDs across selected and excluded commands, duplicate input locations, a `planId` that is not `pvp-${fingerprint.slice(0, 16)}`, non-sorted digest arrays, a source digest that does not hash the exact declaration, invalid launcher/argv binding, an excluded command without a matching coverage gap, or category assessments that do not contain each of the four categories exactly once. The containment warning is one exact policy constant.

The execution validator must require exact ordered result linkage, exact plan gaps plus only the fixed orchestration gap, the versioned observation boundary, `completedAt >= startedAt`, and the full status/exit-code/signal/reason/timing/truncation matrix. It also rejects duplicate result IDs, a `completed` execution containing `interrupted`, `unverified`, or orchestration-gap evidence, non-sorted environment names/file changes, unredacted credentials, and output over 262,144 UTF-8 bytes.

Export a second semantic helper for linkage:

```ts
export function validateExecutionAgainstPlan(
  execution: VerificationExecution,
  plan: VerificationPlan,
): string[];
```

- [ ] **Step 5: Verify source and compiled schema resolution**

Add the same package-root containment test used by `report-schema.test.ts`, then run:

```bash
pnpm build
pnpm vitest run tests/validation
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/model/verification.ts src/validation schemas tests/fixtures/sample-verification-plan.ts tests/fixtures/sample-verification-execution.ts tests/validation
git commit -m "feat: define verification evidence contracts"
```

---

### Task 3: Discover declared commands and monorepo gaps

**Files:**
- Create: `src/verification/project-path.ts`
- Create: `src/verification/load-verification-config.ts`
- Create: `src/verification/discover-workspaces.ts`
- Create: `src/verification/discover-commands.ts`
- Create: `tests/verification/project-path.test.ts`
- Create: `tests/verification/load-verification-config.test.ts`
- Create: `tests/verification/discover-commands.test.ts`
- Create: `tests/verification/discover-workspaces.test.ts`

**Interfaces:**
- Produces: `resolveProjectRoot(path: string): Promise<string>` using `realpath`.
- Produces: `resolveInsideProject(root: string, relativePath: string): Promise<string>`.
- Produces: `loadVerificationConfig(root: string): Promise<PortableVerificationConfig | undefined>`.
- Produces: `discoverVerificationCommands(root: string, excludedIds: Set<string>): Promise<CommandDiscoveryResult>`.

```ts
export interface PortableVerificationConfig {
  schemaVersion: '0.1';
  commands: Array<{
    id: string;
    category: CommandCategory;
    argv: string[];
    cwd: string;
    timeoutSeconds?: number;
  }>;
}

export interface CommandDiscoveryResult {
  commands: VerificationCommand[];
  excludedCommands: VerificationCommand[];
  categoryAssessments: VerificationCategoryAssessment[];
  coverageGaps: VerificationCoverageGap[];
  inputLocations: string[];
  workspaceRoots: string[];
}
```

- [ ] **Step 1: Write failing path and YAML tests**

Test that `resolveInsideProject` accepts `.` and `packages/api`, but rejects absolute paths, `../outside`, nonexistent directories, and a symlink whose real target leaves the project.

Test the exact portable YAML shape from the spec. Reject shell strings, empty `argv`, unknown keys, duplicate IDs, invalid categories, per-command environment fields, and timeouts outside 1–3,600 seconds.

- [ ] **Step 2: Write failing package discovery tests**

Cover these exact cases:

```ts
expect(result.commands.map(({ id }) => id)).toEqual([
  'package-script:build',
  'package-script:type-check',
  'package-script:lint',
  'package-script:test',
]);
expect(result.commands[0]?.argv[0]).toBe(process.execPath);
expect(result.commands[0]?.source.location).toBe('package.json#scripts.build');
expect(result.commands[0]?.launcher?.policyVersion).toBe('package-script-launcher/0.1');
```

Also test npm, Yarn, and Bun evidence; conflicting lockfiles; unsupported `packageManager`; both `typecheck` and `type-check`; non-string scripts; explicit exclusions; duplicate IDs between automatic and portable commands; and multiple portable commands sharing one category.

For each category, require an explicit assessment. A discovered command is `applicable`. A root static-HTML project with no build system may mark build `not-applicable`. A missing test, type-check, or lint declaration remains `unverified`; absence is never converted into a pass.

- [ ] **Step 3: Write failing workspace tests**

Use temporary projects for `package.json#workspaces` and `pnpm-workspace.yaml`. Assert that discovered package roots are sorted, portable commands whose `cwd` equals a workspace cover that workspace, and every remaining workspace creates a gap:

```ts
expect(result.coverageGaps).toContainEqual({
  id: 'workspace.packages/admin',
  reason: 'Detected workspace was not directly covered by an approved command.',
  workspace: 'packages/admin',
});
```

- [ ] **Step 4: Run the focused tests and confirm failure**

```bash
pnpm vitest run tests/verification/project-path.test.ts tests/verification/load-verification-config.test.ts tests/verification/discover-commands.test.ts tests/verification/discover-workspaces.test.ts
```

- [ ] **Step 5: Implement strict discovery**

Implement package-manager selection with the exact evidence table in the design. Use `packageManager` only for supported names and reject conflicts with lockfiles. Create commands only for exact script names. Store and hash the exact script declaration, parse only the portable shell-free literal-argument subset, and freeze the fingerprinted Node runtime plus any contained direct entry point, or a contained local JavaScript bin manifest/entry point, into launcher evidence. Record each entry point's exact argv position. Never emit package-manager or `.cmd` argv for execution; unsupported Node option shapes, syntax, or unresolved launchers become explicit gaps. This final-review correction removes the live package-manager reread between approval and use.

Parse `postvibe.verification.yaml` with `yaml`, validate its plain object shape before use, normalize `cwd` to forward-slash relative form, and never expand environment variables.

Use Node 24 filesystem globbing for declared workspace patterns. Ignore `node_modules`, `.git`, `.postvibe`, `coverage`, and `dist`. A root aggregate script does not mark child workspaces covered.

- [ ] **Step 6: Run the focused tests and discovery regressions**

```bash
pnpm vitest run tests/verification tests/discovery
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/verification/project-path.ts src/verification/load-verification-config.ts src/verification/discover-workspaces.ts src/verification/discover-commands.ts tests/verification
git commit -m "feat: discover declared verification commands"
```

---

### Task 4: Build deterministic plans and reject stale approval

**Files:**
- Create: `src/version.ts`
- Create: `src/verification/input-digests.ts`
- Create: `src/verification/plan-fingerprint.ts`
- Create: `src/verification/build-verification-plan.ts`
- Create: `src/verification/validate-plan-state.ts`
- Create: `tests/verification/input-digests.test.ts`
- Create: `tests/verification/plan-fingerprint.test.ts`
- Create: `tests/verification/build-verification-plan.test.ts`
- Create: `tests/verification/validate-plan-state.test.ts`

**Interfaces:**
- Produces: `TOOLKIT_VERSION = '0.2.0'` as the single runtime version source.
- Produces: `canonicalJson(value: unknown): string` with sorted object keys and preserved array order.
- Produces: `fingerprintPlan(input: FingerprintPlanInput): string`.
- Produces: `buildVerificationPlan(options: BuildVerificationPlanOptions): Promise<VerificationPlan>`.
- Produces: `validatePlanState(plan: VerificationPlan): Promise<void>`.

Use:

```ts
export interface BuildVerificationPlanOptions {
  root: string;
  skillsRoot: string;
  excludedCommandIds: Set<string>;
  outputPath: string;
  now?: () => string;
}

export type FingerprintPlanInput = Omit<
  VerificationPlan,
  'planId' | 'fingerprint' | 'generatedAt'
>;
```

- [ ] **Step 1: Write failing canonicalization and digest tests**

Assert that object key order does not affect canonical JSON, array order does affect it, and plan generation time/output path do not affect the fingerprint. Assert that changing command order, script text, timeout, exclusion, category assessment, input bytes, skill sidecar bytes, root, or execution policy changes it.

Test digest inventory ordering and exclusion of `.git`, `.postvibe`, dependencies, generated directories, and the exact selected output path.

- [ ] **Step 2: Write failing plan-builder tests**

Build twice with different timestamps and output paths. Assert equal fingerprints and IDs, but different `generatedAt`. Assert:

```ts
expect(plan.planId).toBe(`pvp-${plan.fingerprint.slice(0, 16)}`);
expect(plan.executionPolicy).toEqual({
  environmentPolicyVersion: 'env-filter/0.1',
  outputLimitBytes: 262144,
  executor: 'local-process/0.1',
});
expect(await validateVerificationPlan(plan)).toEqual({ ok: true });
```

Verify that unknown exclusions fail and excluded commands remain in `excludedCommands` with matching gaps.

- [ ] **Step 3: Write failing stale-state tests**

After building a plan, separately change a source file, `package.json`, `postvibe.verification.yaml`, a routed skill sidecar, the project directory, and the plan fingerprint. Every case must reject before a fake executor callback is reached.

- [ ] **Step 4: Run focused tests and confirm failure**

```bash
pnpm vitest run tests/verification/input-digests.test.ts tests/verification/plan-fingerprint.test.ts tests/verification/build-verification-plan.test.ts tests/verification/validate-plan-state.test.ts
```

- [ ] **Step 5: Implement canonical hashing and plan assembly**

Canonicalize recursively: primitives use JSON encoding, arrays preserve order, and object keys sort with one locale-independent UTF-16 ordinal comparator. Use that same comparator everywhere ordering influences fingerprints, inventories, or evidence. Build the unsigned fingerprint payload by omitting `planId`, `fingerprint`, `generatedAt`, and output path. Hash its UTF-8 bytes with `createHash('sha256')`. This correction prevents host locale from changing approval bytes for accented or canonically distinct names.

`buildVerificationPlan` must:

1. resolve roots;
2. run the current Level 0 review;
3. load a deduplicated digest inventory for the complete catalog that can affect planning or the mandatory audit-mode fresh review;
4. discover commands and workspaces;
5. hash inspected project inputs and every loaded catalog instruction/sidecar in ordinal order;
6. apply exclusions;
7. construct policy/warning/disclaimer fields;
8. fingerprint and assign the plan ID;
9. validate the finished plan before returning it.

- [ ] **Step 6: Implement fail-closed state validation**

`validatePlanState` must validate schema and semantics, require the current toolkit version, recalculate the fingerprint, resolve and compare the real project root, recalculate all recorded input and complete-catalog digests, and reject added, removed, or changed inspected inputs or newly shipped catalog skills with one stable message: `Verification plan is stale; create and approve a new plan.`

- [ ] **Step 7: Run focused and Level 0 regressions**

```bash
pnpm vitest run tests/verification tests/orchestrator tests/acceptance/foundation.acceptance.test.ts
pnpm build
```

- [ ] **Step 8: Commit Task 4**

```bash
git add src/version.ts src/verification/input-digests.ts src/verification/plan-fingerprint.ts src/verification/build-verification-plan.ts src/verification/validate-plan-state.ts tests/verification
git commit -m "feat: create tamper-evident verification plans"
```

---

### Task 5: Add the environment, output, path, and file-change safeguards

**Files:**
- Create: `src/verification/environment-policy.ts`
- Create: `src/verification/redact-command-output.ts`
- Create: `src/verification/working-tree.ts`
- Create: `tests/verification/environment-policy.test.ts`
- Create: `tests/verification/redact-command-output.test.ts`
- Create: `tests/verification/working-tree.test.ts`

**Interfaces:**
- Produces: `filterExecutionEnvironment(input: NodeJS.ProcessEnv): FilteredEnvironment`.
- Produces: `redactCommandOutput(input: string): string`.
- Produces: `snapshotWorkingTree(root, excludedPaths): Promise<WorkingTreeSnapshot>`.
- Produces: `diffWorkingTrees(before, after): FileChange[]`.

```ts
export interface FilteredEnvironment {
  environment: NodeJS.ProcessEnv;
  removedNames: string[];
}

export type WorkingTreeSnapshot = ReadonlyMap<string, string>;
```

- [ ] **Step 1: Write failing environment tests**

Create a controlled environment containing `PATH`, `CI`, `APP_TOKEN`, `databasePassword`, `NODE_OPTIONS`, `PYTHONPATH`, `LD_PRELOAD`, and `DYLD_INSERT_LIBRARIES`. Assert only `PATH` and `CI` remain and removed names are sorted. Assert no removed values appear in the returned evidence.

- [ ] **Step 2: Write failing redaction and output-boundary tests**

Test credential-like assignments, `Authorization: Bearer ...`, cookies, session values, and a private-key block. Expected persisted forms use `[REDACTED]`. Test unrelated text remains unchanged and UTF-8 truncation never exceeds 262,144 bytes or splits a code point.

- [ ] **Step 3: Write failing working-tree tests**

Snapshot a temporary root, then add, modify, and remove visible files. Assert sorted changes. Also create changes inside `.git`, `.postvibe`, `node_modules`, `coverage`, and `dist`; assert they are outside the stated snapshot boundary. Pass an additional exact artifact path and assert it is excluded.

- [ ] **Step 4: Run focused tests and confirm failure**

```bash
pnpm vitest run tests/verification/environment-policy.test.ts tests/verification/redact-command-output.test.ts tests/verification/working-tree.test.ts
```

- [ ] **Step 5: Implement `env-filter/0.1` exactly**

Remove case-insensitive names containing `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `PRIVATE_KEY`, `CREDENTIAL`, `API_KEY`, `AUTHORIZATION`, `COOKIE`, or `SESSION`; exact names `NODE_OPTIONS`, `NODE_PATH`, `BASH_ENV`, `ENV`, `ZDOTDIR`, `PYTHONPATH`, `PYTHONSTARTUP`, `RUBYOPT`, `PERL5OPT`, `GIT_ASKPASS`, `SSH_ASKPASS`; and prefixes `LD_`, `DYLD_`.

- [ ] **Step 6: Implement bounded redaction and snapshots**

Redact before persistence. Keep a bounded raw rolling buffer only for the lifetime of one command, join chunk boundaries before redaction, retain the first and last portions when truncating, and discard all raw bytes when the result is created.

Reuse the same directory exclusions as `listProjectFiles`; extract and export the exclusion predicate from `src/discovery/file-index.ts` rather than duplicating it. Hash visible file contents with SHA-256.

- [ ] **Step 7: Run focused tests and secret-scanner regressions**

```bash
pnpm vitest run tests/verification tests/checks/secret-exposure.test.ts tests/discovery
pnpm build
```

- [ ] **Step 8: Commit Task 5**

```bash
git add src/discovery/file-index.ts src/verification/environment-policy.ts src/verification/redact-command-output.ts src/verification/working-tree.ts tests/verification
git commit -m "feat: contain local verification evidence"
```

---

### Task 6: Execute approved commands without an executor-level shell

**Files:**
- Create: `src/verification/process-tree.ts`
- Create: `src/verification/local-command-executor.ts`
- Create: `tests/verification/process-tree.test.ts`
- Create: `tests/verification/local-command-executor.test.ts`

**Interfaces:**
- Produces: `CommandExecutor` and `LocalCommandExecutor`.
- Consumes: environment, redaction, working-tree, and verification model interfaces from Tasks 2 and 5.

```ts
export interface ExecuteCommandContext {
  root: string;
  signal: AbortSignal;
  inheritedEnvironment: NodeJS.ProcessEnv;
  excludedArtifactPaths: string[];
  now: () => string;
}

export interface CommandExecutor {
  execute(
    command: VerificationCommand,
    context: ExecuteCommandContext,
  ): Promise<{ result: VerificationCommandResult; removedEnvironmentVariables: string[] }>;
}
```

- [ ] **Step 1: Write the failing direct-argument tests**

Use `process.execPath` with `-e` scripts. Pass arguments containing `;`, `&&`, `$()`, spaces, and wildcard characters. Assert the child receives each literal value and no second command or file is created.

- [ ] **Step 2: Write failing environment, failure, and mutation tests**

Test that a child cannot read a controlled `APP_TOKEN`, can read `PATH`, and returns the removed name only. Cover exit `0`, exit `7`, nonexistent executable, file creation, modification, removal, large output, credential output, and output split across chunks.

- [ ] **Step 3: Write failing timeout and interruption tests**

Create a Node fixture process that starts a child and stays alive. Use a 1-second timeout and separately abort with `AbortController`. Assert status `timed-out` or `interrupted`, later polling confirms the child stopped where the platform supports tree termination, and the result states any termination boundary.

- [ ] **Step 4: Run the focused tests and confirm failure**

```bash
pnpm vitest run tests/verification/process-tree.test.ts tests/verification/local-command-executor.test.ts
```

- [ ] **Step 5: Implement the executor**

Call `spawn(command.argv[0], command.argv.slice(1), { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })`. Resolve `cwd` again immediately before spawn. Snapshot before and after. Drain both streams. Race close/error against timeout and abort exactly once.

On Unix, start a detached process group and signal the negative PID, escalating from `SIGTERM` to `SIGKILL` after a bounded grace period. On Windows, directly spawn `taskkill` with `['/pid', String(pid), '/T', '/F']` and no shell. A failed cleanup is recorded as an unverified boundary; it is not hidden.

Map outcomes exactly:

- exit `0` -> `passed`;
- nonzero exit -> `failed`;
- timeout -> `timed-out`;
- spawn error -> `could-not-start`;
- abort -> `interrupted`.

- [ ] **Step 6: Run the focused tests repeatedly**

```bash
pnpm vitest run tests/verification/local-command-executor.test.ts
pnpm vitest run tests/verification/local-command-executor.test.ts
pnpm vitest run tests/verification/local-command-executor.test.ts
pnpm build
```

Expected: three clean passes with no orphan fixture processes.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/verification/process-tree.ts src/verification/local-command-executor.ts tests/verification
git commit -m "feat: execute approved local verification commands"
```

---

### Task 7: Map execution evidence into report schema 0.2

**Files:**
- Create: `schemas/report-0.2.schema.json`
- Create: `src/model/verified-report.ts`
- Create: `src/validation/report-v02-schema.ts`
- Create: `src/verification/map-verification-findings.ts`
- Create: `src/report/build-verified-report.ts`
- Create: `src/report/render-verified-markdown.ts`
- Create: `tests/fixtures/sample-verified-report.ts`
- Create: `tests/verification/map-verification-findings.test.ts`
- Create: `tests/report/build-verified-report.test.ts`
- Create: `tests/report/render-verified-report.test.ts`
- Create: `tests/validation/report-v02-schema.test.ts`

**Interfaces:**
- Produces: `VerifiedReadinessReport` with schema version `0.2`.
- Produces: `mapVerificationEvidence(plan, execution): VerificationFindingSet`.
- Produces: `buildVerifiedReport(base, plan, execution, executionRecordPath): Promise<VerifiedReadinessReport>`.
- Produces: `renderVerifiedMarkdown(report): string`.

```ts
export interface VerificationLink {
  planId: string;
  planFingerprint: string;
  executionId: string;
  executionRecordPath: string;
}

export interface VerifiedReadinessReport extends Omit<ReadinessReport, 'schemaVersion'> {
  schemaVersion: '0.2';
  verification: VerificationLink;
}

export interface VerificationFindingSet {
  findings: Finding[];
  checkExecution: CheckExecution;
  coverageGaps: CoverageGap[];
}
```

- [ ] **Step 1: Write the failing result-mapping table tests**

Use table-driven tests for every row in the design:

```ts
it.each([
  ['build', 'failed', 'failed', 'stop-before-launch'],
  ['test', 'failed', 'failed', 'stop-before-launch'],
  ['type-check', 'failed', 'failed', 'resolve-before-launch'],
  ['lint', 'failed', 'failed', 'resolve-before-launch'],
  ['build', 'timed-out', 'unverified', 'resolve-before-launch'],
  ['test', 'could-not-start', 'unverified', 'resolve-before-launch'],
  ['lint', 'interrupted', 'unverified', 'plan-soon'],
] as const)('%s %s maps correctly', (category, status, outcome, actionLevel) => {
  expect(mapped(category, status)).toMatchObject({ outcome, actionLevel });
});
```

Add passing, missing, excluded, and evidence-based not-applicable cases sourced from `plan.categoryAssessments`. Assert one check execution named `universal-verification.commands`, check/skill version `0.1.0`, and domains `data-correctness`, `maintainability-change-safety`, `release-delivery`.

- [ ] **Step 2: Write failing schema and report tests**

Assert schema `0.2` retains every `0.1` invariant and requires a valid verification link. Reject plan/execution fingerprint mismatches, missing execution-record path, wrong summary, duplicate findings, numeric readiness scores in acceptance inspection, and unredacted controlled values.

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
pnpm vitest run tests/verification/map-verification-findings.test.ts tests/report/build-verified-report.test.ts tests/report/render-verified-report.test.ts tests/validation/report-v02-schema.test.ts
```

- [ ] **Step 4: Implement finding mapping**

Use stable finding IDs `universal-verification.commands.<command-id>`. Treat failed project commands as a successfully completed check that produced failed findings. Mark the check execution `unverified` only when at least one command is missing, excluded, timed out, could not start, was interrupted, or otherwise lacks evidence.

Remove base domain gaps only for the three domains now represented by the verification check. Preserve all unrelated Level 0 findings and coverage gaps. Recompute summary and `partial` with existing helpers.

- [ ] **Step 5: Add report 0.2 validation and rendering**

Create `report-0.2.schema.json` with the complete `0.1` fields plus required `verification`. Keep `report-0.1.schema.json` unchanged. Validate linkage semantically against the supplied plan and execution.

Render a `## Local verification` section containing plan ID, fingerprint, execution ID, execution-record path, command status/duration, changed paths, exclusions, and containment warning. End with the exact existing disclaimer.

- [ ] **Step 6: Run report and foundation regressions**

```bash
pnpm vitest run tests/model tests/report tests/validation tests/acceptance/foundation.acceptance.test.ts
pnpm build
```

- [ ] **Step 7: Commit Task 7**

```bash
git add schemas/report-0.2.schema.json src/model/verified-report.ts src/validation/report-v02-schema.ts src/verification/map-verification-findings.ts src/report/build-verified-report.ts src/report/render-verified-markdown.ts tests/fixtures/sample-verified-report.ts tests/verification tests/report tests/validation
git commit -m "feat: report approved verification evidence"
```

---

### Task 8: Orchestrate execution and write collision-safe artifacts

**Files:**
- Create: `src/cli/artifact-output.ts`
- Modify: `src/cli/report-output.ts`
- Create: `src/verification/run-approved-verification.ts`
- Create: `tests/cli/artifact-output.test.ts`
- Create: `tests/verification/run-approved-verification.test.ts`

**Interfaces:**
- Produces: generic `writeArtifactExclusively(path, contents): Promise<void>` while retaining `writeReportExclusively` compatibility.
- Produces: `runApprovedVerification(options): Promise<ApprovedVerificationResult>`.

```ts
export interface RunApprovedVerificationOptions {
  plan: VerificationPlan;
  approvedFingerprint: string;
  outputDirectory: string;
  format: 'markdown' | 'json';
  signal: AbortSignal;
  executor?: CommandExecutor;
  now?: () => string;
}

export interface ApprovedVerificationResult {
  execution: VerificationExecution;
  report: VerifiedReadinessReport;
  executionPath: string;
  reportPath: string;
}
```

- [ ] **Step 1: Write failing pre-execution rejection tests**

Inject an executor that increments a counter. For wrong approval, invalid schema, stale inputs, moved root, changed skill, existing output targets, or unsupported toolkit version, assert rejection and counter `0`.

- [ ] **Step 2: Write failing sequential and partial execution tests**

Inject a deterministic fake executor. Assert exact listed order, continuation after ordinary failures, combined/sorted removed environment names, and one result per selected command. Abort after the first result and assert remaining commands receive `unverified` results, execution status is `partial`, and a partial record is written.

- [ ] **Step 3: Write failing artifact tests**

Assert plan, execution, report, lock, and temporary naming are deterministic and collision-safe. Use execution ID `pve-${startedAt.replace(/\D/g, '')}`, execution file `<execution-id>.execution.json`, report file `<execution-id>.report.<md|json>`, and lock file `<execution-id>.lock`. Precreate each final target and verify no file is overwritten. Add corrupt post-command manifest, occupied report target, and root/output identity drift cases. They must publish only validated partial execution evidence with sanitized orchestration coverage, preserve foreign targets, and publish no report.

- [ ] **Step 4: Run focused tests and confirm failure**

```bash
pnpm vitest run tests/cli/artifact-output.test.ts tests/verification/run-approved-verification.test.ts
```

- [ ] **Step 5: Implement the orchestration order**

Use this exact order:

1. compare `--approve` to the plan fingerprint with constant-time byte comparison;
2. validate plan schema and semantics;
3. call `validatePlanState`;
4. compute final, staging, and recovery artifact paths; pin project/output identities; acquire one exclusive run lock and owned staging entries;
5. immediately before each command, revalidate its exact declaration and fingerprinted launcher, then execute selected commands sequentially;
6. re-redact, re-bound, structurally copy, and status-matrix-check executor evidence at the recorder boundary; convert abort or invalid evidence into explicit remaining `unverified` results;
7. build, validate, and retain the execution record in owned staging;
8. recheck root/output identity and run a fresh Level 0 `runReview` against the resulting tree;
9. build, validate, render, and stage report `0.2`;
10. recheck identities and publish execution/report as one rollback-capable artifact set;
11. after any post-command failure, rewrite staged evidence as validated partial execution with the fixed orchestration gap and publish it alone, using the stable recovery boundary if the requested output moved;
12. release owned entries and the run lock in `finally` without deleting foreign replacements.

Unexpected executor errors after step 5 produce a partial record from completed evidence when safe. Project command failures are data, not thrown orchestration errors. The old execution-before-report order was removed because it could leave misleading completed evidence when mandatory post-processing failed.

- [ ] **Step 6: Keep old report output behavior**

Make `writeReportExclusively` delegate to the generic writer so existing imports and error wording remain valid. Add a new `ArtifactFileCollisionError` for plan/execute commands without changing `postvibe review` messages.

- [ ] **Step 7: Run orchestration and CLI-output regressions**

```bash
pnpm vitest run tests/verification tests/cli/report-output.test.ts tests/cli/artifact-output.test.ts
pnpm build
```

- [ ] **Step 8: Commit Task 8**

```bash
git add src/cli/artifact-output.ts src/cli/report-output.ts src/verification/run-approved-verification.ts tests/cli tests/verification
git commit -m "feat: orchestrate approved verification runs"
```

---

### Task 9: Add the CLI and end-to-end fixtures

**Files:**
- Create: `src/cli/commands/review.ts`
- Create: `src/cli/commands/plan.ts`
- Create: `src/cli/commands/execute.ts`
- Modify: `src/cli.ts`
- Create: `fixtures/verification-node/package.json`
- Create: `fixtures/verification-node/src/index.ts`
- Create: `fixtures/verification-portable/postvibe.verification.yaml`
- Create: `fixtures/verification-portable/verify.mjs`
- Create: `fixtures/verification-monorepo/package.json`
- Create: `fixtures/verification-monorepo/pnpm-workspace.yaml`
- Create: `fixtures/verification-monorepo/packages/covered/package.json`
- Create: `fixtures/verification-monorepo/packages/uncovered/package.json`
- Create: `tests/acceptance/universal-launch-baseline.acceptance.test.ts`
- Modify: `tests/cli/cli.test.ts`

**Interfaces:**
- Produces: working `postvibe plan` and `postvibe execute` commands.
- Preserves: all `postvibe review` arguments, defaults, stdout, stderr, and collision behavior.

- [ ] **Step 1: Write failing CLI parsing and safety tests**

Cover exact usage:

```text
postvibe plan [project-path] [--skills <skills-path>] [--exclude <command-id>...] --output <plan-file>
postvibe execute <plan-file> --approve <fingerprint> --output <directory> [--format <markdown|json>]
```

Assert plan stdout contains only plan path, fingerprint, command summary, gaps, warning, and exact execute command. Assert execute stdout contains only execution/report paths and a concise status summary. Verify sanitized stable failures and debug redaction for both commands.

Re-run every existing review CLI test without changing its expected behavior except the toolkit version field moving to `0.2.0`.

- [ ] **Step 2: Write the failing end-to-end acceptance test**

Copy each fixture to a temporary directory. For the Node fixture:

1. call `postvibe plan`;
2. parse its fingerprint;
3. prove no project script marker exists yet;
4. call `postvibe execute` with the exact fingerprint;
5. assert all four commands ran in approved order;
6. validate the execution record and report `0.2`;
7. assert no controlled secret or numeric readiness score appears;
8. assert the required disclaimer remains last in Markdown.

For the portable fixture, prove literal argument handling. For the monorepo, prove the uncovered package remains a coverage gap. Add wrong-fingerprint and stale-plan cases proving no marker was created.

- [ ] **Step 3: Run the CLI and acceptance tests to confirm failure**

```bash
pnpm vitest run tests/cli/cli.test.ts tests/acceptance/universal-launch-baseline.acceptance.test.ts
```

- [ ] **Step 4: Extract command adapters and implement the dispatcher**

Move existing review parsing and execution into `src/cli/commands/review.ts` without changing it. Keep `src/cli.ts` responsible only for selecting `review`, `plan`, or `execute`, installing/removing the execute `SIGINT` handler, and mapping known usage/collision errors to stable messages.

`plan` must create exactly one exclusive JSON file. `execute` must load JSON as untrusted input, validate before type use, and never execute on parse or validation failure.

- [ ] **Step 5: Run source and compiled CLI smoke tests**

```bash
pnpm build
pnpm vitest run tests/cli/cli.test.ts tests/acceptance/universal-launch-baseline.acceptance.test.ts
```

The acceptance test must launch both the source CLI and `dist/src/cli.js` against temporary fixture copies. Do not run the fixture in the repository copy because its marker files are intentional working-tree changes.

- [ ] **Step 6: Commit Task 9**

```bash
git add src/cli/commands/review.ts src/cli/commands/plan.ts src/cli/commands/execute.ts src/cli.ts fixtures/verification-node fixtures/verification-portable fixtures/verification-monorepo tests/acceptance/universal-launch-baseline.acceptance.test.ts tests/cli/cli.test.ts
git commit -m "feat: add plan and execute commands"
```

---

### Task 10: Add versioning, documentation, examples, and multi-platform CI

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/foundation-coverage.md`
- Modify: `ROADMAP.md`
- Modify: `skills/post-vibe-clarity/SKILL.md`
- Modify: `docs/examples/sample-report.md`
- Modify: `examples/launch-candidate/README.md`
- Modify: `examples/launch-candidate/before/package.json`
- Modify: `examples/launch-candidate/after/package.json`
- Modify: `docs/installation/agent-skills.md`
- Modify: `docs/installation/claude-code.md`
- Modify: `docs/installation/codex.md`
- Modify: `docs/installation/cursor.md`
- Modify: `docs/installation/windsurf.md`
- Modify: `docs/installation/compatibility.yaml`
- Modify: `tests/repository/installation-docs.test.ts`
- Modify: `tests/repository/foundation-coverage.test.ts`
- Modify: `tests/repository/sample-report.test.ts`
- Modify: `tests/skills/foundation-skills.test.ts`

**Interfaces:**
- Produces package version `0.2.0` and script `test:executor`.
- Produces public plain-language usage and accurate coverage boundaries.
- Produces a Linux/macOS/Windows executor acceptance matrix.
- Preserves version-pinned installation and recorded revision provenance; publishing/tagging remains a separately approved release action.

- [ ] **Step 1: Write failing repository-document tests**

Update repository tests to require:

- five canonical skills, including `universal-verification`;
- plan and execute examples;
- the containment warning near those examples;
- no production-ready verdict or numeric score;
- current and omitted coverage statements;
- valid local links;
- generated sample-report linkage to a real acceptance fixture;
- no emoji or AI/authorship attribution.

Run:

```bash
pnpm vitest run tests/repository tests/skills/foundation-skills.test.ts
```

Expected: FAIL until the public documentation is updated.

- [ ] **Step 2: Add package scripts and the CI matrix**

Set package version to `0.2.0` and add:

```json
{
  "scripts": {
    "test:executor": "vitest run tests/verification tests/acceptance/universal-launch-baseline.acceptance.test.ts"
  }
}
```

Keep the existing Ubuntu `verify` job. Add an `executor` job with `fail-fast: false` and matrix:

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
runs-on: ${{ matrix.os }}
```

Each matrix entry checks out, installs pnpm 9.12.0, sets up Node 24, installs with the frozen lockfile, and runs `pnpm test:executor`.

- [ ] **Step 3: Update user-facing instructions in plain language**

README and orchestrator skill must explain:

- read-only review versus optional local verification;
- plan first, approve exact fingerprint, then execute;
- declared commands only;
- how exclusions remain unverified;
- `.postvibe/` is optional and never auto-added to `.gitignore`;
- scripts may read files, load `.env`, change files, start processes, or use the network;
- passing commands do not prove production readiness or complete security;
- exact example commands for Node and portable configuration.

Update foundation coverage and roadmap so Level 1 command evidence is implemented while deployment, operations, performance, legal sufficiency, deep shape packs, and strong sandboxing remain gaps. Regenerate the sample report from a real fixture rather than hand-editing it.

Update the before/after launch candidate so both halves declare safe verification scripts. Its guide must show that command evidence improves after fixes while unknown production areas remain unknown.

Update all installation guides and compatibility assertions for the fifth canonical skill and the `v0.2.0` pinned revision. Do not create or push the tag in this task; the release is not published until separately approved.

- [ ] **Step 4: Run all local gates**

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm verify:foundation
pnpm test:executor
git diff --check
```

Expected: all tests pass; source and compiled CLIs both complete plan/execute smoke tests; generated docs contain no controlled secret, numeric readiness score, unconditional launch verdict, or AI/authorship attribution.

- [ ] **Step 5: Commit Task 10**

```bash
git add package.json pnpm-lock.yaml .github/workflows/ci.yml README.md docs/foundation-coverage.md ROADMAP.md skills/post-vibe-clarity/SKILL.md docs/examples/sample-report.md examples/launch-candidate docs/installation tests/repository tests/skills/foundation-skills.test.ts
git commit -m "docs: publish universal verification guidance"
```

- [ ] **Step 6: Verify the branch and request review**

```bash
git status --short
git log --oneline origin/main..HEAD
pnpm check
```

Expected: clean worktree, the design commit plus ten focused implementation commits, and all checks passing. Request a correctness review focused on approval bypass, stale-plan gaps, output redaction, orphan processes, report invariants, cross-platform behavior, installation accuracy, and unchanged read-only behavior.

---

## Separate follow-up patch

Do not mix the annotated-tag shallow-clone warning cleanup into this feature branch. After this wave is merged, create a separate bounded patch that updates and tests the version-pinned installation commands while preserving exact tag/revision provenance.

## Plain-language completion checkpoint

At the end of this plan, a user can:

1. ask PostVibeClarity what it wants to run;
2. inspect and approve one exact plan;
3. run only that approved plan;
4. see what passed, failed, changed, or stayed unknown;
5. receive a report that still does not claim the project is production-ready or fully secure.
