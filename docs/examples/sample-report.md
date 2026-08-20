# PostVibeClarity launch review

## Summary

- Stop before launch: 2
- Resolve before launch: 0
- Plan soon: 0
- Improve when appropriate: 3
- Human review needed: 1
- Passed: 3
- Failed: 2
- Likely issue: 1
- Unverified: 0
- Not applicable: 0
- Risk accepted: 0
- Resolved and rechecked: 0
- Checks completed: 3
- Checks unavailable: 0
- Checks failed: 0
- Checks unverified: 0

## Findings

### Stop before launch

- **` Potential credential stored in the project `** (failed)
  - Check: ` secret-exposure.scan ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` A credential in project files may be copied, committed, logged, or exposed to users. `
  - Recommendation: ` Move the credential to an appropriate secret store and rotate any credential that may have been exposed. `
  - Verification: ` Scan the project again and verify the original credential was rotated outside this review. `
  - Evidence locations: ` src/config.js:1 `
- **` Test command failed `** (failed)
  - Check: ` universal-verification.commands ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The approved test command completed and reported a failure. `
  - Recommendation: ` Resolve the reported test failure before relying on this verification. `
  - Verification: ` Run package-script:test again under an approved plan and record its result. `
  - Evidence locations: ` package.json#scripts.test `

### Improve when appropriate

- **` Build command passed `** (passed)
  - Check: ` universal-verification.commands ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The approved build command completed successfully. `
  - Recommendation: ` Retain the declared build command for verification after relevant changes. `
  - Verification: ` Run package-script:build again under an approved plan and record its result. `
  - Evidence locations: ` package.json#scripts.build `
- **` Lint command passed `** (passed)
  - Check: ` universal-verification.commands ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The approved lint command completed successfully. `
  - Recommendation: ` Retain the declared lint command for verification after relevant changes. `
  - Verification: ` Run package-script:lint again under an approved plan and record its result. `
  - Evidence locations: ` package.json#scripts.lint `
- **` Type-check command passed `** (passed)
  - Check: ` universal-verification.commands ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The approved type-check command completed successfully. `
  - Recommendation: ` Retain the declared type-check command for verification after relevant changes. `
  - Verification: ` Run package-script:type-check again under an approved plan and record its result. `
  - Evidence locations: ` package.json#scripts.typecheck `

### Human review needed

- **` Privacy notice not found `** (likely-issue)
  - Check: ` launch-essentials.privacy-notice ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` People may not be told what information is collected or how it is used. `
  - Recommendation: ` Create a factual data inventory and obtain appropriate review before publishing a privacy notice. `
  - Verification: ` Confirm reviewed policy text is published and linked wherever personal data is collected. `
  - Evidence locations: ` src/server.js `

## Checks performed

- ` launch-essentials.privacy-notice `: completed
  - Skill: ` launch-essentials ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Policy and business essentials, Security and privacy
  - Findings recorded: 1
- ` secret-exposure.scan `: completed
  - Skill: ` secret-exposure ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Security and privacy
  - Findings recorded: 1
- ` universal-verification.commands `: completed
  - Skill: ` universal-verification ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Data and correctness, Maintainability and change safety, Release and delivery
  - Findings recorded: 4

## Coverage gaps

- Operations and observability: ` No routed check covers this domain in the current review. `
- Performance and cost: ` No routed check covers this domain in the current review. `
- Product and user experience: ` No routed check covers this domain in the current review. `
- Reliability and recovery: ` No routed check covers this domain in the current review. `

## Unverified areas

- None reported.

## Scope

- Project root: ` /example/launch-candidate/before `
- Artifact types: ` web `.
- Generated at: ` 2026-08-18T12:00:00.000Z `
- Toolkit version: ` 0.2.0 `
- Partial review: yes

## Local verification

- Plan ID: ` pvp-540f271dc9098a20 `
- Plan fingerprint: ` 540f271dc9098a207703f6680789dcf3d074869403b59fac6c38016497535102 `
- Execution ID: ` pve-20260818120100000 `
- Execution record: ` .postvibe/pve-20260818120100000.execution.json `

### Command evidence

- ` package-script:build `: Status: passed; duration: unavailable.
  - Source: ` package.json#scripts.build `
- ` package-script:lint `: Status: passed; duration: unavailable.
  - Source: ` package.json#scripts.lint `
- ` package-script:test `: Status: failed; duration: unavailable.
  - Source: ` package.json#scripts.test `
- ` package-script:type-check `: Status: passed; duration: unavailable.
  - Source: ` package.json#scripts.typecheck `

### Changed paths

- None observed.

### Exclusions

- None recorded.

### Containment warning

Commands run as local processes with the current user privileges; this is not a security sandbox and does not block network or out-of-project filesystem access.

## Important limitation

This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.
