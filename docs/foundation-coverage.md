# PostVibeClarity v0.3 foundation coverage

This document is the source of truth for the implemented v0.3 foundation behavior and its explicit boundaries.

## Level 0 repository review

The foundation now contains eight Level 0 checks across six portable skills. Two existing checks cover redacted secret exposure and a narrow privacy-notice candidate signal. The `launch-operations` skill adds six deterministic repository-only Level 0 checks:

- `launch-operations.release-process`
- `launch-operations.rollback-process`
- `launch-operations.monitoring-response`
- `launch-operations.health-check`
- `launch-operations.backup-restore`
- `launch-operations.maintenance-ownership`

The operations checks use bounded, versioned content profiles. A filename alone does not satisfy or pass a check. Missing or vague evidence is `unverified`; absence does not prove that a live capability is missing, and only narrow affirmative risky text can produce a `likely-issue` result. Applicability adapts to project evidence, with health checks conditional on a network service and backup checks conditional on persistent data.

The checks are deterministic, read-only, and require only `filesystem-read`. They do not use credentials, connect to a provider, or access a deployment or production environment. The checks do not inspect live providers, deployment state, alert delivery, health endpoint responses, backup creation, restore results, or rollback execution.

Guided operations remedies are separate from the audit. The `launch-operations` workflow handles one finding and one question at a time, previews one exact target, and requires separate Level 2 approval before it writes only an approved Markdown runbook or bounded Markdown update. Generated drafts preserve unknown decisions as visible unresolved decisions. Neither a repository audit nor a broad readiness request authorizes source, configuration, workflow, infrastructure, external-service, staging, commit, or release changes.

## Level 1 local command evidence

Optional Level 1 verification is implemented for project-declared build, type-check, lint, and test commands. PostVibeClarity creates a plan without running commands, records the exact command sources and settings in a fingerprint, and executes only the unchanged plan after that exact fingerprint is approved.

The exact command declaration and direct launch details are checked before start. This does not freeze imported files, dependencies, operating-system code, or changes made by other processes; transitive loads and the interval after checking remain outside the evidence.

Node projects can use unambiguous package-manager evidence and declared package scripts when the exact declaration has a portable, shell-free interpretation bound to a fingerprinted Node runtime and any direct project or local-package JavaScript entry point. Unsupported script syntax, Node option shapes, or launchers remain explicit unverified coverage. Other projects can use literal argument arrays in `postvibe.verification.yaml`. Missing, excluded, interrupted, timed-out, or unsupported commands remain unverified. Detected but uncovered monorepo workspaces remain explicit gaps.

The executor filters named sensitive environment variables, bounds and redacts captured output, observes visible file changes, and attempts process-tree termination on timeout or interruption. This is not strong sandboxing. Local scripts may read project or outside files, load `.env`, change files, start processes, and use the network. Passing commands do not establish production behavior, complete test coverage, production readiness, or complete security.

Every OS matrix job calls `pnpm test:executor`. That script builds its own compiled CLI before running the executor and source/compiled acceptance tests, so it does not depend on another job's workspace or an untracked `dist` directory.

## Runtime state semantics

| Term | Exact v0.3 behavior |
| --- | --- |
| Guided classification | The portable `project-discovery` skill can guide a human or compatible agent in classifying project shapes and recording evidence that the deterministic detector does not cover. This does not run a readiness audit for those shapes. |
| Taxonomy-only omitted audit | A readiness concern named in the design taxonomy but lacking a packaged routed sidecar/check is not turned into a finding. Its uncovered domain is recorded in `coverageGaps`, and the report is partial. |
| Routed missing implementation | When a valid catalog sidecar matches the discovered manifest but one of its check IDs has no registered implementation, the runner records the check as `unavailable`, emits an `unverified` finding, preserves sidecar version provenance, and marks the report partial. |
| Routed failed or unverified check | A thrown check is isolated as `failed`, retains evidence from earlier checks, and produces a redacted `unverified` finding. A completed check with an unverified result is recorded as `unverified`. Both states produce a check-specific coverage gap and a partial report. |
| Unsupported or unregistered domain | When no routed catalog check represents a domain, the runner emits no synthetic finding but adds an `unverified` domain coverage gap to the report. The domain must not be described as verified. |
| Unreadable or invalid input | Unreadable project input, invalid `package.json`, and unreadable, incomplete, malformed, or invalid catalog data are fatal before a report exists. Normal CLI mode prints a stable sanitized failure; debug mode prints only a sanitized error category and frame locations. |

