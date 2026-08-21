> **Presentation-only sanitization:** This sample comes from a real approved run of the `examples/launch-candidate/before` acceptance fixture.
> Absolute local paths, run timestamps and IDs, command durations, and the machine-dependent fingerprint were replaced with `[generated for this run]` only after the original plan, execution, and report passed validation.
> Findings, outcomes, command results, and coverage gaps are from that run. The placeholder was not approved and is not a reusable fingerprint.
> The six launch-operations findings inspect repository evidence only; no live provider, deployment, alert delivery, health endpoint response, backup creation, restore result, or rollback execution was checked.

# PostVibeClarity launch review

## Summary

- Stop before launch: 2
- Resolve before launch: 5
- Plan soon: 1
- Improve when appropriate: 3
- Human review needed: 1
- Passed: 3
- Failed: 2
- Likely issue: 1
- Unverified: 6
- Not applicable: 0
- Risk accepted: 0
- Resolved and rechecked: 0
- Checks completed: 3
- Checks unavailable: 0
- Checks failed: 0
- Checks unverified: 6

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

### Resolve before launch

- **` Backup and restore evidence could not be verified `** (unverified)
  - Check: ` launch-operations.backup-restore ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The available repository evidence is not sufficient to verify this operations practice. `
  - Recommendation: ` Document protected data, backup and restoration expectations, ownership, testing, notification, and evidence boundaries. `
  - Verification: ` Review the versioned backup and restore evidence with the owner and test restoration separately in an approved environment. `
- **` Health check evidence could not be verified `** (unverified)
  - Check: ` launch-operations.health-check ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The available repository evidence is not sufficient to verify this operations practice. `
  - Recommendation: ` Document the health probe, expected healthy result, coverage boundary, failure surfacing, and owner. `
  - Verification: ` Review the versioned health-check evidence with the owner and execute the endpoint or probe separately. `
- **` Monitoring and incident response evidence could not be verified `** (unverified)
  - Check: ` launch-operations.monitoring-response ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The available repository evidence is not sufficient to verify this operations practice. `
  - Recommendation: ` Document observed signals, the review location, notification expectations, first response steps, and ownership. `
  - Verification: ` Review the documented monitoring and incident response procedure with the responsible maintainer and test live behavior separately. `
- **` Release and deployment evidence could not be verified `** (unverified)
  - Check: ` launch-operations.release-process ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The available repository evidence is not sufficient to verify this operations practice. `
  - Recommendation: ` Document the release, deployment, publishing, or distribution procedure, including prerequisites, verification, and ownership. `
  - Verification: ` Review the versioned procedure with the responsible maintainer and confirm the live target separately. `
- **` Rollback and recovery evidence could not be verified `** (unverified)
  - Check: ` launch-operations.rollback-process ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The available repository evidence is not sufficient to verify this operations practice. `
  - Recommendation: ` Document the recovery trigger, shape-appropriate rollback mechanism, decision owner, ordered steps, and verification. `
  - Verification: ` Review the documented recovery procedure with the authorized owner and verify the live recovery path separately. `

### Plan soon

- **` Maintenance ownership evidence could not be verified `** (unverified)
  - Check: ` launch-operations.maintenance-ownership ` (check version ` 0.1.0 `; skill version ` 0.1.0 `)
  - Impact: ` The available repository evidence is not sufficient to verify this operations practice. `
  - Recommendation: ` Document maintenance ownership, the support route, review expectations, and handoff responsibilities. `
  - Verification: ` Review the documented ownership, support, review, and handoff expectations with the maintainers. `

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
- ` launch-operations.backup-restore `: unverified
  - Skill: ` launch-operations ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Data and correctness, Reliability and recovery
  - Findings recorded: 1
- ` launch-operations.health-check `: unverified
  - Skill: ` launch-operations ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Reliability and recovery, Operations and observability
  - Findings recorded: 1
