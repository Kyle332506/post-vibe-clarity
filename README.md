# PostVibeClarity

## Prepare vibe-coded projects for production with evidence—not guesswork.

PostVibeClarity reviews a project's visible launch risks and can optionally run its declared build, type-check, lint, and test commands after exact approval.

`v0.3 · Launch operations` · [Apache-2.0](LICENSE)

[Install](#install-with-your-coding-agent) · [Example project](examples/launch-candidate/README.md) · [Example report](docs/examples/sample-report.md) · [Current coverage](docs/foundation-coverage.md)

PostVibeClarity reduces uncertainty. It does not guarantee production readiness or complete security, and it does not certify that a project is compliant or free of defects.

Every report retains this boundary: This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.

## Install with your coding agent

Paste this into your coding agent:

> Install PostVibeClarity for this project from `github.com/Kyle332506/post-vibe-clarity` at `v0.3.0`. Follow the guide for this agent, install only inside the current project, verify all six skills are available, and run a read-only launch review. Do not change project files during the review.

Installation is project-scoped and pinned to a release tag plus its resolved commit.

| Agent | Project path | Invocation | Evidence label |
| --- | --- | --- | --- |
| [Codex](docs/installation/codex.md) | `.agents/skills` | `$post-vibe-clarity` | Documented |
| [Claude Code](docs/installation/claude-code.md) | `.claude/skills` | `/post-vibe-clarity` | Documented |
| [Cursor](docs/installation/cursor.md) | `.agents/skills` | `/post-vibe-clarity` | Documented |
| [Windsurf](docs/installation/windsurf.md) | `.agents/skills` | `@post-vibe-clarity` | Documented |
| [Other Agent Skills hosts](docs/installation/agent-skills.md) | Host-defined | Host-defined | Format compatible |

The [compatibility manifest](docs/installation/compatibility.yaml) records the pinned release, six canonical skills, and evidence labels. Documented and Format compatible are packaging claims, not runtime acceptance claims.

## Important limitation

**Important:** PostVibeClarity supports production preparation, but it does not guarantee that a project is production-ready. It cannot find every vulnerability, prove that security is fully hardened, ensure legal or regulatory compliance, or eliminate operational failures. A report only describes the checks performed, the evidence found, and the areas that remain unverified.

Read the complete [disclaimer](DISCLAIMER.md) before relying on a report.

## Review first, verify only when approved

A read-only review inspects files without running project commands:

```bash
postvibe review . --skills skills --format markdown
```

Optional local verification has two separate steps. First create a plan:

```bash
postvibe plan . --skills skills --output .postvibe/verification-plan.json
```

Inspect the printed commands and containment warning. Approve the exact plan fingerprint, then copy that fingerprint into the execute command:

```bash
postvibe execute .postvibe/verification-plan.json --approve <exact-fingerprint> --output .postvibe --format markdown
```

Declared commands only are eligible to run. For a Node project, PostVibeClarity recognizes declared `build`, `typecheck` or `type-check`, `lint`, and `test` scripts when package-manager evidence is unambiguous. It never guesses a command from the framework alone. For example:

```json
{
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

Non-Node projects and projects needing explicit commands can declare portable configuration in `postvibe.verification.yaml`:

```yaml
schemaVersion: "0.1"
commands:
  - id: backend-tests
    category: test
    argv: ["pytest", "-q"]
    cwd: "."
    timeoutSeconds: 600
```

Regenerate the plan after adding this file, inspect it, and approve its new exact fingerprint before execution. An `--exclude <command-id>` option creates a new plan; exclusions remain unverified and stay visible in the evidence.

`.postvibe/` is an optional artifact location. PostVibeClarity never adds it to `.gitignore`, stages it, commits it, or removes it. Choose another plan or report path if that better matches the project.

### Local-script containment boundary

The local executor is not a security sandbox. Approved scripts run with the current user's privileges and may read files, load `.env` files themselves, change files, start processes, or use the network. PostVibeClarity filters sensitive inherited environment names, bounds and redacts captured output, records visible file changes, and enforces approved timeouts, but it does not block network or out-of-project filesystem access. It does not clean up changes made by scripts.

Passing commands are evidence only for the exact commands that ran. They do not prove production readiness or complete security, and they do not establish that tests are complete or representative of production behavior.

## How it works

```text
Read-only review
      |
      v
Optional plan with exact declared commands
      |
      v
Approve one exact fingerprint
      |
      v
Execute that unchanged plan
      |
      v
Report passes, failures, changes, exclusions, and unknowns
```

Changing a command, timeout, working directory, source declaration, inspected input, project root, or executor setting makes the plan stale and requires a new fingerprint.

## Example report

The renderer-backed [sample report](docs/examples/sample-report.md) is regenerated from the real `examples/launch-candidate/before` acceptance fixture. It shows read-only findings, approved command evidence, changed paths, exclusions, and remaining gaps. The [before-and-after launch candidate](examples/launch-candidate/README.md) provides a runnable walkthrough.

Reports use plain action and outcome labels. They do not calculate an overall numeric readiness score, and a report with no findings is not a launch verdict.

## Current coverage

The [foundation coverage map](docs/foundation-coverage.md) is the source of truth.

| Capability | v0.3 status | Boundary |
| --- | --- | --- |
| Project discovery | Automated for documented Node and static-project signals | Other or ambiguous shapes require guided classification |
| Secret exposure checks | Automated, redacted scanning with a manual fallback | Not a complete security audit or proof of hardening |
| Privacy-notice check | Automated when personal-data signals are detected | Not legal advice or a legal-sufficiency determination |
| Repository operations basics | Six deterministic repository-only operations checks cover release, rollback, monitoring response, applicable health and backup evidence, and maintenance ownership | Documentation is content-checked; missing or vague evidence is unverified, and live/provider behavior is not checked |
| Local command evidence | Optional Level 1 plan and execution for declared commands | Local processes are not strongly sandboxed |
| Evidence reports | Markdown and JSON reports with explicit unknowns | No overall numeric readiness score or launch verdict |
| Agent compatibility | Evidence labels distinguish documentation from acceptance | No blanket cross-agent runtime claim |

## Project shapes represented by the architecture

The model can represent web, native mobile, desktop, CLI, backend, worker, library, extension, AI-agent, infrastructure, and monorepo projects. Representation does not mean equivalent deterministic coverage. Detected but uncovered workspaces remain explicit gaps, and a passing aggregate command proves only that the declared command completed.

## Foundation scope

The v0.3 foundation provides read-only discovery and eight Level 0 checks, validated evidence reports, six portable skills, and optional Level 1 verification of declared commands. The six operations checks inspect deterministic repository evidence only. The executor records the approved fingerprint, results, output boundaries, visible file changes, exclusions, and remaining gaps.

Provider and production verification are not implemented. The foundation does not inspect live deployment state or provider accounts, run recovery exercises, perform performance testing, provide legal-sufficiency review or deep shape packs, apply code or configuration remedies, or provide strong sandboxing.

## Requirements

Deterministic tooling requires Node.js 24 or newer and pnpm. The `SKILL.md` manual workflows remain usable by compatible hosts when the local CLI cannot run.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm check
pnpm test:executor
```

The CLI contracts are:

```text
postvibe review [project-path] --skills <skills-path> --format <markdown|json> [--output <directory>]
postvibe plan [project-path] [--skills <skills-path>] [--exclude <command-id>] --output <plan-file>
postvibe execute <plan-file> --approve <fingerprint> --output <directory> [--format <markdown|json>]
```

## Roadmap

Near-term directions include:

- Broader production-readiness checks.
- Full live and provider operations verification, recovery exercises, and performance evidence.
- Code and configuration remedies with separately designed authorization boundaries.
- Stronger containment options and deeper shape-specific evidence packs.
- Additional agent-runtime acceptance.

These are directions, not current coverage or promised dates. Read the [full roadmap](ROADMAP.md).

## License

PostVibeClarity is available under the [Apache License 2.0](LICENSE).

## Community and project policies

- [CONTRIBUTING.md](CONTRIBUTING.md) explains contribution and verification requirements.
- [SUPPORT.md](SUPPORT.md) routes usage questions, defects, compatibility results, security reports, and conduct concerns.
- [SECURITY.md](SECURITY.md) explains private vulnerability reporting and the security support boundary.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) describes community standards.
- [ROADMAP.md](ROADMAP.md) describes planned work and current scope.
- [DISCLAIMER.md](DISCLAIMER.md) states the limits of the evidence.
- [LICENSE](LICENSE) contains the Apache License 2.0.
