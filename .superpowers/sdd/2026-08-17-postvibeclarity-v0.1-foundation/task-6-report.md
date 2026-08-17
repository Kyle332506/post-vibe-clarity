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
