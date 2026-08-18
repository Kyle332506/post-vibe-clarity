# PostVibeClarity Design Specification

**Date:** 2026-08-17

**Status:** Approved

**License:** Apache License 2.0

## 1. Summary

PostVibeClarity is an open-source, cross-agent toolkit that helps people move from a working, vibe-coded project toward a responsible launch.

Its core promise is:

> **Know what's ready, what's risky, and what's missing before you launch.**

PostVibeClarity reviews the whole product, not only its security. It examines code, infrastructure, user experience, data handling, operations, maintenance, release processes, policy needs, and business essentials. It helps apply safe, bounded fixes with approval and clearly identifies work that still requires human judgment.

PostVibeClarity reduces launch uncertainty. It does not certify applications, guarantee production readiness, provide legal advice, or claim that a project is free of defects.

## 2. Primary Audience

The primary user is a solo or small-team vibe coder preparing for a first real launch. This user may have built a functional project without a formal engineering, security, operations, accessibility, or compliance background.

The toolkit must therefore:

- Use plain language before specialist terminology.
- Explain why a finding matters in practical terms.
- Prioritize what must happen before launch.
- Avoid overwhelming users with irrelevant enterprise controls.
- Expose deeper evidence and advanced checks for experienced teams.
- Never hide uncertainty behind a simple score or success badge.

Experienced teams are a secondary audience. They may invoke specialist skills directly, integrate machine-readable results into CI, contribute adapters, and add stricter policies.

## 3. Goals

PostVibeClarity will:

1. Detect the shape and capabilities of a project without assuming a specific framework.
2. Compose universal, artifact-specific, framework-specific, and provider-specific readiness skills.
3. Review security and the broader set of production-readiness concerns.
4. Support audit, proposed remediation, approved remediation, and independent re-verification.
5. Produce evidence-backed findings with explicit unknowns.
6. Run across multiple coding-agent hosts using the Agent Skills open standard.
7. Provide tested installation, update, verification, and uninstall guidance for supported agents.
8. Support open-source contributions through stable schemas, fixtures, and acceptance tests.

## 4. Non-Goals

PostVibeClarity will not:

- Certify that an application is production ready, secure, compliant, or defect-free.
- Replace qualified legal, security, privacy, accessibility, financial, or domain review.
- Produce a single numeric readiness score.
- Execute production deployments during a normal review.
- Modify or delete production data.
- Publish policies, send customer communications, rotate live credentials, or perform financial actions during a normal review.
- Pretend that a generic check is equivalent to a missing framework- or provider-specific review.
- Require every project type to satisfy the same checklist.

## 5. Design Principles

### 5.1 Framework-agnostic entry, framework-aware execution

The entry point must work without knowing the project's technology. Discovery identifies the artifact types, languages, runtimes, frameworks, services, deployment targets, and sensitive capabilities. The orchestrator then selects relevant specialist skills and adapters.

### 5.2 Capability-driven applicability

Checks are selected because a project has a capability, not only because a file or dependency is present. Examples include collecting personal data, accepting payments, executing background jobs, using device permissions, distributing a package, or exposing an administrative interface.

### 5.3 Evidence before verdicts

Every readiness claim must point to evidence: deterministic inspection, static analysis, behavioral testing, runtime observation, or an explicit human decision.

### 5.4 Unknown is not passed

A check that cannot run or lacks sufficient evidence is marked `unverified`. Missing access, tools, credentials, artifacts, or adapters must never produce an implicit pass.

### 5.5 Verification is independent from remediation

A change is not resolved because the editing agent says it is fixed. The relevant check must run again and produce new evidence.

### 5.6 Progressive depth

Beginners start with one guided launch review. Experienced users can inspect evidence, invoke specialist skills directly, use advanced artifact packs, and consume structured reports.

### 5.7 Safe by default

The normal workflow inspects freely, tests locally, edits only with approval, and prepares—but does not execute—high-risk production actions.

