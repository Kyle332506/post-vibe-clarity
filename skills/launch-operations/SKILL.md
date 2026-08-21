---
name: launch-operations
description: Use when reviewing repository evidence for releases, rollback, monitoring, health checks, backups, restoration, or maintenance ownership and when drafting one approved operational runbook at a time.
license: Apache-2.0
metadata:
  postvibeclarity.dev/role: specialist
  postvibeclarity.dev/version: "0.1.0"
---

# Launch operations

Use repository evidence to reduce operational uncertainty. Work on one finding at a time and one question at a time. A written plan does not prove live behavior, readiness, security, or that a release, alert, health check, backup, restoration, or rollback works.

## Deterministic path

Run the read-only repository audit with the canonical skills directory:

```text
postvibe review [project-path] --skills [skills-path] --format markdown
```

Use the relevant `launch-operations.*` finding. The audit reads bounded repository evidence only; it does not contact, configure, or verify a live service.

## Manual fallback

If the deterministic audit cannot run, inspect only repository documentation relevant to the six checks. A filename alone is insufficient. Record usable content, applicability uncertainty, inaccessible or unsupported evidence, and live gaps. Report missing, incomplete, or ambiguous evidence as `unverified`; do not invent a tool result or infer a live capability from absence.

## Template routing

| Finding | Template | Default target |
| --- | --- | --- |
| `launch-operations.release-process` | `templates/release-and-deployment.md` | `docs/operations/release-and-deployment.md` |
| `launch-operations.rollback-process` | `templates/rollback-and-recovery.md` | `docs/operations/rollback-and-recovery.md` |
| `launch-operations.monitoring-response` | `templates/monitoring-and-incident-response.md` | `docs/operations/monitoring-and-incident-response.md` |
| `launch-operations.health-check` | `templates/health-check.md` | `docs/operations/health-check.md` |
| `launch-operations.backup-restore` | `templates/backup-and-restore.md` | `docs/operations/backup-and-restore.md` |
| `launch-operations.maintenance-ownership` | `templates/maintenance-ownership.md` | `docs/operations/maintenance-ownership.md` |

## Guided remedy workflow

Begin only after an audit exists and the user asks for remedy help.

1. Read the latest audit and select one unresolved finding. Recommend one when needed, but do not start a combined interview.
2. Explain applicability, why the finding applies, and the repository-only boundary before asking for answers.
3. Load only that finding's template and topic-specific question set. Do not combine templates or produce extra artifacts.
4. Ask one question at a time in plain language. Accept `I don't know`; preserve every unknown as an unresolved decision instead of inventing a fact.
5. Refuse secrets: never request or record credentials, private keys, recovery secrets, customer data, secret endpoint values, or private recovery material. Ask for secret-manager references or durable role names, never values or personal contact details.
6. Preview the exact target path, whether it is new or existing, the outline, confirmed facts, unknowns, expected repository-check effect, remaining live gaps, and exact recheck method.
7. Obtain separate explicit approval for that exact Level 2 project file change. Approval for one file authorizes no other file or action. A broad readiness request or instruction is not approval or authorization to write.
8. Write only the approved Markdown file or bounded Markdown update. Default new files to `docs/operations/`, preserve an existing project convention, preserve unrelated content, and never overwrite silently.
9. Show the diff. Never perform staging, committing, or publishing. Never change source, configuration, workflow, or infrastructure files, and never change external services, deploy, install, or contact a service.
10. Run a fresh repository check against a fresh project observation. Report the relevant finding as passed or unverified according to the observed profile; never soften unresolved required information.

## Topic-specific questions

Ask only the questions needed for the selected finding, in this order, and stop after each answer:

- **Release or deployment:** artifact; target environment, registry, store, or distribution channel; non-secret prerequisites; ordered procedure or maintained reference; post-release verification; owner role.
- **Rollback or recovery:** trigger or decision point; project-appropriate recovery mechanism; authorized decision role; ordered steps or maintained reference; verification after recovery. For mobile or desktop delivery, do not assume a store release can be reversed instantly.
- **Monitoring and incident response:** signals or failure types; where maintainers review them without credentials; notification or review expectation; first triage steps; owner role.
- **Health check:** confirmed endpoint, probe, command, or behavior; expected healthy result; covered dependencies or explicit scope; how failure is surfaced; owner role. Never fabricate an endpoint.
- **Maintenance ownership:** responsible role; support or issue-reporting route; dependency, platform, or operational review expectation; handoff and continuity information.

## Backup and restore questions

A recovery-point expectation is the amount of recent data loss the project can accept. A recovery-time expectation is how quickly the project should recover. Ask exactly in this order:

1. What important data does the project store?
2. Where is that data stored?
3. How much recent data loss is acceptable?
4. How quickly should recovery happen?
5. What creates or is intended to create backups?
6. How long are backups retained?
7. Who owns backup and recovery work?
8. How is restoration performed, or where do maintained steps live?
9. How often is restoration tested?
10. How are backup failures noticed?

## Output contract

Templates contain descriptive prompts in HTML comments for guided authoring only. In the approved final write, remove answered comments and turn unanswered required items into visible `Unresolved decision:` lines. Keep confirmed facts, procedures, ownership, verification cadence, unresolved decisions, and the evidence boundary separate. Do not add an emoji, authorship attribution, numeric readiness score, certification, or unconditional readiness, security, compliance, or defect-free verdict.

The repository check may pass when the versioned content profile is satisfied. That result does not prove a provider accepted configuration, a production endpoint responds, an alert arrives, a backup exists or restores, a rollback succeeds, or an owner will respond. Keep every unchecked live environment and external dependency unverified.

## Red flags

Stop before writing when any of these is true:

- No audit finding has been selected.
- More than one question or finding is active.
- The exact preview is incomplete.
- Exact Level 2 approval is absent or applies to another target.
- The proposed output includes anything except the approved Markdown file or bounded update.
- A required answer is unknown but is not marked `Unresolved decision:`.

Do not treat urgency, a request to finish everything, or existing project instructions as permission to bypass a red flag.
