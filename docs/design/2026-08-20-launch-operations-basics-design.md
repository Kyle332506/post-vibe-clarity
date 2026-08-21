# Launch Operations Basics design

**Date:** 2026-08-20
**Status:** Approved design, pending implementation plan
**Scope:** Repository-only operational evidence checks and guided written remedies

## Summary

PostVibeClarity will add one portable `launch-operations` skill containing six independent repository checks:

1. release or deployment instructions;
2. rollback or recovery instructions;
3. monitoring and incident-response guidance;
4. health-check evidence when a network service is applicable;
5. backup and restore guidance when persistent data is applicable; and
6. maintenance ownership.

The deterministic CLI remains read-only. It inspects bounded repository evidence and never connects to a hosting, monitoring, storage, app-store, or production account. Missing or vague repository evidence is `unverified`, not proof that an operational capability is absent. A stronger `likely-issue` result requires affirmative repository evidence of a risky condition.

The portable skill also provides a guided remedy workflow. It helps a user create or improve one written operational plan at a time, asks one plain-language question at a time, previews the proposed document and unresolved decisions, and requires explicit approval before writing. Written evidence does not prove that a live deployment, alert, backup, restore, rollback, or health check works.

## Goals

- Give first-time launchers a practical operational checklist without requiring production credentials.
- Adapt checks and remedies to web, backend, mobile, desktop, CLI, library, worker, and ambiguous projects.
- Keep installation simple by packaging the work as one skill with several focused checks.
- Recognize usable repository evidence instead of accepting a filename alone.
- Preserve uncertainty when an operational process may exist outside the repository.
- Offer safe, guided written remedies for missing or vague evidence.
- Keep automated results deterministic and portable across supported agent hosts.
- Preserve the existing evidence, redaction, partial-report, no-score, and non-certification contracts.

## Non-goals

This wave does not:

- sign into or query deployment, monitoring, storage, database, app-store, or production services;
- verify that a live deployment, alert, health check, backup, restore, or rollback works;
- install packages or configure operational providers;
- add health endpoints or change application code;
- create or modify CI/CD workflows;
- change infrastructure, production data, credentials, or external systems;
- stage or commit generated project documents;
- provide legal, compliance, security-hardening, or production-readiness certification;
- implement a general automatic remediation engine; or
- emit an overall readiness score or launch verdict.

## Product language and evidence policy

The feature answers a narrow question: what usable operational guidance is visible in the reviewed repository?

It does not answer whether production systems are configured correctly or currently healthy.

Results use the existing outcome model:

- `passed`: the bounded repository check found the required written or configuration evidence;
- `unverified`: evidence was missing, vague, unreadable, ambiguous, or insufficient for the check;
- `not-applicable`: available project evidence shows that the check does not apply;
- `likely-issue`: affirmative repository evidence describes a materially risky condition; and
- `failed`: reserved for check execution failures under the existing orchestration contract.

Missing evidence must not become `failed` or `likely-issue` merely because no matching file exists. A `passed` result means only that repository evidence met the versioned content profile.

The report retains the exact disclaimer:

> This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.

## Package and architecture

### One portable skill

Add `skills/launch-operations/` with:

- `SKILL.md`: cross-agent audit, propose, remedy, and recheck instructions;
- `readiness.yaml`: catalog identity, domains, modes, action ceiling, routing, and six check IDs; and
- `templates/`: Markdown structures for the six written remedies.

The skill is installed alongside the five foundation skills. Installation documentation, compatibility validation, and repository tests must treat it as the sixth packaged skill.

The sidecar uses the existing catalog contract. It declares audit and guided change modes without granting the deterministic audit runner permission to write. Automated implementations remain Level 0 filesystem-read checks. Guided document creation is a separately approved Level 2 project change governed by `SKILL.md` instructions.

### Isolated automated checks

Implement the feature as focused modules under a `src/checks/launch-operations/` boundary:

