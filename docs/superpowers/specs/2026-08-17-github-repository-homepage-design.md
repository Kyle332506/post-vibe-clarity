# PostVibeClarity GitHub Repository Homepage Design

**Date:** 2026-08-17  
**Status:** Approved design  
**Repository:** Personal GitHub account, repository name `post-vibe-clarity`

## Purpose

Create a guided-adoption GitHub repository homepage for PostVibeClarity. The homepage must help a first-time vibe coder understand the production-preparation problem, install the skills with a coding agent, run a first review, interpret the evidence correctly, and find support or contribution paths.

The presentation should treat v0.1 as a stable foundation. Stability describes the implemented foundation and its tested contracts; it does not imply complete production-readiness coverage.

## Core positioning

The repository leads with production preparation while refusing readiness, security, compliance, or defect-free guarantees.

Approved hero message:

> # PostVibeClarity
>
> ## Prepare vibe-coded projects for production with evidence—not guesswork.
>
> PostVibeClarity discovers your project's shape, applies relevant launch-review skills, and reports risks, missing essentials, and unverified areas before you ship.

The hero may show only evidence-backed badges:

- The CI badge appears only after a successful workflow run on the default branch.
- The Apache-2.0 license badge links to `LICENSE`.
- The release-positioning badge reads `v0.1 · Stable foundation` and must not use certification or seal-like styling.

The primary hero link moves to agent installation. Secondary hero links open the example report and current coverage map.

## Non-certification boundary

The full disclaimer is:

> **Important:** PostVibeClarity supports production preparation, but it does not guarantee that a project is production-ready. It cannot find every vulnerability, prove that security is fully hardened, ensure legal or regulatory compliance, or eliminate operational failures. A report only describes the checks performed, the evidence found, and the areas that remain unverified.

The repository must display this boundary in four places:

1. A shortened statement near the hero.
2. The full statement immediately after installation.
3. A contextual reminder beside the example report.
4. A dedicated `DISCLAIMER.md` linked from the README.

Generated reports retain their existing disclaimer. The README and related repository files must not use `certified`, `certification`, `production-ready verdict`, security guarantees, readiness percentages, or an overall readiness score as positive product claims.

## Presentation rules

- Do not use emojis anywhere in the repository presentation, finding examples, headings, issue templates, or social-preview design.
- Prefer plain status labels such as `Stop before launch`, `Human review needed`, `Unverified`, and `Evidence recorded`.
- Avoid framework-logo walls, star counters, coverage percentages without a defined measurement, security seals, and promotional claims unsupported by evidence.
- Use concise, direct language suitable for a first-time launcher while preserving links to deeper technical detail.

## README information architecture

The README follows this order:

1. Hero, production-preparation promise, evidence-backed badges, and short boundary statement.
2. Agent-first installation, with the host guide table directly below the copy-paste prompt.
3. Full disclaimer.
4. How the review works.
5. Example report and interpretation guidance.
6. Current coverage and support boundaries.
7. Project shapes represented by the architecture.
8. Agent compatibility evidence.
9. Roadmap grouped by outcomes.
10. Contribution, support, security, license, and maintenance links.

This order prioritizes successful first use before architecture or contributor detail.

## Agent-first installation

The installation experience uses three layers:

1. A copy-paste prompt for coding-agent users.
2. Host-specific, version-aware installation guides.
3. A manual project-scoped Agent Skills fallback.

The prompt template is:

> Install PostVibeClarity for this project from `github.com/{owner}/post-vibe-clarity`. Use the instructions for this agent, install the skills only inside the current project, verify all four skills are available, and then run a read-only launch review. Do not change project files during the review.

`{owner}` is resolved from the authenticated GitHub account when the repository is created; it is not a literal README placeholder at release time.

Each host guide must contain:

- The exact project-scoped destination directory.
- The installation or copy command.
- Any restart, reload, or discovery behavior.
- Invocation syntax.
- A verification step that confirms all four canonical skills are discoverable.
- Update instructions.
- Uninstall instructions.
- The last-tested host version and test date when runtime testing exists.
- A release tag or commit pin, the resolved installed revision, and a project-local revision record.
- A preflight of the exact destination directories and staged comparison or bounded backup before any update replaces existing content.

