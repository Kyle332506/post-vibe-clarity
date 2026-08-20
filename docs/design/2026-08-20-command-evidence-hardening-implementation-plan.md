# Command Evidence Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the four residual evidence-safety problems from the Universal Launch Baseline final review without adding a sandbox or overstating what command approval proves.

**Architecture:** Add one exact fingerprinted command-authorization boundary that flows through plan, execution, and report contracts. Preserve current pre-launch checks as time-bound evidence, guarantee partial-record recovery for final execution-path collisions, fail closed for truncated open private-key blocks, and make the executor test command build its own compiled CLI.

**Tech Stack:** TypeScript, Node.js 24, JSON Schema 2020-12, Vitest, pnpm, GitHub Actions.

**Spec:** `docs/design/2026-08-20-command-evidence-hardening-design.md`

## Global Constraints

- Preserve the exact disclaimer: `This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.`
- Preserve the exact containment warning: `Commands run as local processes with the current user privileges; this is not a security sandbox and does not block network or out-of-project filesystem access.`
- Do not describe transitive runtime code, dependencies, or same-user filesystem state as frozen, immutable, approved source, trusted, or safe.
- Do not add scores, certifications, production-ready verdicts, security verdicts, attribution, or emojis.
- Keep `shell: false`; never add `cmd.exe`, shell command strings, or package-manager execution.
- Preserve read-only `review` behavior and the explicit plan-then-approve execution flow.
- Preserve foreign artifact-path content byte-for-byte and never overwrite it.
- Add no runtime or development dependency.
- Support Node.js 24 and the configured Linux, macOS, and Windows CI matrix.
- Use ordinal deterministic ordering for all fingerprinted or linked arrays.
- Use TDD: observe the focused test fail for the intended reason, implement the smallest correction, then rerun focused regressions.
- Use `apply_patch` for file edits.
- Do not push, merge, tag, release, publish, or change external repository settings.

---

### Task 1: Add the exact command-authorization evidence contract

**Files:**
- Create: `src/verification/command-approval-boundary.ts`
- Modify: `src/model/verification.ts`
- Modify: `src/model/verified-report.ts`
- Modify: `src/verification/build-verification-plan.ts`
- Modify: `src/verification/plan-fingerprint.ts`
- Modify: `src/verification/run-approved-verification.ts`
- Modify: `src/report/build-verified-report.ts`
- Modify: `src/validation/verification-plan-schema.ts`
- Modify: `src/validation/verification-execution-schema.ts`
- Modify: `src/validation/report-v02-schema.ts`
- Modify: `schemas/verification-plan-0.1.schema.json`
- Modify: `schemas/verification-execution-0.1.schema.json`
- Modify: `schemas/report-0.2.schema.json`
- Modify: `tests/fixtures/sample-verification-plan.ts`
- Modify: `tests/fixtures/sample-verification-execution.ts`
- Modify: `tests/verification/plan-fingerprint.test.ts`
- Modify: `tests/validation/verification-plan-schema.test.ts`
- Modify: `tests/validation/verification-execution-schema.test.ts`
- Modify: `tests/validation/report-v02-schema.test.ts`
- Modify: `tests/report/build-verified-report.test.ts`

**Interfaces:**
- Produces: `CommandApprovalBoundary` in `src/model/verification.ts`.
- Produces: `COMMAND_APPROVAL_BOUNDARY` and `copyCommandApprovalBoundary()` in `src/verification/command-approval-boundary.ts`.
- Produces: required `approvalBoundary` fields on `VerificationPlan`, `VerificationExecution`, and `VerifiedReadinessReport['verification']`.
- Consumes: existing plan fingerprinting, execution linkage, and report linkage functions.

- [ ] **Step 1: Add focused failing contract tests**

Add these cases before changing production types or schemas:

```ts
it('rejects a plan without the exact command approval boundary', async () => {
  const missing = structuredClone(sampleVerificationPlan) as unknown as Record<string, unknown>;
  delete missing.approvalBoundary;
  expect((await invalidErrors(missing)).join('\n')).toContain('/approvalBoundary');

  const changed = structuredClone(sampleVerificationPlan);
  changed.approvalBoundary.doesNotConfirm[0] = 'changed-policy-text' as never;
  expect((await invalidErrors(changed)).join('\n')).toContain('/approvalBoundary');
});
```

