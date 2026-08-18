# PostVibeClarity v0.1 foundation coverage

This document is the source of truth for the implemented v0.1 foundation behavior and its explicit boundaries.

## Runtime state semantics

| Term | Exact v0.1 behavior |
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
| Markdown and JSON reporting | Real review results render with timestamps, toolkit, skill and check versions, per-check execution state, evidence locations, outcome/action counts, completion and domain coverage, explicit coverage gaps, and the required non-certification disclaimer. Every generated report is validated against the versioned v0.1 runtime schema plus semantic summary, provenance, linkage, domain-gap, and `partial` invariants. Neither format emits an overall numeric readiness score. Output files use exclusive creation and a run-ID collision fails without overwriting the existing report. | A report describes only routed checks and explicitly recorded gaps; it is not a launch verdict. Fatal input/catalog/report-contract failures occur before rendering or writing. |

## Guided classification

| Area | Guided coverage | Automation status |
| --- | --- | --- |
| Remaining and ambiguous project shapes | The portable `project-discovery` skill guides evidence-backed classification of desktop, backend/API, worker or scheduled-job, browser/editor extension, AI-agent, infrastructure-as-code, monorepo, and ambiguous multi-artifact projects. | Classification guidance only. No deep audit pack or synthetic per-domain finding is implied. |

## Taxonomy-only omitted audits

Except for the two specialist checks listed above and their documented manual fallbacks, the following design-taxonomy areas do not have packaged v0.1 audit implementations or dedicated guided audit skills:

| Area | v0.1 audit status |
| --- | --- |
| Product and user experience | Omitted taxonomy coverage gap. |
| Security and privacy beyond secret exposure and the narrow privacy signal | Omitted taxonomy coverage gap. |
| Data and correctness | Omitted taxonomy coverage gap. |
| Reliability and recovery | Omitted taxonomy coverage gap. |
| Operations and observability | Omitted taxonomy coverage gap. |
| Performance and cost | Omitted taxonomy coverage gap. |
| Maintainability and change safety | Omitted taxonomy coverage gap. |
| Release and delivery | Omitted taxonomy coverage gap. |
| Policy and business essentials beyond privacy-notice candidate inspection | Omitted taxonomy coverage gap requiring appropriate human ownership where applicable. |

## Not implemented by this plan

| Area | v0.1 status | Required follow-on work |
| --- | --- | --- |
| Remediation engine | Not implemented. The foundation is read-only and does not apply Level 2 or higher actions. | Add separately approved proposal, mutation, rollback, and independent re-verification workflows. |
| Full domain catalog | Not implemented. Two Level 0 checks do not constitute broad coverage of the nine domains. | Add universal checks while preserving evidence, uncertainty, redaction, and no-score contracts. |
| Deep artifact packs | Not implemented. | Add shape-specific checks, beginning with web, backend/API, mobile, and CLI. |
| Framework and provider adapters | Not implemented. | Add technology-specific inspection and verification without weakening universal policies. |
| Automated agent-specific installers | Not implemented. The documented host guides provide project-scoped, version-pinned manual installation and bounded backup/diff updates with recorded revision provenance. | Add host-native automation only with equivalent preview, preservation, provenance, and rollback semantics. |
| Cross-agent runtime acceptance | Not implemented. Skill packaging is validated statically and pressure-tested as documentation, not executed across supported agent runtimes. | Add a versioned runtime acceptance matrix for Codex, Claude Code, Cursor, GitHub Copilot, Gemini CLI, and generic Agent Skills hosts. |