The copy-paste prompt is immediately followed by links to all five installation guides in a compact compatibility table. Architecture, limitations beyond the required installation disclaimer, and development material do not interrupt this first-use path.

The initial guides are:

- `docs/installation/codex.md`
- `docs/installation/claude-code.md`
- `docs/installation/cursor.md`
- `docs/installation/windsurf.md`
- `docs/installation/agent-skills.md`

Codex project installation uses `.agents/skills`, as documented by official OpenAI guidance. Any host-specific location or command must be verified against current first-party documentation during implementation.

## Compatibility policy

Compatibility is reported per agent and version with one of these evidence labels:

- **Tested:** The documented install, discovery, invocation, and representative read-only review were executed successfully on the named version.
- **Documented:** First-party host documentation supports the required format and location, but PostVibeClarity has not completed the runtime acceptance flow on that version.
- **Format compatible:** The host claims Agent Skills format compatibility, but neither the complete host-specific instructions nor runtime behavior have been verified by PostVibeClarity.
- **Not verified:** Available evidence is insufficient for a compatibility claim.

No host receives a `Tested` label from documentation alone. Labels do not use `certified` or imply that the agent produces a complete production assessment.

## How the review works

The README explains the flow in plain text:

```text
Discover project
      |
      v
Identify capabilities and production concerns
      |
      v
Route applicable review skills
      |
      v
Run safe checks and guided reviews
      |
      v
Report evidence, missing work, and unknowns
```

The example report uses plain labels and realistic findings:

```text
Stop before launch
Potential credential found in project configuration.

Human review needed
Personal-data collection detected, but no privacy notice was found.

Unverified
Deployment configuration could not be inspected.

Evidence recorded
Project shape and applicable checks were identified.
```

The interpretation immediately below the example states:

> No overall readiness score is calculated. “No findings” does not mean “production-ready”; it means only that the checks performed did not produce findings from the available evidence.

The canonical full example is stored in `docs/examples/sample-report.md` and must be generated from the production renderer over a typed fixture that passes the versioned runtime schema and semantic invariants. Its capability signals, routed checks, provenance, computed summary, `partial` value, and coverage gaps must agree; it is not maintained as an unrelated marketing mockup.

## Current coverage

The homepage presents a factual capability map:

| Capability | v0.1 status | Boundary |
| --- | --- | --- |
| Project discovery | Automated for documented Node and static-project signals | Other or ambiguous project shapes require guided classification |
| Secret exposure checks | Automated, redacted scanning with a manual fallback | Not a complete security audit or proof of hardening |
| Privacy-notice check | Automated when personal-data signals are detected | Not legal advice or a compliance determination |
| Evidence reports | Markdown and JSON reports with explicit unknowns | No overall readiness score |
| Broader readiness domains | Taxonomy established | Most specialist audits are not yet implemented |
| Agent compatibility | Labeled as tested, documented, format-compatible, or not verified | No blanket cross-agent support claim |

The README links to `docs/foundation-coverage.md` as the source of truth. README summaries must be updated whenever that coverage map changes.

## Project-shape model

The architecture is designed to represent:

- Web and native mobile projects.
- Desktop applications.
- CLI tools.
- Backend-only services and APIs.
- Workers and scheduled jobs.
- Libraries and SDKs.
- Browser extensions.
- AI agents.
- Infrastructure repositories.
- Monorepos.

The README must say that representation in the model does not mean every shape has equivalent deterministic coverage.

## Roadmap presentation

The public roadmap groups work by outcomes and does not promise dates:

- Broader production-readiness checks.
- Framework and provider adapters.
- Deployment and operational verification.
- More agent-runtime acceptance testing.
- Remediation workflows.
- Deeper artifact and evidence packs.

`ROADMAP.md` distinguishes committed near-term work from exploratory directions without turning unimplemented checks into product claims.

## Repository trust files

The launch repository contains:

```text
README.md
DISCLAIMER.md
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
SUPPORT.md
ROADMAP.md

docs/
  examples/sample-report.md
  installation/
    codex.md
    claude-code.md
    cursor.md
    windsurf.md
    agent-skills.md

.github/
  ISSUE_TEMPLATE/
    bug-report.yml
    agent-compatibility.yml
    new-check-proposal.yml
    config.yml
  PULL_REQUEST_TEMPLATE.md
  dependabot.yml
  workflows/ci.yml
```

The issue forms separate product defects, agent-compatibility evidence, and proposals for production checks. `SECURITY.md` directs suspected vulnerabilities to private reporting rather than public issues. `SUPPORT.md` distinguishes usage questions from defects and security reports.

## GitHub repository settings

Create a public repository named `post-vibe-clarity` under the user's personal GitHub account with:

- Description: `Evidence-backed production preparation for vibe-coded apps and projects.`
- Topics: `vibe-coding`, `production`, `production-readiness`, `agent-skills`, `launch-checklist`, `developer-tools`, `security`, and `open-source`.
- Issues enabled.
- Discussions, wiki, projects, and GitHub Pages disabled initially.
- Squash merging enabled as the default merge method.
- Automatic deletion of merged head branches enabled.
- Default branch protection or a ruleset that blocks force pushes and deletion and requires the foundation CI check.
- Dependabot vulnerability alerts and updates enabled.
- Secret scanning, security advisories, and private vulnerability reporting enabled where the account and repository support them. Any unavailable control is recorded as unavailable rather than presented as configured.

The social-preview asset uses a restrained PostVibeClarity wordmark, the production-preparation tagline, and no emojis, security seals, readiness seals, or certification imagery.

Repository creation does not authorize later settings mutations. After creation, the operator must present the exact target and effect and obtain a separate explicit user approval before each of these four state classes: repository settings and topics; security controls, including vulnerability alerts; branch protection; and manual social-preview upload. These gates cannot be combined with repository-creation approval or with one another.

After approved changes, the runbook audits repository identity and features, all topics, merge methods, Projects, vulnerability alerts, secret scanning and push protection, private vulnerability reporting, branch protection, the required CI workflow, and the manual social preview. Each requested control is recorded as `configured`, `unavailable` with the observed response and date, or `not approved`; unsupported controls are never claimed as enabled.

## Release presentation

Create a `v0.1.0` GitHub release only after the implementation is merged into the default branch and the full verification workflow succeeds there. Describe it as the stable foundation release and link to current coverage, installation guides, known limitations, and the disclaimer.

The release must not say that PostVibeClarity makes projects production-ready or fully secures them.

## Verification and acceptance criteria

Implementation is complete when:

1. The README follows the approved information architecture and contains no emojis.
2. The short and full disclaimers are present in the specified locations and match the generated-report boundary.
3. Every installation guide has install, verify, invoke, update, and uninstall sections.
4. Every compatibility label has recorded first-party documentation or runtime evidence.
5. The sample report validates against the current report schema and contains no controlled secret values.
6. Internal README and community-file links pass an automated link check.
7. The CI workflow runs the existing `pnpm verify:foundation` gate on supported pull requests and default-branch pushes.
8. Issue forms parse as valid GitHub issue-form YAML.
9. The existing foundation test suite remains green.
10. The final repository settings are audited against this specification before the `v0.1.0` release is published.
11. Installation and update examples use a pinned source revision and preserve or visibly reconcile existing project-scoped skill content.
12. Repository settings, security controls, branch protection, and social-preview upload each have a distinct target/effect approval gate.

## Out of scope

- A GitHub Pages site.
- A hosted web application.
- Certification, scoring, or readiness verdicts.
- Claims of complete security hardening.
- Paid support or sponsorship setup.
- A universal marketplace package for every agent host.
- New production-readiness checks unrelated to the repository-homepage launch.

## First-party references

- [OpenAI: Build skills](https://developers.openai.com/codex/skills)
- [GitHub: Customizing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository)
- [GitHub: Community profiles for public repositories](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
- [GitHub: Issue and pull request templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates)
- [GitHub: About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