```ts
it('fingerprints the command approval boundary', () => {
  const changed = structuredClone(sampleVerificationPlan);
  changed.approvalBoundary.policyVersion = 'changed-policy' as never;
  expect(fingerprintPlan(changed)).not.toBe(fingerprintPlan(sampleVerificationPlan));
});
```

```ts
it('requires execution and report approval boundaries to match the approved plan', async () => {
  const execution = structuredClone(sampleVerificationExecution);
  execution.approvalBoundary.doesNotConfirm.reverse();
  expect(validateExecutionAgainstPlan(execution, sampleVerificationPlan)).toContain(
    '/approvalBoundary must match the verification plan',
  );

  const report = await sampleVerifiedReadinessReport();
  report.verification.approvalBoundary.confirms.reverse();
  expect((await validateVerifiedReadinessReport(
    report,
    sampleVerificationPlan,
    sampleVerificationExecution,
    '/evidence/execution.json',
  )).ok).toBe(false);
});
```

- [ ] **Step 2: Run the focused tests and confirm the intended failures**

Run:

```bash
pnpm vitest run tests/verification/plan-fingerprint.test.ts tests/validation/verification-plan-schema.test.ts tests/validation/verification-execution-schema.test.ts tests/validation/report-v02-schema.test.ts tests/report/build-verified-report.test.ts
```

Expected: FAIL because `approvalBoundary` does not exist in the model, fixtures, or schemas.

- [ ] **Step 3: Define the exact policy constant and model**

Add this model in `src/model/verification.ts`:

```ts
export interface CommandApprovalBoundary {
  policyVersion: 'command-authorization/0.2';
  confirms: [
    'exact-command-declaration',
    'resolved-argument-array',
    'direct-launcher-evidence-checked-before-start',
  ];
  doesNotConfirm: [
    'transitive-runtime-loads',
    'immutability-between-check-and-use',
    'same-user-process-isolation',
    'operating-system-runtime-closure',
  ];
}
```

Add required `approvalBoundary: CommandApprovalBoundary` properties to the plan and execution interfaces and to the verified report's `verification` object.

Create `src/verification/command-approval-boundary.ts`:

```ts
import type { CommandApprovalBoundary } from '../model/verification.js';

export const COMMAND_APPROVAL_BOUNDARY: CommandApprovalBoundary = Object.freeze({
  policyVersion: 'command-authorization/0.2',
  confirms: Object.freeze([
    'exact-command-declaration',
    'resolved-argument-array',
    'direct-launcher-evidence-checked-before-start',
  ]),
  doesNotConfirm: Object.freeze([
    'transitive-runtime-loads',
    'immutability-between-check-and-use',
    'same-user-process-isolation',
    'operating-system-runtime-closure',
  ]),
}) as CommandApprovalBoundary;

export function copyCommandApprovalBoundary(): CommandApprovalBoundary {
  return structuredClone(COMMAND_APPROVAL_BOUNDARY);
}
```

If readonly tuple typing rejects the frozen literal, define a deeply readonly internal constant and return a structured clone typed as `CommandApprovalBoundary`; do not weaken the public tuple types to arbitrary strings.

- [ ] **Step 4: Carry the boundary through plan, execution, and report construction**

Add `approvalBoundary: copyCommandApprovalBoundary()` to `FingerprintPlanInput` and generated plans. Add `approvalBoundary: structuredClone(options.plan.approvalBoundary)` to both completed and partial execution objects. Add `approvalBoundary: structuredClone(execution.approvalBoundary)` to `report.verification`.

Keep this exact evidence chain:

```ts
plan.approvalBoundary
  -> execution.approvalBoundary
  -> report.verification.approvalBoundary
```

- [ ] **Step 5: Add exact JSON Schema definitions**

