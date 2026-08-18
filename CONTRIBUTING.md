# Contributing to PostVibeClarity

Thanks for helping improve PostVibeClarity. Contributions should strengthen the evidence that the project provides while keeping its reported limits clear. Before opening a change, read the [README](README.md), [foundation coverage map](docs/foundation-coverage.md), and [disclaimer](DISCLAIMER.md).

## Ways to contribute

You can report a reproducible product defect, improve documentation, add a test or fixture, clarify a coverage boundary, or share an agent compatibility result. For routine questions and report routing, see [SUPPORT.md](SUPPORT.md). For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of creating a public issue.

## Development setup

Use Node.js 24 or newer and pnpm. Install dependencies and run the required foundation gate before submitting a change:

```bash
pnpm install --frozen-lockfile
pnpm verify:foundation
```

The verification command builds the project, runs its tests, and creates a review report against the maintained fixture. Do not replace it with a partial command when you are claiming that a contribution is ready.

## Evidence requirements

Changes should state what behavior or documentation boundary they affect and include Evidence that the change was checked. For code changes, include the relevant test or verification output. For documentation, compatibility, or coverage changes, link to the source material, fixture, command output, or other reproducible basis for the claim.

Keep findings, coverage, and uncertainty distinct. A successful check records only the evidence available to that check; it does not prove that related risks are absent.

## Adding or changing a check

Describe the project signals a check uses, the conditions under which it applies, its output labels, and what it leaves unverified. Add or update fixtures and automated tests that show both the expected finding and the boundary behavior. Do not broaden a check's conclusion beyond the evidence it records.

When a change affects a skill, sidecar, or report schema, validate the documented ownership and catalog identity as well as the resulting report. Preserve redaction and read-only behavior unless the project explicitly changes those contracts.

## Agent compatibility reports

Submit agent compatibility results through the Agent compatibility form described in [SUPPORT.md](SUPPORT.md). Include the agent and version, operating system, installation path, invocation used, date, observed result, and any relevant sanitized logs. Report the result using the repository labels: Tested, Documented, Format compatible, or Not verified. A single result must not become a blanket compatibility claim.

## Pull requests

Keep pull requests focused. Explain the problem, the proposed change, the evidence supporting it, and the verification you ran. Update affected documentation and tests in the same pull request. Maintainers may ask for a smaller scope, clearer evidence, or an explicit statement of what remains unverified.

## Maintainer repository settings

Maintainers applying GitHub presentation, security controls, branch protection, CI audits, or release gates should follow the [repository settings runbook](docs/repository-settings.md). This is an operator-only procedure; it does not make claims about application readiness or security.

## No certification claims

PostVibeClarity provides evidence and next actions; it does not certify that a project is production-ready, secure, compliant, or defect-free. Do not describe a check, report, fixture, or compatibility result as a certification, guarantee, complete audit, or proof that risk has been eliminated.