- ` launch-operations.maintenance-ownership `: unverified
  - Skill: ` launch-operations ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Maintainability and change safety
  - Findings recorded: 1
- ` launch-operations.monitoring-response `: unverified
  - Skill: ` launch-operations ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Operations and observability
  - Findings recorded: 1
- ` launch-operations.release-process `: unverified
  - Skill: ` launch-operations ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Release and delivery
  - Findings recorded: 1
- ` launch-operations.rollback-process `: unverified
  - Skill: ` launch-operations ` (version ` 0.1.0 `)
  - Check version: ` 0.1.0 `
  - Domains: Reliability and recovery, Release and delivery
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

- Check ` launch-operations.backup-restore ` (unverified): ` No matching versioned operations evidence was available. `
- Check ` launch-operations.health-check ` (unverified): ` No matching versioned operations evidence was available. `
- Check ` launch-operations.maintenance-ownership ` (unverified): ` No matching versioned operations evidence was available. `
- Check ` launch-operations.monitoring-response ` (unverified): ` No matching versioned operations evidence was available. `
- Check ` launch-operations.release-process ` (unverified): ` No matching versioned operations evidence was available. `
- Check ` launch-operations.rollback-process ` (unverified): ` No matching versioned operations evidence was available. `
- Performance and cost: ` No routed check covers this domain in the current review. `
- Product and user experience: ` No routed check covers this domain in the current review. `

## Unverified areas

- ` Backup and restore evidence could not be verified `
  - ` No matching versioned operations evidence was available. `
- ` Health check evidence could not be verified `
  - ` No matching versioned operations evidence was available. `
- ` Maintenance ownership evidence could not be verified `
  - ` No matching versioned operations evidence was available. `
- ` Monitoring and incident response evidence could not be verified `
  - ` No matching versioned operations evidence was available. `
- ` Release and deployment evidence could not be verified `
  - ` No matching versioned operations evidence was available. `
- ` Rollback and recovery evidence could not be verified `
  - ` No matching versioned operations evidence was available. `

## Scope

- Project root: ` [generated for this run] `
- Artifact types: ` web `, ` backend `.
- Generated at: ` [generated for this run] `
- Toolkit version: ` 0.3.0 `
- Partial review: yes

## Local verification

- Plan ID: ` [generated for this run] `
- Plan fingerprint: ` [generated for this run] `
- Execution ID: ` [generated for this run] `
- Execution record: ` [generated for this run] `

### Command evidence

- ` package-script:build `: Status: passed; duration: [generated for this run].
  - Source: ` package.json#scripts.build `
- ` package-script:lint `: Status: passed; duration: [generated for this run].
  - Source: ` package.json#scripts.lint `
- ` package-script:test `: Status: failed; duration: [generated for this run].
  - Source: ` package.json#scripts.test `
- ` package-script:type-check `: Status: passed; duration: [generated for this run].
  - Source: ` package.json#scripts.typecheck `

### Changed paths

- None observed.

### Exclusions

- None recorded.

### Observation boundary

- Policy: ` project-observation/0.1 `
- Pinned root: ` [generated for this run] ` (device ` [generated for this run] `; inode ` [generated for this run] `)
- Excluded directories: ` .git `, ` .postvibe `, ` coverage `, ` dist `, ` node_modules `
- Symlinks and non-regular files are not observed.
- Inaccessible paths fail observation.
- Only content SHA-256 metadata is recorded; filesystem metadata is not recorded.
- Exact artifact exclusions:
  - ` [generated for this run] `
  - ` [generated for this run] `
  - ` [generated for this run] `
  - ` [generated for this run] `
  - ` [generated for this run] `
  - ` [generated for this run] `
  - ` [generated for this run] `
  - ` [generated for this run] `

## Command approval boundary

The exact command declaration and direct launch details were checked before start.

This does not freeze imported files, dependencies, operating-system code, or changes made by other processes.

### Containment warning

Commands run as local processes with the current user privileges; this is not a security sandbox and does not block network or out-of-project filesystem access.

## Important limitation

This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.