Add an `approvalBoundary` definition with `additionalProperties: false`, exact required keys, exact tuple lengths, and `const` values. Example shape:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["policyVersion", "confirms", "doesNotConfirm"],
  "properties": {
    "policyVersion": { "const": "command-authorization/0.2" },
    "confirms": {
      "type": "array",
      "prefixItems": [
        { "const": "exact-command-declaration" },
        { "const": "resolved-argument-array" },
        { "const": "direct-launcher-evidence-checked-before-start" }
      ],
      "minItems": 3,
      "maxItems": 3
    },
    "doesNotConfirm": {
      "type": "array",
      "prefixItems": [
        { "const": "transitive-runtime-loads" },
        { "const": "immutability-between-check-and-use" },
        { "const": "same-user-process-isolation" },
        { "const": "operating-system-runtime-closure" }
      ],
      "minItems": 4,
      "maxItems": 4
    }
  }
}
```

Require this object in plan and execution schemas. Reference the execution schema definition from report schema linkage, following the existing observation-boundary pattern.

- [ ] **Step 6: Enforce semantic and linkage equality**

Use `isDeepStrictEqual` against `COMMAND_APPROVAL_BOUNDARY` in plan and execution semantic validation. Add exact equality checks:

```ts
if (!isDeepStrictEqual(execution.approvalBoundary, plan.approvalBoundary)) {
  errors.push('/approvalBoundary must match the verification plan');
}
```

```ts
if (!isDeepStrictEqual(report.verification.approvalBoundary, execution.approvalBoundary)) {
  errors.push('/verification/approvalBoundary must match the verification execution');
}
```

- [ ] **Step 7: Update typed fixtures and rerun focused tests**

Use `copyCommandApprovalBoundary()` in sample plan and execution fixtures. Ensure `sampleVerifiedReadinessReport()` receives the field through the real builder rather than hard-coding a second copy.

Run:

```bash
pnpm vitest run tests/verification/plan-fingerprint.test.ts tests/validation/verification-plan-schema.test.ts tests/validation/verification-execution-schema.test.ts tests/validation/report-v02-schema.test.ts tests/report/build-verified-report.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/model/verification.ts src/model/verified-report.ts src/verification/command-approval-boundary.ts src/verification/build-verification-plan.ts src/verification/plan-fingerprint.ts src/verification/run-approved-verification.ts src/report/build-verified-report.ts src/validation/verification-plan-schema.ts src/validation/verification-execution-schema.ts src/validation/report-v02-schema.ts schemas/verification-plan-0.1.schema.json schemas/verification-execution-0.1.schema.json schemas/report-0.2.schema.json tests/fixtures tests/verification/plan-fingerprint.test.ts tests/validation tests/report/build-verified-report.test.ts
git commit -m "feat: define command approval evidence boundary"
```

### Task 2: Explain the approval boundary in user-visible evidence

**Files:**
- Modify: `src/report/render-verified-markdown.ts`
- Modify: `src/cli/commands/plan.ts`
- Modify: `tests/report/render-verified-report.test.ts`
- Modify: `tests/cli/cli.test.ts`
- Modify: `tests/acceptance/universal-launch-baseline.acceptance.test.ts`
- Modify: `tests/repository/sample-report.test.ts`
- Modify: `tests/repository/foundation-coverage.test.ts`
- Modify: `tests/skills/foundation-skills.test.ts`
- Modify: `docs/design/2026-08-18-universal-launch-baseline-design.md`
- Modify: `docs/design/2026-08-18-universal-launch-baseline-implementation-plan.md`
- Modify: `docs/foundation-coverage.md`
- Modify: `docs/examples/sample-report.md`
- Modify: `skills/universal-verification/SKILL.md`

**Interfaces:**
- Consumes: `CommandApprovalBoundary` and its exact plan/execution/report linkage from Task 1.
- Produces: plain-language Markdown and CLI explanations that make the confirmed and unconfirmed evidence visible.

- [ ] **Step 1: Add failing rendering and wording tests**

Add exact Markdown assertions:

```ts
expect(markdown).toContain('## Command approval boundary');
expect(markdown).toContain('The exact command declaration and direct launch details were checked before start.');
expect(markdown).toContain('This does not freeze imported files, dependencies, operating-system code, or changes made by other processes.');
expect(markdown.endsWith(`${VERIFICATION_DISCLAIMER}\n`)).toBe(true);
```

Add a plan CLI assertion that the output includes:

```text
Approval boundary: approves the exact command and direct launch checks; it does not freeze imported files or dependencies.
```

Add a recursive acceptance scan that rejects the prohibited phrases `complete runtime source approved`, `transitive code approved`, and `all executed code immutable`, case-insensitively, across plan/execution/report JSON and rendered Markdown.

- [ ] **Step 2: Run focused presentation tests and confirm failure**

Run:

```bash
pnpm vitest run tests/report/render-verified-report.test.ts tests/cli/cli.test.ts tests/acceptance/universal-launch-baseline.acceptance.test.ts
```

Expected: FAIL because the boundary is not rendered or summarized.

- [ ] **Step 3: Render the exact plain-language boundary**

In `renderVerifiedMarkdown`, add this section before the containment warning:

```md
## Command approval boundary

