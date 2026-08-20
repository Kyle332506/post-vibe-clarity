# Command Evidence Hardening design

Status: approved for implementation planning on 2026-08-20.

## Plain-language summary

PostVibeClarity can confirm that a user approved an exact command and that its direct launcher matched the recorded evidence before launch. It cannot freeze every file, dependency, operating-system library, or same-user process that the command may use afterward. Plans and reports must state that boundary plainly instead of implying that all executed code was immutable.

This follow-up also guarantees a safe location for partial evidence when a command occupies a planned artifact filename, fails closed when a private key is cut off inside truncated output, and makes every executor CI job build the compiled CLI before testing it.

These changes improve the accuracy and safety of evidence. They do not guarantee production readiness, complete security, compliance, or defect-free software.

## Problems being corrected

The final scoped review of the Universal Launch Baseline found four remaining problems:

1. Direct command and launcher hashes were described as frozen even though files can change after the last check and commands can load additional unrecorded files.
2. A command-created collision at the final execution path can prevent the promised partial evidence record.
3. Later lines of an unterminated multiline private key can survive truncated-output redaction.
4. The executor CI matrix invokes ignored compiled output without building it in that clean job.

## Goals

- Define command approval as exact command authorization, not complete runtime-source immutability.
- Carry one exact, versioned approval-boundary contract through plans, executions, reports, schemas, validation, and documentation.
- Preserve direct launcher checks as useful time-bound evidence without describing them as a sandbox or freeze.
- Guarantee a validated partial execution record at a pre-created recovery boundary after any post-start final-path collision.
- Ensure truncated private-key output cannot retain later key-body lines.
- Make `pnpm test:executor` self-contained on clean Linux, macOS, and Windows checkouts.
- Add mutation-sensitive tests for every corrected failure path.

## Not included

- No sandbox, container, virtual machine, or privilege separation.
- No snapshot of the complete project, dependency tree, runtime, or operating system.
- No static analysis claiming to discover every transitive import or dynamically loaded file.
- No blocking of network or out-of-project filesystem access.
- No automatic cleanup of project changes made by approved commands.
- No deployment, remediation, push, merge, tag, or release action.
- No production-readiness, security, compliance, certification, score, or defect-free verdict.

## Command approval boundary

The plan receives one required fingerprinted object:

```ts
interface CommandApprovalBoundary {
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

The strings and order are exact policy constants, not user-controlled prose. JSON Schemas and semantic validators require the exact object. The object is part of the plan fingerprint.

The execution record must copy the exact boundary from the approved plan. Execution-to-plan linkage rejects any difference. The verified report must copy it from the execution, validate it through the report linkage, and render both the confirmed and unconfirmed items in plain language.

Existing direct checks remain required:

- the exact package-script or portable-config declaration must still be checked and match before attempted start;
- the resolved argument array remains fingerprinted;
- the direct executable, entry point, and package manifest evidence remain checked where applicable;
- a detected mismatch stops that command and records it as unverified.

These are pre-launch tamper checks. The interval between checking and use remains unprotected: a live path can change after the check, and a launched program can import other files. The design, implementation plan, coverage documentation, skills, CLI wording, and sample report must not use `frozen`, `immutable source`, or equivalent language for the complete executed code path.

Plans created before this unreleased contract change do not contain the required boundary and must fail validation with the existing stable invalid-plan behavior. Users regenerate and approve a new plan. No backward-compatibility reader is required because v0.2 has not been released.

## Partial evidence recovery

The orchestrator already creates an OS-owned recovery directory before commands start and excludes its exact paths from project observation. This follow-up makes that boundary the guaranteed fallback for every failure after command execution begins.

Normal success remains unchanged: completed execution and report artifacts publish together at their planned final paths.

On post-start failure:

1. Build and validate the partial execution object with the fixed sanitized orchestration coverage gap.
2. If the output directory is still the approved directory and the final execution path is available, publish the partial record there.
3. If the final execution path is occupied, its ownership changed, or publication fails because of a collision, publish the same validated partial record at the already-created recovery path.
4. Never remove, replace, truncate, or overwrite the unexpected final-path entry.
5. Return a `VerificationPostProcessingError` containing the actual partial-evidence path.
6. Publish no final report for a partial post-processing result.

The fallback must cover collisions discovered during completed-pair publication and collisions discovered while attempting normal partial publication. Recovery publication failure remains an explicit error and must not be described as preserved evidence.

This approach avoids placing empty reservation files at public artifact names. An abrupt crash can still leave owned staging or lock entries, but no incomplete file is presented as a completed execution or report.

## Unterminated private-key redaction

The streaming output tracker must expose whether processing ends inside an open private-key block.

When output is truncated and a private-key block remains open at `finish()`:

- keep the already bounded and redacted head;
- keep the truncation marker;
- replace the entire retained tail with `[REDACTED]`;
- do not attempt to preserve later diagnostic lines from that tail.

Complete private-key blocks continue using the existing redaction behavior. Non-key truncation continues preserving safe head and tail evidence.

The required regression test must place a unique key-body value on the second or later retained tail line without an `END ... PRIVATE KEY` marker. Neither that value nor any later key-body line may appear in collected or recorder-level output.

## Clean executor CI

`pnpm test:executor` becomes self-contained:

```json
"test:executor": "pnpm build && vitest run tests/verification tests/acceptance/universal-launch-baseline.acceptance.test.ts"
```

The existing Linux, macOS, and Windows executor matrix continues calling only `pnpm test:executor` after dependency installation. It no longer relies on a previous job or an untracked local `dist` directory.

Repository tests must assert that the executor script builds before the test command and that the matrix invokes this self-contained script. Local verification must include a run that begins without `dist` and proves the compiled CLI is created before acceptance tests start.

## Contract and reporting changes

The following evidence chain must carry the exact approval boundary:

```text
plan fingerprint
  -> plan validation
  -> execution linkage
  -> verified report linkage
  -> JSON or Markdown rendering
```

Markdown uses a short section named `Command approval boundary`. It states what was checked and what remains outside the evidence. The containment warning and required disclaimer remain exact and unchanged.

The base read-only review remains unaffected. No command runs unless the user separately creates and approves a verification plan.

## Testing strategy

Implementation follows test-driven development.

### Approval contract

- Reject plans missing or changing the exact approval-boundary object.
- Show that the boundary changes the plan fingerprint.
- Reject execution and report artifacts whose boundary differs from the plan.
- Assert exact Markdown wording and placement before the unchanged disclaimer.
- Reject prohibited claims that imply transitive code immutability.

### Recovery

- Have an approved command create the planned final execution path after preflight.
- Prove the foreign file remains byte-for-byte unchanged.
- Prove a validated partial execution is written to the recovery path.
- Prove the thrown error names that actual recovery path and no report is published.

### Redaction

- Confirm a truncated multiline private key with multiple retained body lines leaks none of them.
- Confirm ordinary truncated output still preserves safe tail evidence.
- Confirm recorder-level re-redaction does not reintroduce raw content.

### CI

- Assert `test:executor` runs the build before Vitest.
- Run the executor command from a state without `dist` and confirm the compiled CLI is created.
- Keep the Linux, macOS, and Windows matrix.

### Final gates

- `pnpm check`
- `pnpm verify:foundation`
- a clean-state `pnpm test:executor`
- `git diff --check`
- source and compiled CLI smoke tests

## Success criteria

The follow-up is ready for final review only when:

- plans and reports describe command authorization honestly and consistently;
- no contract claims complete runtime-source immutability;
- every post-start final execution-path collision produces validated partial evidence at a safe path without changing the foreign entry;
- truncated unterminated private keys cannot expose later retained lines;
- each executor matrix job builds its own compiled CLI;
- all focused and repository verification gates pass;
- no push, merge, tag, or release has occurred.