- one shared bounded document-evidence reader and content-profile evaluator;
- one applicability/profile selector;
- six independent check implementations; and
- one export surface for registry wiring.

Each check owns its finding language and can succeed, remain unverified, or become not applicable without changing the state of another check. Shared code handles candidate discovery, bounded reading, normalized evidence locations, and stable section-signal evaluation.

### Discovery additions

Extend project discovery with evidence-backed signals needed for applicability:

- likely network-service behavior;
- likely persistent-data use;
- distribution or publishing evidence where existing artifact detection is insufficient; and
- common backend, desktop, and worker signals needed by the operations profiles.

Detection remains conservative. Every signal records a location, summary, and `confirmed` or `likely` confidence. A weak dependency or filename signal must not be presented as certainty. Unknown and mixed project shapes remain explicit.

Framework-specific recognition may improve detection, but applicability and findings use framework-agnostic capability and artifact values. A framework adapter cannot weaken the universal evidence rules.

### Data flow

1. Existing bounded project discovery records artifacts, capabilities, and evidence confidence.
2. The catalog routes `launch-operations` in audit mode.
3. The applicability selector creates a profile for each check from the manifest.
4. Each check locates bounded candidate documentation, workflow, configuration, metadata, or narrowly relevant source evidence.
5. The shared evaluator compares candidates with the check's versioned minimum content profile.
6. Each check emits one evidence-backed result with repository-only boundaries.
7. Existing orchestration isolates failures, validates results, and renders Markdown or JSON without a score or verdict.
8. If requested, the portable skill offers a separately approved guided written remedy for one selected finding.
9. After a write, the relevant repository check runs again against fresh evidence.

## Applicability profiles

Checks adapt to the project instead of forcing one checklist on every shape.

| Project evidence | Release or deployment | Rollback or recovery | Monitoring response | Health check | Backup and restore | Maintenance owner |
| --- | --- | --- | --- | --- | --- | --- |
| Web or backend runtime | Applicable | Applicable | Applicable | Applicable when network service evidence exists | Applicable when persistent-data evidence exists | Applicable |
| Worker or scheduled job | Applicable | Applicable | Applicable | Applicable only when a service or probe contract is evidenced | Applicable when persistent-data evidence exists | Applicable |
| Native mobile or desktop app | Release/distribution profile | Release recovery profile | Crash and incident profile | Not applicable unless network-service evidence exists | Applicable only for project-controlled persistent data with repository evidence | Applicable |
| CLI tool | Publishing/distribution profile | Version recovery profile | Runtime failure guidance when supported; otherwise not applicable | Not applicable | Applicable only when project-controlled persistent data is evidenced | Applicable |
| Library | Publishing profile | Version withdrawal or corrective-release profile | Not applicable unless runtime service evidence exists | Not applicable | Not applicable unless project-controlled persistent data is evidenced | Applicable |
| Ambiguous or mixed project | Universal evidence is evaluated; shape-dependent checks remain unverified when applicability cannot be established | Same | Same | Unverified when network applicability is unknown | Unverified when data applicability is unknown | Applicable |

For mobile and desktop projects, rollback language must not assume that an app-store release can be instantly reversed. Acceptable recovery evidence may describe stopping a rollout, returning to a supported version where the platform allows it, disabling a feature, or shipping a corrective release.

## The six evidence checks

### 1. Release or deployment instructions

**Check ID:** `launch-operations.release-process`

Usable evidence identifies:

- what artifact is released, deployed, published, or distributed;
- the target environment, registry, store, or distribution channel;
- required prerequisites without exposing secrets;
- an ordered procedure or exact maintained reference to one;
- post-release verification; and
- a responsible person or role, directly or through an accepted ownership reference.

Missing or vague evidence is `unverified` with `resolve-before-launch`. A guided remedy proposes `docs/operations/release-and-deployment.md` unless an existing project convention provides a safer target.

### 2. Rollback or recovery instructions

