# Task 9 report: integrated review orchestration and CLI

## Outcome

Implemented the first complete PostVibeClarity review slice. `runReview` now resolves its inputs, discovers and routes a project, builds the foundation registry and plan, runs ready checks in deterministic check-ID order, converts unavailable checks to explicit `unverified` findings, sorts and summarizes findings, and returns the versioned report with the approved disclaimer.

The `postvibe review` CLI supports the specified project, skills, format, and output-directory contract. It writes only the selected report to stdout when no output directory is supplied, otherwise creates the directory, writes the run-ID-named file, and prints only its absolute path. Non-debug failures use stderr and exit code 1 without stack traces.

## Files

- Added `src/orchestrator/run-review.ts`.
- Added `src/cli.ts`.
- Added `tests/orchestrator/run-review.test.ts`.
- Added `tests/cli/cli.test.ts`.
- Updated `src/validation/readiness-schema.ts` so the compiled executable can load the package-root schema as well as the source-layout schema.

## Behavior covered

- The `web-missing-basics` fixture is discovered as a web project with personal-data collection.
- Routed foundation findings are ordered as `launch-essentials.privacy-notice` and `secret-exposure.scan`.
- The fixture produces one `likely-issue` privacy finding and one failed secret-exposure finding.
- Fixed timestamps produce deterministic `pvc-` run IDs with non-digits removed.
- Missing registered implementations produce `unverified` findings carrying the planner reason, increment the unverified summary, and set `partial`.
- JSON stdout, Markdown stdout defaults, output-directory writing, path-only stdout, validation errors, and the compiled executable are exercised through real subprocesses.
- The exact approved disclaimer is used:

  `This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.`

## RED/GREEN evidence

1. Orchestrator vertical slice
   - RED: `pnpm test tests/orchestrator/run-review.test.ts` failed because `src/orchestrator/run-review.ts` did not exist.
   - GREEN: after the ready-check coordinator was added, the focused test passed (1 test).

2. Unavailable-check conversion
   - RED: the real temporary catalog routed an unregistered check, but `report.partial` was `false` because unavailable items were skipped.
   - GREEN: after converting the item to an `unverified` finding with `No check implementation is registered.`, the focused file passed (2 tests).

3. JSON CLI stdout
   - The first sandboxed subprocess attempt hit `tsx`'s local IPC restriction (`listen EPERM`) and was not accepted as feature RED evidence.
   - RED was re-established outside the restricted sandbox with `src/cli.ts` absent. The focused test exited 1, and the exact smoke command confirmed `ERR_MODULE_NOT_FOUND` for `src/cli.ts`.
   - GREEN: after the minimal JSON command was added, the focused CLI test passed.

4. Output-directory writing
   - RED: the Markdown `--output` invocation exited 1 because the option and file-writing behavior were unavailable.
   - GREEN: after adding recursive directory creation, renderer selection, run-ID filenames, and path-only stdout, both CLI tests passed.

5. CLI defaults
   - RED: a temporary project containing its own `skills/` catalog exited 1 when format and skills flags were omitted.
   - GREEN: default Markdown and `<project>/skills` selection passed (3 CLI tests).

6. Non-debug errors
   - RED: invalid format handling included a stack frame.
   - GREEN: invalid format handling exited 1 with a concise stderr message, empty stdout, and no stack frame (4 CLI tests).

7. Compiled executable schema resolution
   - RED: after a successful build, `node dist/src/cli.js ...` exited 1 with `ENOENT` for `dist/schemas/readiness.schema.json`.
   - Root cause: preserving `src/validation` under `dist/src/validation` changed the meaning of the validator's two-level relative schema URL.
   - GREEN: the loader now tries the source-layout URL and then the compiled-package-layout URL, falling through only on `ENOENT`; the compiled CLI regression passed (5 CLI tests).

## Verification commands and results

- `pnpm test tests/orchestrator/run-review.test.ts tests/cli/cli.test.ts`
  - PASS: 2 files, 6 tests before the compiled-boundary regression was added.
- `pnpm test tests/cli/cli.test.ts`
  - PASS: 1 file, 5 tests including the compiled executable regression.
- `pnpm check`
  - PASS: TypeScript build completed; 10 test files and 36 tests passed.
- `pnpm exec tsx src/cli.ts review fixtures/web-missing-basics --skills tests/fixtures/skills --format json`
  - PASS: exit 0; run ID matched `pvc-<digits>`; check IDs were deterministic; failed count 1; likely-issue count 1; controlled fixture value absent.
- `node dist/src/cli.js review fixtures/web-missing-basics --skills tests/fixtures/skills --format markdown`
  - PASS: exit 0; Markdown heading and exact disclaimer present; controlled fixture value absent.
- `git diff --check`
  - PASS before report creation; repeated immediately before commit.

## Security and redaction verification

- Followed the secrets and environment guidance from the required vibe-security skill.
- The real `web-missing-basics` report is rendered through both `renderJson` and `renderMarkdown`; each checks secret absence through an opaque boolean.
- CLI JSON stdout, Markdown stdout/file output, and stderr checks also use opaque booleans for the controlled fixture value. These assertions cannot print the needle or a rendered payload on redaction failure.
- The check continues to emit only a rule label, one-based file location, and the statement that the value was redacted.
- No new environment-variable handling, client bundle, authentication, database, payment, or network boundary was introduced.
- A targeted tracked-file/environment/key-pattern scan found no real credential material. The only private-key marker match was the existing controlled unit-test string. No tracked `.env` or private-key file was found.
- `gitleaks` was not installed in this environment, so the targeted scan and behavioral redaction tests were used instead.