## 6. Supported Project Shapes

The architecture supports:

- Web applications and websites
- Native and cross-platform mobile applications
- Desktop applications
- Command-line tools and developer utilities
- APIs and backend services
- Workers, event consumers, and scheduled jobs
- Libraries, packages, and SDKs
- Browser extensions and editor plugins
- AI agents and AI-powered applications
- Infrastructure-as-code and deployment automation
- Monorepos containing multiple artifact types
- Embedded and IoT projects as a later specialized expansion

Support may vary in automation depth. PostVibeClarity must report whether each check is automated, guided, unavailable, or not applicable.

## 7. Production-Readiness Domains

Every skill maps to one or more of nine top-level domains.

### 7.1 Product and user experience

- Critical user journeys
- Loading, empty, failure, cancellation, and recovery states
- Accessibility
- Responsive behavior
- Offline and degraded-connectivity behavior where applicable
- Onboarding, help, and support paths

### 7.2 Security and privacy

- Authentication and authorization
- Secret and credential handling
- Permission boundaries
- Input, output, upload, and file safety
- Abuse prevention
- Data collection and privacy controls

### 7.3 Data and correctness

- Input validation and database constraints
- Schema migrations
- Concurrency, transactions, and idempotency
- Time zones, currency, rounding, Unicode, and boundary cases
- Data retention, export, and deletion

### 7.4 Reliability and recovery

- External-service failure handling
- Retry behavior and limits
- Backups and tested restoration
- Graceful degradation
- Rollback and disaster recovery

### 7.5 Operations and observability

- Structured logs
- Metrics and error reporting
- Health and readiness checks
- Actionable alerts
- Incident guidance
- Release identification and traceability

### 7.6 Performance and cost

- Performance budgets
- Expensive queries and operations
- Pagination and bounded work
- Rate limits and quotas
- Storage growth
- AI and third-party service spending

### 7.7 Maintainability and change safety

- Test quality and independent verification
- Architecture consistency
- Dependency health
- Dead and duplicate code
- Setup documentation
- Runbooks and ownership

### 7.8 Release and delivery

- Development and production separation
- Reproducible builds
- CI checks
- Signing and packaging
- Deployment smoke tests
- Migration ordering
- Rollback procedures

### 7.9 Policy and business essentials

- Privacy notices
- Terms of service
- Cookie and tracking disclosures
- Open-source licenses and attribution
- Support contact
- Account deletion and data export
- Billing, refund, and subscription behavior
- Transactional communication
- App-store and platform submission requirements

This domain is applicability-driven. PostVibeClarity identifies relevant product behavior and missing artifacts, but it does not make definitive legal determinations. It explains why professional review may be required.

## 8. System Architecture

The system follows this pipeline:

```text
Project
  -> discovery and classification
  -> capability manifest
  -> readiness orchestration
  -> universal kernel + artifact packs + technology adapters
  -> independent verification
  -> evidence-backed launch report
```

### 8.1 Discovery and classification

Discovery is read-only. It collects evidence about:

- Artifact types
- Languages and runtimes
- Frameworks
- Package managers and build systems
- Databases and storage
- Authentication and authorization providers
- Payments, email, messaging, analytics, AI, and other external services
- Deployment targets
- CI and release configuration
- Sensitive capabilities and data classes
- Available test and verification environments

Discovery produces a capability manifest. It does not decide whether the project is ready.

### 8.2 Capability manifest

The manifest is the normalized project description used for routing. It must support multiple artifacts within one repository and record detection evidence and confidence for each capability.

### 8.3 Readiness orchestrator

The orchestrator:

1. Reads the capability manifest.
2. Selects applicable skills.
3. Orders prerequisites and dependent checks.
4. Explains the proposed review plan.
5. Requests access or approval only when needed.
6. Aggregates structured findings and evidence.
7. Coordinates remediation and re-verification.
8. Produces the final report.