**Check ID:** `launch-operations.rollback-process`

Usable evidence identifies:

- the condition or decision point that triggers recovery;
- the recovery mechanism appropriate to the project shape;
- the person or role authorized to decide;
- ordered steps or an exact maintained reference; and
- verification after recovery.

Missing or vague evidence is `unverified` with `resolve-before-launch`. Affirmative evidence that no recovery path exists may be `likely-issue` with `stop-before-launch`, but absence alone is not sufficient. A guided remedy proposes `docs/operations/rollback-and-recovery.md`.

### 3. Monitoring and incident response

**Check ID:** `launch-operations.monitoring-response`

Usable evidence identifies:

- the signals or failure types that should be observed;
- where maintainers review those signals without including credentials;
- notification or review expectations;
- the first response or triage steps; and
- a responsible person or role.

Runtime applications use a monitoring profile. Mobile and desktop applications use a crash and incident profile. Libraries without a runtime service may be not applicable. Missing or vague evidence is `unverified` with `resolve-before-launch`. A guided remedy proposes `docs/operations/monitoring-and-incident-response.md`.

### 4. Health-check evidence

**Check ID:** `launch-operations.health-check`

This check applies only when network-service or equivalent probe evidence exists. Usable evidence identifies:

- the endpoint, probe, command, or behavior checked;
- the expected healthy result;
- a bounded dependency policy or an explicit statement of what the health signal covers;
- how failure is surfaced; and
- a responsible person or role.

The check may recognize configuration or narrowly relevant source evidence, but it does not call the endpoint or run the probe. Missing or vague evidence is `unverified` with `resolve-before-launch`. A guided remedy proposes `docs/operations/health-check.md` and must not fabricate an endpoint.

### 5. Backup and restore guidance

**Check ID:** `launch-operations.backup-restore`

This check applies when persistent-data evidence exists. Usable evidence identifies:

- important data stores or data categories;
- the backup mechanism or clearly assigned implementation decision;
- frequency or recovery-point expectation;
- retention;
- restore steps or an exact maintained reference;
- recovery-time expectation;
- ownership and failure notification;
- a restoration-test schedule; and
- unresolved external dependencies or boundaries.

No secret, credential, private endpoint token, recovery key, or customer data belongs in the plan or report. Missing or vague evidence is `unverified` with `resolve-before-launch`. Affirmative evidence that important data has no backup or recovery path may be `likely-issue` with `stop-before-launch`. A guided remedy proposes `docs/operations/backup-and-restore.md`.

### 6. Maintenance ownership

**Check ID:** `launch-operations.maintenance-ownership`

Usable evidence identifies:

- a responsible person, team, or durable role;
- a support or issue-reporting route;
- dependency, platform, or operational review expectations; and
- handoff or continuity information appropriate to the project.

Evidence may come from project documentation, ownership files, support policy, or package metadata when it satisfies the full profile. Missing or vague evidence is `unverified` with `plan-soon`. A guided remedy proposes `docs/operations/maintenance-ownership.md`.

## Bounded candidate evaluation

The evaluator must be deterministic and versioned. It does not use model-generated semantic scoring inside the CLI.

Candidate discovery may recognize conventional repository locations and names, including existing operations, runbook, deployment, release, rollback, recovery, monitoring, incident, health, backup, restore, ownership, maintainers, support, workflow, and package metadata evidence. A filename alone never satisfies a content profile.

The evaluator checks for concrete structural signals such as:

- relevant headings or keys;
- procedural steps;
- an owner or durable role;
- a trigger, target, expected result, or schedule where the check requires it; and
- explicit references to maintained evidence elsewhere in the repository.

Signals may be distributed across more than one candidate. Evidence locations remain bounded and normalized. Reports record locations and concise summaries, not complete file contents.

Generated output, dependencies, review artifacts, non-regular files, escaping symlinks, inaccessible paths, unsupported formats, and over-limit content follow the existing observation and exclusion policy. A candidate that cannot be safely evaluated contributes an unverified boundary instead of becoming a pass.