## Self-review

- Confirmed all roots passed to orchestration are absolute and the injected clock is sampled once for manifest timestamp, report timestamp, and run ID consistency.
- Confirmed ready checks execute sequentially after check-ID sorting and all findings receive the required check-ID/ID ordering before summary creation.
- Confirmed unavailable findings preserve the routed skill domains and planner reason without inventing a pass.
- Confirmed `partial` is derived from all produced findings, including unverified results from ready implementations as well as unavailable plan items.
- Confirmed CLI option parsing is strict, permits only the one `review` command and one optional project positional, and validates the two supported formats.
- Confirmed success paths do not write diagnostics to stderr and failure paths do not write reports to stdout.
- Confirmed the compiled `bin` target works against the current package-root schema layout.
- Reviewed the new assertions for failure-output safety; rendered payloads and the controlled fixture value are never assertion operands.

## Concerns and assumptions

- The compiled validator intentionally assumes `schemas/readiness.schema.json` remains available at the package root, matching the repository/package layout. The compiled CLI regression protects that contract.
- CLI subprocess tests need `tsx` to create a local IPC pipe; this required running those tests outside the restricted sandbox. This is a test-runner environment constraint, not application network access.
- The existing Task 6 heuristic limitation for an uncommon semicolonless ambient TypeScript literal type remains unchanged and outside Task 9 scope.
- No open Task 9 functional or security concern remains after the final verification run.

## Fix Round 1: sanitize CLI execution errors

### Finding and root cause

The original catch block treated locally authored usage errors and untrusted execution errors identically. In normal mode it wrote `error.message` verbatim, and in debug mode it wrote `error.stack` verbatim. A real YAML parser error includes the malformed source line in both fields, so a sensitive value in a caller-supplied sidecar reached stderr.

A controlled parser probe reproduced the boundary without printing the input: the sanitized probe result reported `messageContainsNeedle: true` and `stackContainsNeedle: true`.

### Changes

- Added a private `CliUsageError` type for fixed, locally authored command, positional, and format validation messages.
- Unexpected normal-mode errors now emit only `Review failed. Set POSTVIBE_DEBUG=1 for sanitized diagnostics.`
- Unexpected debug-mode errors now emit an allowlisted error category and at most 12 generated `frame-N:line:column` locations.
- Debug formatting never writes the raw message, source line, original path/function text, serialized cause, or arbitrary error name.
- Added a real temporary malformed `readiness.yaml` subprocess fixture for both normal and debug modes.
- All secret/output containment assertions reduce results to booleans before assertion; no full stderr/stdout value or controlled sensitive value is an assertion operand.

### RED/GREEN evidence

1. Normal mode
   - RED command: `pnpm test tests/cli/cli.test.ts`
   - Sanitized RED result: 1 failed, 5 passed. The opaque `stderrContainsControlledValue` boolean was `true` instead of `false`; no stderr payload was printed.
   - GREEN command: `pnpm test tests/cli/cli.test.ts`
   - Result: 1 file passed, 6 tests passed. The stable generic message, stdout purity, exit code 1, and trusted invalid-format message all passed.

2. Debug mode
   - RED command: `pnpm test tests/cli/cli.test.ts`
   - Sanitized RED result: 1 failed, 6 passed. The opaque `stderrContainsControlledValue` boolean was `true` instead of `false`; no stderr payload was printed.
   - GREEN command: `pnpm test tests/cli/cli.test.ts`
   - Result: 1 file passed, 7 tests passed. Controlled content and the raw YAML parser message were absent; the allowlisted category and generated frame locations were present.

### Verification

- `pnpm test tests/cli/cli.test.ts tests/orchestrator/run-review.test.ts`
  - PASS: 2 files, 9 tests.
- `pnpm build`
  - PASS: `tsc -p tsconfig.json` exited 0.
- `pnpm test`
  - PASS: 10 files, 38 tests.
- `pnpm exec tsx src/cli.ts review fixtures/web-missing-basics --skills tests/fixtures/skills --format json`
  - PASS: exit 0, schema version `0.1`, two findings, controlled report fixture value absent.
- `node dist/src/cli.js review fixtures/web-missing-basics --skills tests/fixtures/skills --format markdown`
  - PASS: exit 0, Markdown heading and exact disclaimer present, controlled report fixture value absent.
- `git diff --check`
  - Repeated after this report update and before commit.

### Security self-review

- Only three fixed internal validation messages can enter the trusted usage-error path; `parseArgs`, catalog loading, YAML parsing, checks, rendering, and filesystem errors use the generic/sanitized execution path.
- The debug category is selected from a fixed allowlist; arbitrary `error.name` values become `Error`.
- Original stack lines are parsed only for numeric line/column pairs. Output labels are generated locally, capped at 12, and do not reuse path, function, message, source, or cause text.
- Accessing `error.stack` is guarded so a throwing accessor cannot escape the generic diagnostic boundary.
- No raw unexpected error value is stringified in either mode.
- No new network, environment-secret, authentication, payment, or data-storage boundary was introduced.

### Remaining concerns

None for Fix Round 1. Debug frame labels intentionally trade original filenames for non-disclosure; they still distinguish frame order and line/column locations without echoing caller-controlled content.