### 8.4 Universal kernel

Universal skills define portable expectations such as credential hygiene, dependency provenance, build reproducibility, testing quality, configuration safety, release traceability, and recovery evidence.

The kernel owns policy definitions. Adapters must not silently weaken those definitions.

### 8.5 Artifact packs

Artifact packs define expectations unique to what is shipped. Examples include mobile permissions and lifecycle, desktop signing and updates, CLI exit behavior and signal handling, API idempotency, library compatibility, extension permissions, and agent tool boundaries.

### 8.6 Framework and provider adapters

Adapters translate a shared readiness concern into technology-specific inspection, remediation, and verification behavior. They know where relevant configuration lives, which commands are safe, how a provider enforces controls, and how to collect evidence.

Unknown technologies fall back to portable checks. Missing adapter coverage is reported as unverified, not passed.

### 8.7 Independent verification engine

Verification combines four evidence methods:

- Deterministic inspection
- Static analysis
- Behavioral tests
- Human-guided review

No single method is sufficient for all checks.

## 9. Run Lifecycle

The guided experience is:

```text
Discover -> Preview -> Audit -> Approve fixes -> Recheck -> Report
```

### 9.1 Discover

Inspect the project without modification and produce the capability manifest.

### 9.2 Preview

Show:

- Detected project components
- Skills selected and why
- Read-only checks
- Checks requiring builds, network access, test accounts, or credentials
- Checks that cannot currently run
- Expected external and local side effects

### 9.3 Audit

Run approved checks and explain findings in ordinary language. Preserve structured evidence for advanced users and automation.

### 9.4 Approve fixes

Propose bounded changes. Users may approve individual fixes or a clearly described batch of reversible local changes. Destructive, financial, externally visible, or production-facing actions cannot be included in a batch approval.

### 9.5 Recheck

Rerun the relevant independent checks. Record new evidence and any regression results.

### 9.6 Report

Produce human-readable and machine-readable outputs containing findings, every routed check's execution state, coverage gaps, unknowns, accepted risks, changes, evidence, timestamps, environment information, and toolkit, skill, and check version information.

## 10. Finding and Evidence Model

### 10.1 User-facing action levels

- **Stop before launch:** credible risk of serious harm, data loss, compromise, major financial loss, or an unusable release.
- **Resolve before launch:** important gap that should be fixed or consciously accepted before real users arrive.
- **Plan soon:** likely to create operational or maintenance trouble but not an immediate blocker.
- **Improve when appropriate:** useful hardening with relatively low current risk.
- **Human review needed:** requires business, legal, design, accessibility, security, or domain judgment the toolkit cannot make.

### 10.2 Check outcomes

- `passed`
- `failed`
- `likely-issue`
- `unverified`
- `not-applicable`
- `risk-accepted`
- `resolved-and-rechecked`

`fixed` is an action state, not a final outcome.

### 10.3 Required finding fields

Each finding records:

- Stable identifier
- Skill and check version
- Domain
- Action level
- Outcome
- Plain-language summary
- Practical impact
- Evidence
- Evidence method
- Evidence confidence
- Unverified boundaries
- Applicability rationale
- Recommended timing
- Proposed remediation capability
- Re-verification method
- Human-review requirement
- Affected artifacts and locations

### 10.4 Required check-execution and coverage fields

Every routed check records a stable check ID, check version, owning skill ID and version, routed domains, one execution state (`completed`, `unavailable`, `failed`, or `unverified`), and the exact finding IDs it produced. A successful check that returns no findings is still recorded as `completed`.

Every unavailable, failed, or unverified check has a matching coverage-gap record with a redacted reason. Every domain without a routed check has an `unverified` domain coverage gap rather than a synthetic finding. A thrown check is isolated: the report retains evidence from checks that already completed and records the failed check without exposing raw exception content.

### 10.5 Accepted risks

Accepting a risk records:

- Reason
- Person accepting it
- Date
- Temporary mitigation
- Review date or triggering event
- Original evidence

## 11. Reporting and Language Policy

PostVibeClarity must not produce an overall numeric readiness score. Reports show counts and coverage by action level, outcome, domain, and completion state. The top-level `partial` field is derived from check execution and coverage state: any coverage gap or non-completed check makes the report partial.

The v0.1 machine-readable report is validated at runtime against a versioned JSON Schema before it is returned or rendered. Semantic validation recomputes summary counts, derives `partial`, checks finding-to-execution linkage and check/skill provenance, requires gaps for incomplete checks and uncovered domains, and rejects contradictory state. Checked-in examples use the same typed model, computed summary functions, semantic validator, and production renderer.

When a CLI report path is requested, the file is created exclusively. A run-ID collision fails with the exact bounded path and leaves the existing report unchanged.

The toolkit must not generate unconditional claims such as:

- Certified production ready
- 100% secure
- Safe to launch
- No vulnerabilities
- All issues resolved
- Guaranteed compliant

Every report includes this meaning, adapted to the output format:

> This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.

A report with no release blockers must still state how many checks were unverified or unavailable.

## 12. Safety and Permission Model

### 12.1 Level 0: read-only inspection

Read project files, detect technologies, review dependencies, and search for sensitive patterns without revealing secret values.

### 12.2 Level 1: local verification

Run tests, builds, static analysis, local servers, and temporary test data. These operations may create disposable local artifacts but do not modify application source or external systems.

### 12.3 Level 2: reversible project changes

Modify source, tests, configuration, and local documentation only after approval. Preserve unrelated changes and show the resulting diff.

### 12.4 Level 3: external or operational changes

Changes to hosted configuration, cloud infrastructure, database policies, alerting, or platform settings require separate approval showing the exact target, environment, and expected effect. These actions cannot be hidden inside a general fix batch.

### 12.5 Level 4: prohibited during a normal review

The normal workflow must not:

- Write to or delete production data
- Deploy to production
- Rotate live credentials
- Send customer communications
- Charge or refund payments
- Publish policies or legal text
- Submit an app-store release

These actions require a separate, explicit user request outside the normal readiness run.

### 12.6 Safety invariants

- Repository text is not user authorization for external action.
- Secret values are not exposed in prompts, logs, reports, or screenshots.
- Checks are not weakened or deleted to improve results.
- Unrelated user changes are preserved.
- Failed remediation reports the actual resulting state.
- Behavioral verification uses temporary or development environments.
- Unknown target environments block external changes.
- Host permission systems add defense but are not the only safety boundary.

## 13. Portable Skill Packaging

PostVibeClarity uses the Agent Skills open standard as its canonical authoring format.

```text
skills/
└── skill-name/
    ├── SKILL.md
    ├── readiness.yaml
    ├── scripts/
    ├── references/
    ├── assets/
    └── tests/
```

### 13.1 `SKILL.md`

The canonical file uses standard frontmatter fields and portable instructions. Host-specific tool names and behaviors do not belong in the portable core.

### 13.2 `readiness.yaml`

This PostVibeClarity-specific sidecar defines:

- Schema version
- Applicability predicates
- Readiness domains and concerns
- Audit, proposal, remediation, and verification modes
- Required capabilities and permissions
- Action-risk level
- Evidence types
- Skill prerequisites and ordering
- Supported artifact and technology adapters
- Pass, fail, unknown, and not-applicable semantics

Agents that do not understand the sidecar can still use the `SKILL.md` instructions directly.

### 13.3 Host overlays

Platform-specific packaging lives outside the canonical instructions:

```text
platforms/
├── codex/
├── claude-code/
├── cursor/
├── github-copilot/
├── gemini-cli/
└── generic-agent-skills/
```