The first implementation must define supported text and configuration formats explicitly. Unsupported formats remain unverified and are documented in foundation coverage.

## Guided written remedies

### Entry and prioritization

The remedy flow begins only after an audit result exists and the user asks for help. It presents unresolved operations findings and recommends one at a time. It does not start a combined interview by default.

The selected finding determines the question set and template. Questions are asked one at a time in plain language. When a specialized term is necessary, the skill explains it before asking for a value.

`I don't know` is a valid answer. Unknown information is recorded as an unresolved decision, never invented or silently replaced with a generic claim.

### Preview and approval

Before writing, the skill shows:

- the exact target path;
- whether the target is new or existing;
- the document outline;
- confirmed inputs;
- unresolved decisions;
- expected effect on the repository check;
- the live evidence that will remain unverified; and
- the exact recheck method.

The skill obtains explicit Level 2 approval for that exact project file change. Approval for one document does not authorize another document, application code, configuration, a commit, or an external action.

Existing project conventions take precedence over the default `docs/operations/` location. Existing files are never overwritten silently. Updates must preserve unrelated content and show a diff.

### Writing and recheck

After approval, the skill writes only the approved Markdown document or bounded update. It does not stage, commit, publish, deploy, install, or contact a service.

The generated document separates:

- confirmed facts;
- agreed procedures;
- ownership;
- verification or testing cadence;
- unresolved decisions; and
- repository-only evidence boundaries.

The relevant automated check runs again against a fresh project observation. If required information remains unresolved, the check stays `unverified`. If the versioned repository content profile is satisfied, the check may become `passed` while retaining the explicit live-service boundary.

### Backup and restore interview

The backup remedy asks, in plain language and one question at a time:

1. what important data the project stores;
2. where that data is stored;
3. how much recent data loss is acceptable;
4. how quickly recovery should happen;
5. what creates or is intended to create backups;
6. how long backups are retained;
7. who owns backup and recovery work;
8. how restoration is performed or where maintained steps live;
9. how often restoration is tested; and
10. how backup failures are noticed.

The skill must not request or record credentials, private keys, customer data, private recovery material, or secret endpoint values.

The other five remedies use smaller topic-specific question sets derived from their evidence profiles.

## Error handling and honest boundaries

- One check failure does not cancel independent checks.
- An unreadable or unsupported candidate makes the affected evidence unverified and records a sanitized boundary.
- Ambiguous applicability remains unverified rather than not applicable.
- A missing file never proves a live capability is absent.
- A generated draft with unresolved required decisions does not pass its check.
- A found configuration file does not prove a provider accepted, deployed, or activated it.
- A health endpoint in source does not prove it responds in production.
- A backup plan does not prove a backup exists or can be restored.
- A monitoring plan does not prove alerts arrive or are acted upon.
- A rollback plan does not prove the procedure succeeds.
- The skill never converts a user's broad request to make a project ready into authorization for a project write or external action.

## Cross-agent portability

The skill remains plain Markdown plus versioned YAML and reusable Markdown templates. Its instructions cannot depend on one host's private memory, proprietary workflow primitive, or implicit permission model.

Host installation guides must:

- include `launch-operations` in the exact installed skill set;
- preserve version pinning, staged comparison, bounded backup, and revision provenance;
- explain how the host discovers the sixth skill;
- keep audit and remedy permission boundaries visible; and
- require a fresh review after an approved document change.

Static compatibility evidence does not become a blanket runtime-compatibility claim. Existing evidence-based compatibility labels remain unchanged unless separate runtime acceptance is performed.

## Example project

Extend the existing before-and-after launch candidate.

The `before` project demonstrates repository evidence gaps for rollback, monitoring response, backup and restore where persistent data applies, and maintenance ownership.