The exact command declaration and direct launch details were checked before start.

This does not freeze imported files, dependencies, operating-system code, or changes made by other processes.
```

Generate it only from a report whose exact policy object has already passed validation. Do not translate arbitrary artifact-controlled strings into headings or prose.

In the plan command output, append the exact one-line summary after the containment warning and before the execute instruction.

- [ ] **Step 4: Correct old overstatements and update portable guidance**

Replace claims such as `frozen launcher`, `exact-source approval`, or `immutable launcher evidence` when they imply the entire runtime code path is fixed. Use these concepts consistently:

- exact declaration and resolved arguments are approved;
- direct launcher evidence is checked before start;
- transitive loads and the check/use interval remain outside the evidence;
- commands are not sandboxed.

Update the universal-verification skill so an agent explains this boundary before asking the user to approve execution.

- [ ] **Step 5: Regenerate the sample report through the real fixture path**

Update `tests/repository/sample-report.test.ts` presentation-only placeholders for the new boundary while preserving validated plan/execution/report linkage. Run the test to regenerate `docs/examples/sample-report.md`; do not hand-edit evidence outcomes.

Run:

```bash
pnpm vitest run tests/repository/sample-report.test.ts tests/repository/foundation-coverage.test.ts tests/skills/foundation-skills.test.ts
pnpm vitest run tests/report/render-verified-report.test.ts tests/cli/cli.test.ts tests/acceptance/universal-launch-baseline.acceptance.test.ts
```

Expected: PASS, with the exact disclaimer still final.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/report/render-verified-markdown.ts src/cli/commands/plan.ts tests/report/render-verified-report.test.ts tests/cli/cli.test.ts tests/acceptance/universal-launch-baseline.acceptance.test.ts tests/repository/sample-report.test.ts tests/repository/foundation-coverage.test.ts tests/skills/foundation-skills.test.ts docs/design/2026-08-18-universal-launch-baseline-design.md docs/design/2026-08-18-universal-launch-baseline-implementation-plan.md docs/foundation-coverage.md docs/examples/sample-report.md skills/universal-verification/SKILL.md
git commit -m "docs: explain command approval boundaries"
```

### Task 3: Guarantee partial evidence after final execution-path collisions

**Files:**
- Modify: `src/verification/run-approved-verification.ts`
- Modify: `tests/verification/run-approved-verification.test.ts`
- Modify: `tests/cli/cli.test.ts`

**Interfaces:**
- Consumes: existing `VerificationPostProcessingError`, recovery directory, partial execution validator, and exclusive artifact writer.
- Produces: a private helper that publishes partial evidence to the planned execution path when safe and otherwise to the pre-created recovery path.

- [ ] **Step 1: Add the failing execution-path collision test**

Use deterministic time so the planned final execution path is known. Have the first fake executor call create that exact path with fixed foreign bytes after preflight. Then force report/post-processing publication and assert:

```ts
await expect(runApprovedVerification(runOptions)).rejects.toMatchObject({
  name: 'VerificationPostProcessingError',
  execution: expect.objectContaining({ status: 'partial' }),
  executionPath: expect.stringContaining('postvibe-partial-'),
});

expect(await readFile(plannedExecutionPath, 'utf8')).toBe('foreign execution target\n');
expect(await validateVerificationExecution(recoveredExecution)).toEqual({ ok: true });
expect(recoveredExecution.coverageGaps).toContainEqual(ORCHESTRATION_COVERAGE_GAP);
expect(await pathExists(plannedReportPath)).toBe(false);
```

Also assert the recovery path is not the occupied final path and that temporary/lock entries at the stable output directory are gone.

- [ ] **Step 2: Run the focused collision test and confirm failure**

Run:

```bash
pnpm vitest run tests/verification/run-approved-verification.test.ts -t "recovers partial evidence when a command occupies the final execution path"
```

Expected: FAIL because the current catch path retries the occupied execution path and loses the partial record.

- [ ] **Step 3: Extract one partial-publication helper**

Add a private helper with an explicit result:

```ts
interface PartialPublicationResult {
  executionPath: string;
  retainedRecoveryDirectory: boolean;
}

async function publishPartialExecution(
  partialContents: string,
  executionPath: string,
  recoveryExecutionPath: string,
  outputBoundaryStable: boolean,
): Promise<PartialPublicationResult> {
  if (outputBoundaryStable) {
    try {
      await writeArtifactExclusively(executionPath, partialContents);
      return { executionPath, retainedRecoveryDirectory: false };
    } catch (error) {
      if (!(error instanceof ArtifactFileCollisionError)
        && !(error instanceof ArtifactFileOwnershipError)) throw error;
    }
  }

  await writeArtifactExclusively(recoveryExecutionPath, partialContents);
  return { executionPath: recoveryExecutionPath, retainedRecoveryDirectory: true };
}
```

Import the exact artifact error classes from `src/cli/artifact-output.ts`. If publication helpers wrap a collision in `ArtifactFileRecoveryError`, include that ownership-derived error in the fallback decision. Do not catch validation errors or recovery-path write failures as if evidence were preserved.

- [ ] **Step 4: Route every post-start partial path through the helper**

Release or preserve staging entries using the existing ownership rules before calling the helper. Set `retainRecoveryDirectory` from the helper result and throw:

```ts
throw new VerificationPostProcessingError(partialExecution, published.executionPath);
```

Never unlink or rewrite the foreign final execution entry.

- [ ] **Step 5: Add CLI proof for the surfaced recovery path**

At the CLI adapter boundary, assert that a `VerificationPostProcessingError` prints the actual recovered execution path and no report path. Keep the message sanitized; do not include raw nested filesystem or parser errors.

- [ ] **Step 6: Run orchestration and CLI regressions**

Run:

```bash
pnpm vitest run tests/verification/run-approved-verification.test.ts tests/cli/artifact-output.test.ts tests/cli/cli.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/verification/run-approved-verification.ts tests/verification/run-approved-verification.test.ts tests/cli/cli.test.ts
git commit -m "fix: preserve partial evidence after target collisions"
```

### Task 4: Fail closed for truncated open private-key blocks

**Files:**
- Modify: `src/verification/redact-command-output.ts`
- Modify: `tests/verification/redact-command-output.test.ts`
- Modify: `tests/verification/run-approved-verification.test.ts`

**Interfaces:**
- Consumes: the existing streaming sensitive-boundary tracker and bounded head/tail collector.
- Produces: an explicit `privateKeyOpen()` tracker state used only during collector finalization.

- [ ] **Step 1: Add a failing multiline regression test**

Use a small output limit and multiple unique retained lines:

```ts
it('drops every retained tail line when truncation ends inside a private key', () => {
  const collector = createCommandOutputCollector(192);
  collector.append('safe-prefix\n');
  collector.append('-----BEGIN PRIVATE KEY-----\n');
  collector.append(`${'A'.repeat(240)}\n`);
  collector.append('SECOND_RETAINED_KEY_LINE_7vK2\n');
  collector.append('THIRD_RETAINED_KEY_LINE_9mQ4\n');

  const result = collector.finish();

  expect(result.truncated).toBe(true);
  expect(result.output).toContain('[REDACTED]');
  expect(result.output).not.toContain('SECOND_RETAINED_KEY_LINE_7vK2');
  expect(result.output).not.toContain('THIRD_RETAINED_KEY_LINE_9mQ4');
});
```

Add one adjacent control test proving ordinary non-sensitive truncated output still preserves its safe final line.

- [ ] **Step 2: Run the focused tests and confirm the key-body leak**

Run:

```bash
pnpm vitest run tests/verification/redact-command-output.test.ts -t "drops every retained tail line|preserves an ordinary safe tail"
```

Expected: the multiline private-key test fails because a later retained key-body line remains visible.

- [ ] **Step 3: Expose open private-key state from the tracker**

Extend the private-key tracker and combined boundary tracker with a read-only query:

```ts
interface SensitiveBoundaryTracker {
  observe(byte: number, offset: number): SensitiveByteObservation;
  privateKeyOpen(): boolean;
  reset(): void;
}
```

`privateKeyOpen()` returns true only after a recognized `BEGIN ... PRIVATE KEY` marker has started and before its matching `END ... PRIVATE KEY` marker completes. `reset()` must clear the state.

- [ ] **Step 4: Drop the complete retained tail for an open key**

In `finish()`, use:

```ts
const redactedTail = boundaryTracker.privateKeyOpen()
  ? '[REDACTED]'
  : redactPrivateKeyTail(tailSensitivity[0] === 1 ? redactBoundaryTail(rawTail) : rawTail);
raw = `${redactPrivateKeys(rawHead)}${truncationMarker}${redactedTail}`;
```

