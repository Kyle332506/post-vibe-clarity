---
name: universal-verification
description: Use when verifying an approved change through project-declared commands while keeping work contained and exclusions visible.
license: Apache-2.0
---

# Universal verification

Verify approved changes by running only the project's declared commands and recording bounded evidence. This skill reports what was checked and what remains excluded; it does not issue a readiness verdict.

## Plan and approval

Plan the intended verification first: name the approved change, the exact declared commands to run, the project path, and the expected evidence. The exact command declaration and direct launch details are checked before start. This does not freeze imported files, dependencies, operating-system code, or changes made by other processes; transitive loads and the interval after checking remain outside the evidence. Before running a command or making any change, explain this boundary and obtain approval that identifies the exact command and exact target. Do not treat general permission as approval for additional commands, files, environments, or actions.

## Containment

Operate only inside the approved project path and only at the approved action level. Run declared commands exactly as documented by the project; do not infer, compose, install, update, publish, deploy, or substitute commands. Do not inspect or modify external services, credentials, production environments, or files outside the approved scope.

Do not perform cleanup. Do not delete generated files, revert changes, remove dependencies, rotate credentials, or alter state as part of verification. If a declared command would exceed the approved boundary, stop and request separate approval.

## Evidence and exclusions

Record the command, its outcome, and relevant bounded evidence. Keep every unrun command, inaccessible path, unavailable environment, external dependency, and unapproved action visibly listed as excluded or unverified. Escalate failures, ambiguity, and missing evidence for human review instead of widening the scope.

This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.