None of these states is converted into a pass or a readiness claim.

## Implemented and automated

| Area | Exact automated coverage | Explicit boundary |
| --- | --- | --- |
| Discovery | Read-only inspection confirms web artifacts from Next.js, React DOM browser, or root static-HTML entry signals; mobile artifacts from Expo or React Native; library artifacts from package exports; and CLI artifacts from package binaries. It records React, Next.js, Expo, and React Native framework evidence and can flag likely account-email collection. | React alone is recorded as a framework signal and does not imply web. Other artifact, framework, service, and capability detection remains incomplete. Unreadable or invalid discovery input is fatal before reporting. |
| Catalog routing | Schema-valid `readiness.yaml` sidecars are loaded deterministically and routed by `anyArtifacts` and `allCapabilities`. Sidecar-bearing directories require matching directory, `SKILL.md` frontmatter, sidecar identities, and a semantic skill version; duplicate skill IDs and check ownership are rejected. A routed check without a registered implementation becomes `unavailable` while retaining the sidecar's `skillVersion`; the unavailable check version is `unknown`. | Instruction-only skills remain usable but do not become automated checks. Sidecar provenance identifies the packaged skill, not host runtime acceptance or the state of an installed working copy. |
| Redacted secret inspection | An explicit text-file gate covers supported source/config formats, `.env` and `.env.*`, and common `.pem`/`.key` files while rejecting binary content. JavaScript and TypeScript use syntax-aware inspection of runtime variable, property, class-field, binding-default, and assignment-expression string values, including compound assignment operators such as `||=`, `??=`, and arithmetic/bitwise assignments; comments, type nodes, interfaces, aliases, declaration files, and ambient declarations are excluded. Findings contain only a rule ID and location. Empty values and a bounded set of explicit template placeholders are omitted rather than promoted to launch blockers. | This is not a comprehensive secret scan; history, generated output, deployed artifacts, provider state, inaccessible files, nonliteral runtime values, and ambiguous custom placeholders remain unchecked. Unknown non-empty literal values assigned to credential-like names are still reported conservatively. Other language/config formats use bounded text rules rather than language ASTs. |
| Privacy-notice candidate inspection | When likely account-related personal-data collection is detected, file paths are inspected for a privacy-notice candidate. A missing candidate is reported as a likely issue requiring human review. | Content accuracy, legal sufficiency, publication state, collection-point links, jurisdictions, vendor configuration, and runtime data flows are not verified. |
| Repository launch-operations evidence | Six deterministic checks content-check release or deployment instructions, rollback or recovery instructions, monitoring and incident response, applicable health-check evidence, applicable backup and restore guidance, and maintenance ownership. Missing, vague, ambiguous, unreadable, unsupported, or inapplicable evidence retains the defined `unverified` or `not-applicable` state. | Repository evidence does not establish live provider state or prove that a deployment, alert, health endpoint, backup, restore, rollback, recovery procedure, or owner response works. No credential or external service is accessed. |
| Markdown and JSON reporting | Real review results render with timestamps, toolkit, skill and check versions, per-check execution state, evidence locations, outcome/action counts, completion and domain coverage, explicit coverage gaps, and the required non-certification disclaimer. Base review reports use the versioned v0.1 schema; linked verified reports use the strict v0.2 schema plus versioned plan and execution contracts, semantic summary, provenance, linkage, domain-gap, and `partial` invariants. Neither format emits an overall numeric readiness score. Output files use exclusive creation and a run-ID collision fails without overwriting the existing report. | A report describes only routed checks and explicitly recorded gaps; it is not a launch verdict. Fatal input/catalog/report-contract failures occur before rendering or writing. |