Do not include any bytes from `rawTail` when the key remains open. Preserve the existing buffer zeroing and disposal behavior in `finally`.

- [ ] **Step 5: Add recorder-level defense proof**

Use a hostile replacement executor returning the multiline truncated key output. Assert the persisted result contains `[REDACTED]` and neither unique later key-body value. This proves the orchestration recorder does not reintroduce the secret.

- [ ] **Step 6: Run redaction and orchestration regressions**

Run:

```bash
pnpm vitest run tests/verification/redact-command-output.test.ts tests/verification/run-approved-verification.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/verification/redact-command-output.ts tests/verification/redact-command-output.test.ts tests/verification/run-approved-verification.test.ts
git commit -m "fix: redact truncated private key tails"
```

### Task 5: Make executor CI self-contained and run final gates

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml` only if the workflow wording needs to make the self-contained boundary explicit
- Modify: `tests/repository/foundation-coverage.test.ts`
- Modify: `tests/repository/github-metadata.test.ts`
- Modify: `docs/foundation-coverage.md`

**Interfaces:**
- Consumes: compiled CLI acceptance tests under `tests/acceptance/universal-launch-baseline.acceptance.test.ts`.
- Produces: a `test:executor` script that always builds `dist/src/cli.js` before Vitest starts.

- [ ] **Step 1: Add failing repository assertions**

Require the exact self-contained script:

```ts
expect(manifest.scripts?.['test:executor']).toBe(
  'pnpm build && vitest run tests/verification tests/acceptance/universal-launch-baseline.acceptance.test.ts',
);
```

Require CI to keep calling that script:

```ts
expect(workflow).toContain('run: pnpm test:executor');
expect(workflow).not.toContain('run: vitest run tests/verification');
```

- [ ] **Step 2: Run repository tests and confirm failure**

Run:

```bash
pnpm vitest run tests/repository/foundation-coverage.test.ts tests/repository/github-metadata.test.ts
```

Expected: FAIL because `test:executor` does not build first.

- [ ] **Step 3: Make the executor script self-contained**

Change only the package script unless a workflow comment is needed:

```json
"test:executor": "pnpm build && vitest run tests/verification tests/acceptance/universal-launch-baseline.acceptance.test.ts"
```

Document that every OS matrix job builds its own compiled CLI and does not depend on another job's workspace.

- [ ] **Step 4: Prove the command works without a pre-existing compiled CLI**

Use a unique temporary backup directory and restore only if verification fails before a new build is produced:

```bash
PVC_DIST_BACKUP="$(mktemp -d)/dist"
if test -d dist; then mv dist "$PVC_DIST_BACKUP"; fi
pnpm test:executor
test -f dist/src/cli.js
```

Expected: PASS. The command builds `dist/src/cli.js`, then all executor and source/compiled acceptance tests pass. Do not delete or overwrite the backup path during the proof.

- [ ] **Step 5: Run the full fresh verification gates**

Run:

```bash
pnpm check
pnpm verify:foundation
pnpm test:executor
git diff --check
```

Expected:

- TypeScript build succeeds.
- All repository tests pass, apart from intentional platform-specific skips.
- Foundation review exits successfully and reports its explicit evidence gaps.
- Executor tests pass after performing their own build.
- No whitespace errors are reported.

If the restricted environment blocks loopback acceptance tests with `EPERM`, rerun the same command with local loopback permission and record both results. Do not change server code solely to accommodate the restricted runner.

- [ ] **Step 6: Scan final tracked content for prohibited claims and attribution**

Run:

```bash
rg -ni "certified|certifies production|fully secure|production.ready verdict|all executed code immutable|transitive code approved|generated by|co-authored-by|chatgpt|openai" README.md docs skills src tests schemas .github package.json
```

Review every match in context. Allowed disclaimer phrases such as `does not certify` remain. Remove any unconditional verdict, complete-source promise, attribution, or generated-by text.

- [ ] **Step 7: Commit Task 5**

```bash
git add package.json .github/workflows/ci.yml tests/repository/foundation-coverage.test.ts tests/repository/github-metadata.test.ts docs/foundation-coverage.md
git commit -m "ci: build executor evidence on every platform"
```

- [ ] **Step 8: Record final evidence without external actions**

Record the final commit range, test counts, platform skips, coverage boundaries, and remaining limitations in the plan ledger. Preserve the branch for whole-branch review. Do not push, merge, tag, or release.
