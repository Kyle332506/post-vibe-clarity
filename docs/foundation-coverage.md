# PostVibeClarity v0.1 foundation coverage

This document describes the implemented foundation, not the complete PostVibeClarity product. The governing contracts and intended architecture are in the approved [PostVibeClarity design specification](./superpowers/specs/2026-08-17-postvibeclarity-design.md).

Missing, inaccessible, unsupported, or unavailable coverage is reported as `unverified`; it is never converted into a pass or a readiness claim.

## Implemented and automated

| Area | Exact automated coverage | Explicit boundary |
| --- | --- | --- |
| Discovery | Read-only inspection of Node `package.json` and readable source detects web and CLI artifacts, Next.js, and likely account-email collection. Evidence and confidence are recorded in the capability manifest. | Other artifacts, frameworks, services, capabilities, and inaccessible files are not deterministically discovered in v0.1. |
| Catalog routing | Schema-valid `readiness.yaml` sidecars are loaded deterministically and routed by `anyArtifacts` and `allCapabilities`. A routed check without a registered implementation becomes `unverified`. | Instruction-only skills remain usable but do not become automated checks. A present sidecar requires a readable `SKILL.md`. |
| Redacted secret inspection | Readable source and configuration files are checked for private-key markers and quoted credential-like assignments. Findings contain a rule ID and location, never the matched value. | This is not a comprehensive secret scan; history, binaries, generated output, deployed artifacts, provider state, and inaccessible files remain unchecked. |
| Privacy-notice candidate inspection | When likely account-related personal-data collection is detected, file paths are inspected for a privacy-notice candidate. A missing candidate is reported as a likely issue requiring human review. | Content accuracy, legal sufficiency, publication state, collection-point links, jurisdictions, vendor configuration, and runtime data flows are not verified. |
| Markdown and JSON reporting | Real review results render with timestamps, toolkit and check metadata, evidence locations, outcome/action counts, explicit unverified areas, and the required non-certification disclaimer. Neither format emits an overall numeric readiness score. | A report describes only the checks that were routed and run or recorded as unavailable; it is not a launch verdict. |

## Recognized but guided

Portable Agent Skill instructions can guide a human or compatible agent through these areas, but the v0.1 deterministic runner does not provide the described broad coverage.

| Area | Guided coverage in the foundation | Automation status |
| --- | --- | --- |
| Remaining project shapes | Mobile, desktop, backend/API, worker or scheduled job, library/SDK, browser or editor extension, AI agent, infrastructure-as-code, and monorepo projects can be classified through the project-discovery skill. | Guided only; no deterministic artifact detector or deep check pack is included for these shapes. |
| Product and user experience | Critical journeys, system states, accessibility, responsive/degraded behavior, onboarding, help, and support can be reviewed against the design taxonomy. | Guided only; no domain checks are registered. |
| Security and privacy | Authentication, authorization, permission boundaries, input/output/upload safety, abuse prevention, and broad privacy controls can be reviewed manually. | Guided beyond the automated secret-exposure rule and narrow privacy capability signal. |
| Data and correctness | Validation, constraints, migrations, concurrency, transactions, idempotency, boundary cases, retention, export, and deletion can be reviewed manually. | Guided only; no domain checks are registered. |
| Reliability and recovery | External failure handling, retries, backups/restores, graceful degradation, rollback, and disaster recovery can be reviewed manually. | Guided only; no domain checks are registered. |
| Operations and observability | Logs, metrics, error reporting, health checks, alerts, incident guidance, and release traceability can be reviewed manually. | Guided only; no domain checks are registered. |
| Performance and cost | Budgets, expensive work, pagination, quotas, storage growth, and provider spending can be reviewed manually. | Guided only; no domain checks are registered. |
| Maintainability and change safety | Tests, architecture, dependencies, duplication, setup documentation, runbooks, and ownership can be reviewed manually. | Guided only; no domain checks are registered. |
| Release and delivery | Environment separation, reproducible builds, CI, signing, packaging, deployment smoke checks, migrations, and rollback procedures can be reviewed manually. | Guided only; no domain checks are registered. |
| Policy and business essentials | Terms, tracking disclosures, licenses, support, deletion/export, billing/refunds, communications, and store requirements can be reviewed with appropriate human owners. | Guided beyond privacy-notice candidate discovery; legal and policy judgments always require qualified human review. |

## Not implemented by this plan

| Area | v0.1 status | Required follow-on work |
| --- | --- | --- |
| Remediation engine | Not implemented. The foundation is read-only and does not apply Level 2 or higher actions. | Add separately approved proposal, mutation, rollback, and independent re-verification workflows. |
| Full domain catalog | Not implemented. Two Level 0 checks do not constitute broad coverage of the nine domains. | Add universal checks while preserving evidence, uncertainty, redaction, and no-score contracts. |
| Deep artifact packs | Not implemented. | Add shape-specific discovery and checks, beginning with web, backend/API, mobile, and CLI. |
| Framework and provider adapters | Not implemented. | Add technology-specific inspection and verification without weakening universal policies. |
| Agent-specific installers | Not implemented. Canonical skills require manual project-scoped installation. | Add host overlays and install, update, verification, and uninstall flows per supported agent. |
| Cross-agent runtime acceptance | Not implemented. Skill packaging is validated statically and pressure-tested as documentation, not executed across supported agent runtimes. | Add a versioned runtime acceptance matrix for Codex, Claude Code, Cursor, GitHub Copilot, Gemini CLI, and generic Agent Skills hosts. |
