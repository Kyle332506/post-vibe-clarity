# Task 7 report: privacy launch-essential check

## Files changed

- `src/checks/launch-essentials.ts`
- `tests/checks/launch-essentials.test.ts`

## Implementation

- Added `privacyNoticeCheck` with ID `launch-essentials.privacy-notice`.
- The check uses only the `collects-personal-data` manifest capability to decide applicability.
- It enumerates files through `listProjectFiles` and treats case-insensitive paths containing `privacy` as policy candidates.
- A policy candidate is reported as `passed` only for its existence and explicitly states that legal accuracy was not verified.
- A missing policy is a `likely-issue` with `human-review-needed`, using the detector's existing evidence without copying personal-data field values.

## RED evidence

Command:

```sh
pnpm test tests/checks/launch-essentials.test.ts
```

Result: failed as expected before production code existed. Vitest could not resolve `../../src/checks/launch-essentials.js` and ran zero tests.

## GREEN and verification

Commands:

```sh
pnpm test tests/checks/launch-essentials.test.ts
pnpm build
pnpm test
git diff --check HEAD^ HEAD
```

Results:

- Focused suite: 3 passed.
- TypeScript build: passed.
- Full suite: 7 files and 27 tests passed.
- Committed-diff whitespace check: passed.

## Self-review

- The capability test does not inspect source or infer collection independently.
- Candidate detection is path-only and case-insensitive, while `listProjectFiles` retains its existing dependency/build exclusions.
- The missing-policy finding exactly uses the specified launch-essential language.
- No personal-data values are copied into evidence or any finding text.
- The candidate test proves the legal-accuracy disclaimer is part of the observable result.

## Concerns

- A privacy-named path only establishes that a candidate exists. It cannot establish content, publication, linkage, or legal adequacy; the result keeps human review required.
