# Task 6 Report: Redacted Secret-Exposure Check

## Implementation and files

- Added `src/checks/secret-exposure.ts` with `secretExposureCheck` registered as `secret-exposure.scan`.
- `detectSecretRule` recognizes private-key markers and quoted assignments to names containing the required credential terms. It returns only stable rule labels.
- Findings include only the rule label, one-based location, and a redaction statement; no matched content is copied into any finding field.
- Added the controlled fixture input at `fixtures/web-missing-basics/src/config.ts`.
- Added integration coverage in `tests/checks/secret-exposure.test.ts` for quoted credential assignments, private-key markers, redaction, and a benign quoted assignment.

## RED/GREEN evidence

- RED: `pnpm test tests/checks/secret-exposure.test.ts` failed before implementation because the secret-exposure module did not exist.
- GREEN: `pnpm test tests/checks/secret-exposure.test.ts` passed: 1 file, 3 tests.

## Verification commands and sanitized results

- `pnpm build` — passed.
- `pnpm test` — passed: 6 files, 14 tests.
- `git diff --check` — passed with no whitespace errors.

## Self-review

- The checker scans only prescribed text/source extensions using the project file enumerator.
- It uses line-based matching and stores a rule label rather than a match object or substring.
- The test serializes the complete finding payload and confirms the controlled fixture value is absent.
- The benign-assignment test protects against flagging every quoted assignment.

## Concerns

- This intentionally narrow heuristic does not detect unquoted, multi-line, encoded, or entropy-based secrets; those are outside this check's specified contract.

## Fix Round 1

### Changes

- Replaced the quoted-assignment regular expression with a deterministic line parser.
- The parser retains credential-name context across a TypeScript type annotation until it reaches the quoted assignment value.
- Escaped characters now advance the parser unambiguously, so an unterminated quoted candidate is consumed in linear time without regex backtracking.
- Reworked the redaction assertion to test an opaque boolean before any assertion that could display finding data.

### Covering tests

- A typed TypeScript credential assignment produces a finding.
- An unterminated, escape-heavy credential candidate produces no rule and completes through the parser's bounded scan.
- Existing integration coverage continues to check private-key markers, benign quoted assignments, and redaction.

### Commands and sanitized outputs

- `pnpm test tests/checks/secret-exposure.test.ts` — passed: 1 file, 5 tests.
- `pnpm build` — passed.
- `pnpm test` — passed: 6 files, 16 tests.
- `git diff --check` — passed with no whitespace errors.

### RED/GREEN evidence

- RED: the focused test with the old matcher did not complete within the 30-second bounded command window because of the escape-heavy candidate; the typed declaration was also outside the old expression's supported shape.
- GREEN: after replacing the matcher with the deterministic parser, the focused suite completed successfully in a normal run.

## Fix Round 2

### Changes

- Preserved a credential-name context across comma and brace punctuation after a non-quoted colon, allowing it to survive nested generic, tuple, and object type syntax until a real assignment.
- Added operator-aware handling for `=` so equality, inequality, relational, and arrow operators cannot be treated as assignments.
- Kept colon handling deterministic: an immediate quoted value is an object-property assignment candidate; a non-quoted value begins type-annotation context.

### Covering tests

- A credential assignment following a nested generic/object type annotation produces the stable quoted-assignment rule.
- Comparisons using `==`, `===`, `!=`, `!==`, `>=`, and `<=`, plus an arrow expression, produce no rule.

### Commands and sanitized outputs

- `pnpm test tests/checks/secret-exposure.test.ts` — passed: 1 file, 7 tests.
- `pnpm build` — passed.
- `pnpm test` — passed: 6 files, 18 tests.
- `git diff --check` — passed with no whitespace errors.

### RED/GREEN evidence

- RED: the focused suite failed with the prior parser: the nested type declaration was missed and six comparison variants produced false quoted-assignment rules.
- GREEN: the focused suite passed after the linear parser retained nested type context and recognized only standalone assignment operators.