## Guided classification

| Area | Guided coverage | Automation status |
| --- | --- | --- |
| Remaining and ambiguous project shapes | The portable `project-discovery` skill guides evidence-backed classification of desktop, backend/API, worker or scheduled-job, browser/editor extension, AI-agent, infrastructure-as-code, monorepo, and ambiguous multi-artifact projects. | Classification guidance only. No deep audit pack or synthetic per-domain finding is implied. |

## Taxonomy coverage beyond the implemented checks

The eight checks provide narrow evidence coverage rather than complete coverage of any production domain. Repository operations basics are implemented above; the broader work in this table remains open.

| Area | v0.3 audit status |
| --- | --- |
| Product and user experience | Omitted taxonomy coverage gap. |
| Security and privacy beyond secret exposure and the narrow privacy signal | Omitted taxonomy coverage gap. |
| Data and correctness beyond declared commands and repository backup guidance | Broader coverage remains open. |
| Reliability and recovery beyond repository rollback and backup guidance | Live recovery evidence and exercises remain open. |
| Operations and observability beyond repository monitoring and health evidence | Live providers, alerts, endpoints, and response behavior remain open. |
| Performance and cost | Omitted taxonomy coverage gap. |
| Maintainability and change safety beyond repository ownership evidence | Broader coverage remains open. |
| Release and delivery beyond repository release and rollback evidence | Deployment state and provider verification remain open. |
| Policy and business essentials beyond privacy-notice candidate inspection | Omitted taxonomy coverage gap requiring appropriate human ownership where applicable. |

## Remaining gaps

| Area | v0.3 status | Required follow-on work |
| --- | --- | --- |
| General remediation engine | Not implemented. The repository audit remains read-only; only the separate `launch-operations` workflow can create one exactly approved Markdown runbook at Level 2. | Add separately designed proposal, mutation, rollback, and independent re-verification workflows. |
| Full domain catalog | Not implemented. Eight Level 0 checks do not constitute broad coverage of the nine domains. | Add universal checks while preserving evidence, uncertainty, redaction, and no-score contracts. |
| Deep artifact packs | Not implemented. | Add shape-specific checks, beginning with web, backend/API, mobile, and CLI. |
| Framework and provider adapters | Not implemented. | Add technology-specific inspection and verification without weakening universal policies. |
| Live operations and production verification | Not implemented. No live provider, deployment state, alert delivery, endpoint response, backup, restore, rollback execution, staging environment, or production account is checked. | Add separately approved active environment verification. |
| Recovery exercises | Not implemented. Written recovery and backup evidence is not execution evidence. | Add isolated live backup, restoration, and rollback exercises with exact environment approval. |
| Performance and cost | Not implemented beyond a declared local command a user explicitly approves. | Add load, performance, and cost checks with explicit environments and evidence limits. |
| Code and configuration remedies | Not implemented. Operations remedies are Markdown-only. | Design separately approved application-code, configuration, workflow, infrastructure, and provider changes. |
| Legal sufficiency | Not implemented. A privacy-notice candidate is existence-only evidence. | Require appropriate human owners or qualified counsel for applicable legal review. |
| Strong sandboxing | Not implemented. The Level 1 executor is a bounded local process runner, not a security sandbox. | Add a replaceable container or stronger isolation backend without weakening exact-plan approval. |
| Automated agent-specific installers | Not implemented. The documented host guides provide project-scoped, version-pinned manual installation and bounded backup/diff updates with recorded revision provenance. | Add host-native automation only with equivalent preview, preservation, provenance, and rollback semantics. |
| Cross-agent runtime acceptance | Not implemented. Skill packaging is validated statically and pressure-tested as documentation, not executed across supported agent runtimes. | Add a versioned runtime acceptance matrix for Codex, Claude Code, Cursor, GitHub Copilot, Gemini CLI, and generic Agent Skills hosts. |

## Report disclaimer

This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.