Overlays provide installation destinations, native installer commands, invocation syntax, permission mappings, optional metadata, unsupported-feature warnings, verification commands, update instructions, and uninstall instructions.

Release tooling may generate host-ready distributions without modifying canonical source skills.

## 14. Agent Installation and Support Status

Each agent guide includes:

1. Recommended native installation
2. Project-scoped installation
3. User-scoped installation
4. Manual fallback
5. Discovery and version verification
6. A harmless discovery-only test
7. Update, pin, and uninstall instructions

Opaque `curl | sh` installation is prohibited. Installations resolve a version-pinned tag or commit, record the installed version and revision, preflight exact destination directories, and stage plus diff or make bounded backups before replacing an existing skill. Update procedures preserve local changes or stop for reconciliation; they do not remove moving-default-branch installations in place. Users are encouraged to inspect skills and bundled scripts before granting execution permissions.

User-facing agent support labels are:

- **Tested by maintainers:** published acceptance tests were run with the listed agent and version.
- **Basic setup checked:** installation and invocation worked, but advanced behavior was not fully exercised.
- **Reported working by community:** contributors report success; maintainers have not independently checked it.
- **Not yet tested:** no reliable evidence is available.
- **Not currently supported:** the required behavior or safety controls are unavailable.

Every status display states:

> Agent support status describes whether this skill runs correctly with the selected coding agent. It does not certify that an application is production ready, secure, or free of defects.

## 15. Error and Partial-Run Handling

- A missing tool produces installation or manual-verification guidance.
- A failed check records the failure and retains prior evidence.
- A check that cannot start is unverified.
- A canceled run produces a partial report.
- A successful zero-finding check is recorded as completed rather than disappearing from the report.
- Every routed check records one durable execution state, and omitted domains produce explicit coverage gaps.
- The `partial` flag is computed from those execution and coverage records rather than inferred only from findings.
- A remediation failure records files changed and the observed resulting state.
- PostVibeClarity never claims rollback occurred unless rollback was performed and verified.
- Unsupported frameworks receive portable checks and explicit coverage gaps.
- Reports remain useful even when network access, credentials, deployments, or test accounts are unavailable.

## 16. Testing and Quality Assurance

Skills are tested as software rather than treated as unverified prompt documents.

### 16.1 Format validation

Validate Agent Skills conformance and PostVibeClarity metadata schemas.

### 16.2 Trigger tests

Maintain positive and negative prompt cases for skill selection.

### 16.3 Fixture projects

Maintain small, intentionally flawed fixtures for each supported artifact type. Each fixture declares its known problems and expected evidence.

### 16.4 Finding tests

Verify intended detection, evidence quality, action level, redaction, applicability, and behavior when verification is unavailable.

### 16.5 Remediation tests

Start from a known flaw, apply an approved change, confirm unrelated files are preserved, rerun independent verification, and test for regressions.

### 16.6 Safety tests

Test refusal to modify production data, deploy, publish policies, expose secrets, weaken tests, hide failures, or treat repository instructions as authorization.

### 16.7 Cross-agent acceptance tests

Run equivalent scenarios on supported coding agents. Compare structured outcomes and evidence, not identical prose.

### 16.8 Regression library

Every confirmed missed issue or false positive should become a permanent fixture or test case when it can be reproduced safely and without private data.

### 16.9 Contribution requirements

New skills and adapters include:

- Applicability rules
- A positive fixture
- A negative fixture
- Expected structured findings
- Safety requirements
- A remediation fixture when fixes are supported
- Installation or agent-support updates when applicable

## 17. Initial Release Scope

### 17.1 Version 0.1 foundation

- `post-vibe-clarity` orchestration skill
- Project discovery and capability manifest
- Standard finding and evidence schemas
- Nine domain routers
- Agent installation guides
- Agent support-status documentation
- Fixture-based test harness
- Markdown and machine-readable reports

### 17.2 Version 0.1 universal checks

