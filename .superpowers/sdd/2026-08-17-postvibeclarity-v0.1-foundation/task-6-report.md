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

## Fix Round 3

### Changes

- Replaced persistent line-level credential context with a narrow candidate scan that begins immediately after each credential-like identifier or quoted property name.
- Type-annotation scanning now tracks balanced generic, parenthesized, bracketed, and object-type delimiters. Only top-level commas, semicolons, and unmatched object-closing braces terminate a candidate.
- A credential candidate can match only a standalone `=` followed by a quoted value, an immediate colon followed by a quoted property value, or a standalone assignment after its balanced type annotation.
- The scanner remains deterministic and linear: quoted text is skipped with unambiguous escape handling and a type candidate advances to its own top-level boundary.

### Covering tests

- A typed credential declaration with a semicolon-separated object type produces the quoted-assignment rule.
- An object literal with a non-quoted credential-named property followed by a benign quoted property produces no rule.
- Existing tests continue to cover nested generic/object types, comparison operators, redaction, private-key markers, and escape-heavy unterminated values.

### Commands and sanitized outputs

- `pnpm test tests/checks/secret-exposure.test.ts` — passed: 1 file, 9 tests.
- `pnpm build` — passed.
- `pnpm test` — passed: 6 files, 20 tests.
- `git diff --check` — passed with no whitespace errors.

### RED/GREEN evidence

- RED: the focused suite failed with the prior parser: it missed the semicolon-separated object type declaration and reported the object-literal false positive.
- GREEN: the focused suite passed after candidate-local, delimiter-aware type scanning replaced persistent context.

## Fix Round 4

### Changes

- Kept the existing balanced candidate scan, but made it recognize nested credential identifiers and quoted property names with immediate quoted `:` or standalone `=` assignments during the same forward pass.
- An unmatched non-quoted outer credential property can no longer hide a nested quoted credential assignment inside balanced delimiters.
- Nested matching returns only the stable rule label; credential values remain absent from findings and assertion output.

### Covering test

- A non-quoted credential-named outer property whose nested expression contains a different quoted credential assignment produces exactly one redacted finding for the line.

### RED/GREEN evidence

- RED: `pnpm test tests/checks/secret-exposure.test.ts` failed with the prior parser: 1 file failed; 1 test failed and 9 passed. The regression received zero findings instead of one.
- GREEN: `pnpm test tests/checks/secret-exposure.test.ts` passed: 1 file, 10 tests.

### Commands and sanitized results

- `pnpm build` — passed with exit code 0.
- `pnpm test` — passed: 6 files, 21 tests.
- `git diff --check` — passed with exit code 0 and no output.

### Concerns

- No new concerns. The check remains intentionally line-based and heuristic as documented above.

## Fix Round 5

### Changes

- Replaced candidate-owned forward scans with a two-pass lexical design: one pass tokenizes and identifies type-only annotation intervals, and a second independently evaluates every credential-like identifier or quoted property name outside those intervals.
- Declaration and parameter annotations are tracked by balanced structural scope; standalone assignments are paired only at their local depth, while generic angle depth keeps complex types intact.
- Type-only intervals use a delta array, so nested spans do not cause repeated rescans. Tokenization, annotation analysis, and credential evaluation each remain deterministic and linear in the line length.
- Kept general colon-to-assignment pairing separate from type-span classification. This preserves typed and destructured runtime assignments without allowing an unmatched outer runtime candidate to hide a nested credential identifier.
- Findings still contain only the stable rule label and location. Controlled values are checked through opaque booleans and never copied into finding or command output.

### Covering tests

- A typed quoted credential assignment nested inside a balanced runtime function/object expression produces one redacted finding.
- A credential-named quoted literal property nested inside a TypeScript declaration annotation produces no finding when no credential value is assigned.
- A credential default nested inside object destructuring remains detectable, guarding the runtime-candidate invariant of the type-span pass.
- All prior private-key, quoted-assignment, complex-type, operator-exclusion, redaction, and bounded-scan tests remain green.

### RED/GREEN evidence

- RED: the first focused run against the Round 4 parser failed exactly the two required regressions: 2 failed and 10 passed. The nested typed runtime assignment received zero findings, while the type-only member produced only a redacted false finding.
- RED: a self-review regression test exposed an over-broad first implementation of type spans: 1 failed and 12 passed because a nested object-destructuring default received zero findings.
- GREEN: after restricting type-only spans to declaration/parameter annotations while retaining separate assignment pairing, the focused suite passed: 1 file, 13 tests.

### Commands and sanitized results

- `pnpm test tests/checks/secret-exposure.test.ts` — passed: 1 file, 13 tests.
- `pnpm build` — passed with exit code 0.
- `pnpm test` — passed: 6 files, 24 tests.
- `git diff --check` — passed with no whitespace errors.

### Concerns

- The check remains intentionally line-based and heuristic. It does not attempt to replace a full TypeScript parser or expand the original quoted-assignment scope.