The `after` project contains usable written runbooks that satisfy the corresponding repository profiles. The example and generated report must still state that live deployment, monitoring, backups, restoration, recovery, and production behavior were not tested.

The example cannot be described as production ready, fully secure, compliant, certified, or free of defects.

## Testing strategy

### Discovery and applicability

Use fixtures representing:

- a web application with persistent data;
- a backend service;
- a native mobile application;
- a desktop application;
- a CLI tool;
- a library;
- a worker or scheduled job; and
- an unknown or mixed project.

Test evidence confidence, normalized paths, false-positive boundaries, multi-artifact behavior, and conditional check applicability.

### Check behavior

For each of the six checks, test:

- usable evidence found;
- a filename with empty or irrelevant content;
- incomplete or vague content;
- missing evidence;
- unreadable or unsupported evidence;
- not-applicable behavior;
- affirmative risky evidence where the check defines it;
- multiple distributed evidence candidates;
- exclusions and unsafe paths; and
- stable finding IDs, versions, action levels, outcomes, boundaries, and evidence summaries.

### Guided remedy packaging

Validate that `SKILL.md` and templates:

- ask one question at a time;
- accept unknown answers without invention;
- prohibit secrets and external changes;
- preview exact targets and unresolved decisions;
- require separate approval before writing;
- never stage or commit automatically;
- require a fresh independent recheck; and
- preserve repository-only and non-certification language.

### Integration and acceptance

Acceptance coverage must demonstrate:

- audit-only review does not change project files;
- the new catalog sidecar routes the six checks correctly;
- one check can remain unverified while others complete;
- reports retain partial and domain-coverage semantics;
- the before-and-after example changes only the relevant repository evidence outcomes;
- source and compiled CLI paths agree;
- Linux, macOS, and Windows CI remain green;
- all six skills pass packaging and installation-document tests;
- generated samples contain no controlled secret, numeric readiness score, unconditional launch verdict, authorship attribution, or emoji; and
- existing secret, privacy, report, command-evidence, and artifact-publication behavior does not regress.

## Documentation changes

Implementation updates must cover:

- the repository homepage and current coverage table;
- `docs/foundation-coverage.md` with exact implemented behavior and live-service limitations;
- `ROADMAP.md` to move repository-only operations basics from unimplemented to implemented while leaving production/provider verification as a gap;
- the sample report;
- the before-and-after example guide;
- all agent installation guides;
- compatibility package counts and validation language; and
- release notes when the feature is included in a tagged release.

Documentation must continue to prohibit certified, production-ready, fully secure, compliant, or defect-free verdicts.

## Acceptance criteria

The design is implemented only when all of the following are true:

1. One `launch-operations` skill packages six separately reported checks.
2. Audit mode is repository-only, deterministic, and filesystem-read-only.
3. Checks adapt to project evidence and return honest unverified or not-applicable states.
4. Missing evidence does not become a failure or likely issue without affirmative risky evidence.
5. Usable evidence requires content, not only a filename.
6. Guided remedies work one finding and one question at a time.
7. Every project write receives a separate exact approval and is independently rechecked.
8. Generated plans preserve unknowns and never request or record secrets.
9. No remedy changes application code, configuration, infrastructure, external services, staging, or commits in this wave.
10. Reports and documentation retain explicit live-service, no-score, and non-certification boundaries.
11. Representative project-shape, operating-system, packaging, example, and regression tests pass.
12. No authorship attribution or emoji is added.

## Follow-on work

Separately designed future waves may add:

- approved application-code or configuration remedies such as health endpoints or provider setup;
- provider-specific read-only adapters for deployment, monitoring, storage, database, and app-store evidence;
- live backup and restoration exercises;
- active health and synthetic checks;
- stronger release verification and staged-rollout evidence; and
- approval-gated operational changes.

Each follow-on must retain exact access preview, environment identification, separate approval, redaction, rollback, and fresh evidence requirements. None is authorized by this repository-only design.