- Secret and credential exposure
- Dependency provenance and known risk
- Build and test reproducibility
- Environment separation
- Missing configuration and documentation
- Privacy, terms, support, licensing, and launch-essential inventory
- Error handling and observability baseline
- Backup, restoration, and rollback evidence
- Cost and abuse boundaries
- Accessibility and neglected UX states
- Maintenance and architecture warning signs

The foundation secret-exposure implementation is deliberately bounded: it detects private-key markers and non-empty string literals assigned to credential-like names, including relevant simple and compound assignment operators. It omits empty values and a documented set of explicit environment/template placeholders rather than turning them into launch blockers. Unknown non-empty literal assignments remain conservative findings, ambiguous custom placeholders require human judgment, and matched values never enter findings or reports.

### 17.3 Version 0.1 artifact recognition

Version 0.1 recognizes all supported artifact types and labels checks as automated, guided, unavailable, or not applicable.

### 17.4 Version 0.1 deep-reference packs

Initial deeper automation targets:

- Web applications
- Backend and API services
- Mobile applications
- Command-line tools

Other artifact types receive the universal baseline and artifact-specific guided checks until deeper automation is added.

### 17.5 Later releases

- **0.2:** Desktop, libraries and SDKs, workers, and monorepos
- **0.3:** Extensions, infrastructure automation, and AI-agent assurance
- **0.4:** Broader provider and framework adapters
- **1.0:** Stable schemas, contribution contract, tested agent integrations, and a mature regression library

Version numbers describe toolkit stability, not an application's readiness.

## 18. Success Criteria

Version 0.1 succeeds when:

1. A first-time launcher can install and invoke PostVibeClarity using documented steps on each initially supported agent host.
2. Discovery correctly classifies the fixture projects and records uncertainty.
3. The orchestrator selects relevant checks without applying irrelevant requirements across artifact types.
4. Universal checks detect their seeded fixture failures with useful evidence.
5. Missing tools and unsupported adapters produce unverified results rather than passes.
6. Approved local remediation preserves unrelated changes and is independently rechecked.
7. Safety tests prevent normal review runs from taking prohibited actions.
8. Reports avoid certification language and expose unresolved and unverified work.
9. Contributors can add a skill or adapter using documented schemas and fixtures.

## 19. Licensing and Governance

PostVibeClarity is released under the Apache License 2.0.

Repository governance will require:

- License headers or repository-level licensing as appropriate
- A contributor guide
- A code of conduct
- A security reporting policy
- Review requirements for executable skill scripts
- Provenance and versioning for releases
- Maintainer review before an integration is labeled `Tested by maintainers`

The license choice is a project decision and is not presented as legal advice to downstream users.

## 20. Research Basis

The initial threat and failure model is informed by:

- [Veracode Spring 2026 GenAI Code Security Update](https://www.veracode.com/blog/spring-2026-genai-code-security/)
- [Wiz research on common risks in vibe-coded applications](https://www.wiz.io/blog/common-security-risks-in-vibe-coded-apps)
- [OWASP Secure Coding with AI Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Coding_with_AI_Cheat_Sheet.html)
- [USENIX Security 2025 package hallucination research](https://www.usenix.org/system/files/usenixsecurity25-spracklen.pdf)
- [DORA State of AI-assisted Software Development 2025](https://dora.dev/research/2025/dora-report/)
- [Agent Skills specification](https://agentskills.io/specification)
- [Official OpenAI skill documentation](https://developers.openai.com/codex/skills)
- [Claude Code skill documentation](https://code.claude.com/docs/en/slash-commands)
- [GitHub Copilot skill documentation](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
- [Gemini CLI skill documentation](https://geminicli.com/docs/cli/using-agent-skills/)
- [Cursor Agent Skills announcement](https://cursor.com/changelog/2-4)

Research informs the fixture library and priorities. Vendor claims and field reports are not treated as guarantees, and new reproducible failures should become regression cases over time.
